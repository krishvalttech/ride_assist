"""Email/password auth: register, login, me, logout, forgot/reset password (6-digit emailed code)."""
import hashlib
import ipaddress
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

logger = logging.getLogger(__name__)

JWT_ALG = "HS256"
ACCESS_DAYS = 30  # drivers stay signed in on their phone; logout clears the token
RESET_MINUTES = 10
MAX_RESET_ATTEMPTS = 5
MIN_PASSWORD = 8

EMAIL_BASE_URL = "https://integrations.emergentagent.com"

bearer = HTTPBearer(auto_error=False)


def _secret() -> str:
    return os.environ["JWT_SECRET"]


# ---------------------------------------------------------------- email gate
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": os.environ["EMAIL_FROM_NAME"]}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]},
                json=payload,
            )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        try:
            code = e.response.json().get("code", "")
        except ValueError:
            code = ""
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning(f"Email paused: {code} ({e.response.status_code})")
            raise HTTPException(status_code=503, detail="Email is temporarily unavailable")
        if code == "undeliverable_recipient":
            raise HTTPException(status_code=400, detail="This email address can't receive mail")
        logger.error(f"Email send failed: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except HTTPException:
        raise
    except Exception as e:  # network errors
        logger.error(f"Email send error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")


def _reset_email_html(code: str) -> str:
    brand = escape(os.environ["EMAIL_FROM_NAME"])
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#121418">'
        f"<p>Use this code in the {brand} app to set a new password:</p>"
        f'<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{escape(code)}</p>'
        f"<p>The code expires in {RESET_MINUTES} minutes. If you did not ask for this, ignore this email.</p>"
        f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p>'
        "</td></tr></table>"
    )


# ---------------------------------------------------------------- models
class Credentials(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str
    new_password: str


def _hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


_DUMMY_HASH = _hash_pw("timing-equaliser")


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    claims = {"sub": user_id, "jti": secrets.token_hex(16), "iat": now, "exp": now + timedelta(days=ACCESS_DAYS)}
    return jwt.encode(claims, _secret(), algorithm=JWT_ALG)


def _public(user: dict) -> dict:
    return {"user_id": user["user_id"], "email": user["email"]}


def make_current_user_dep(db):
    async def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
        if not creds or creds.scheme.lower() != "bearer":
            raise HTTPException(401, "Not authenticated")
        try:
            payload = jwt.decode(creds.credentials, _secret(), algorithms=[JWT_ALG])
        except jwt.InvalidTokenError:
            raise HTTPException(401, "Invalid or expired session")
        if await db.revoked_tokens.find_one({"jti": payload.get("jti")}):
            raise HTTPException(401, "Session ended")
        user = await db.users.find_one({"user_id": payload.get("sub")}, {"_id": 0})
        if not user:
            raise HTTPException(401, "User not found")
        # A password reset ends every session issued before it.
        changed = user.get("password_changed_at")
        if changed and payload.get("iat", 0) < int(changed.replace(tzinfo=timezone.utc).timestamp()):
            raise HTTPException(401, "Session ended")
        user["_jti"], user["_exp"] = payload.get("jti"), payload.get("exp")
        return user
    return current_user


def build_router(db) -> APIRouter:
    router = APIRouter(prefix="/auth")
    current_user = make_current_user_dep(db)

    @router.post("/register", status_code=201)
    async def register(c: Credentials):
        if len(c.password) < MIN_PASSWORD:
            raise HTTPException(400, f"Password must be at least {MIN_PASSWORD} characters")
        email = c.email.lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(409, "Email already registered")
        user = {"user_id": str(uuid.uuid4()), "email": email, "password_hash": _hash_pw(c.password),
                "created_at": datetime.now(timezone.utc)}
        await db.users.insert_one(user)
        return {"access_token": _token(user["user_id"]), "user": _public(user)}

    @router.post("/login")
    async def login(c: Credentials):
        user = await db.users.find_one({"email": c.email.lower()})
        ok = _check_pw(c.password, user["password_hash"]) if user else _check_pw(c.password, _DUMMY_HASH)
        if not user or not ok:
            raise HTTPException(401, "Invalid email or password")
        return {"access_token": _token(user["user_id"]), "user": _public(user)}

    @router.get("/me")
    async def me(user: dict = Depends(current_user)):
        return _public(user)

    @router.post("/logout")
    async def logout(user: dict = Depends(current_user)):
        await db.revoked_tokens.insert_one(
            {"jti": user["_jti"], "expires_at": datetime.fromtimestamp(user["_exp"], tz=timezone.utc)}
        )
        return {"ok": True}

    @router.post("/forgot-password")
    async def forgot(body: ForgotIn):
        user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
        if user:
            code = f"{secrets.randbelow(1_000_000):06d}"
            await db.password_resets.delete_many({"user_id": user["user_id"]})
            await db.password_resets.insert_one({
                "user_id": user["user_id"], "code_hash": _hash_code(code), "attempts": 0,
                "expires_at": datetime.now(timezone.utc) + timedelta(minutes=RESET_MINUTES),
            })
            try:
                await send_email(to=user["email"], subject="Your RideAssist password reset code",
                                 html=_reset_email_html(code))
            except HTTPException as e:
                # Same reply as for unknown emails so accounts can't be discovered.
                logger.warning(f"Reset email not sent ({e.status_code})")
        return {"message": "If that email is registered, a reset code has been sent."}

    @router.post("/reset-password")
    async def reset(body: ResetIn):
        if len(body.code) != 6 or not body.code.isdigit():
            raise HTTPException(400, "Invalid or expired code")
        if len(body.new_password) < MIN_PASSWORD:
            raise HTTPException(400, f"Password must be at least {MIN_PASSWORD} characters")
        user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
        item = await db.password_resets.find_one({"user_id": user["user_id"]}) if user else None
        expires = item["expires_at"].replace(tzinfo=timezone.utc) if item else None
        if not item or item["attempts"] >= MAX_RESET_ATTEMPTS or expires < datetime.now(timezone.utc):
            raise HTTPException(400, "Invalid or expired code")
        if not secrets.compare_digest(item["code_hash"], _hash_code(body.code)):
            await db.password_resets.update_one({"_id": item["_id"]}, {"$inc": {"attempts": 1}})
            raise HTTPException(400, "Invalid or expired code")
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"password_hash": _hash_pw(body.new_password), "password_changed_at": datetime.now(timezone.utc)}},
        )
        await db.password_resets.delete_one({"_id": item["_id"]})
        return {"message": "Password updated. You can sign in now."}

    return router


async def ensure_indexes(db) -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.revoked_tokens.create_index("jti")