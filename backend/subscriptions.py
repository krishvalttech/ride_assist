"""Subscription and Razorpay payment integration for Ride Assist.

Provides:
- Canonical plan catalogue with server-enforced INR pricing in paise.
- Razorpay order creation and server-side HMAC signature verification.
- Authoritative payment capture verification.
- Webhook signature validation, idempotency, and reconciliation.
- User entitlement lifecycle (activation, stacking/extension, expiry, lifetime).
- Authoritative entitlement checking for tracking access control.
"""
import hashlib
import hmac
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import razorpay
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Canonical Subscription Plans
# Monetary values stored in integer paise:
# ₹30   = 3000 paise
# ₹170  = 17000 paise
# ₹500  = 50000 paise
# ₹5000 = 500000 paise
# -----------------------------------------------------------------------------
CANONICAL_PLANS: Dict[str, Dict[str, Any]] = {
    "daily": {
        "plan_id": "daily",
        "name": "Daily Pass",
        "amount_paise": 3000,
        "price_inr": 30,
        "currency": "INR",
        "duration_type": "hours",
        "duration_value": 24,
        "description": "24 hours of unlimited ride tracking & auto-accept",
        "features": [
            "24 hours unlimited tracking",
            "Rapido, Uber & Ola monitoring",
            "Auto-accept assistance",
            "Spoken voice alerts",
        ],
        "enabled": True,
    },
    "weekly": {
        "plan_id": "weekly",
        "name": "Weekly Pass",
        "amount_paise": 17000,
        "price_inr": 170,
        "currency": "INR",
        "duration_type": "days",
        "duration_value": 7,
        "description": "7 days of unlimited ride tracking & auto-accept",
        "features": [
            "7 days unlimited tracking",
            "All driver platforms supported",
            "Full profit & filter rules",
            "Priority notification alerts",
        ],
        "enabled": True,
    },
    "monthly": {
        "plan_id": "monthly",
        "name": "Monthly Pass",
        "amount_paise": 50000,
        "price_inr": 500,
        "currency": "INR",
        "duration_type": "months",
        "duration_value": 1,
        "description": "One calendar month with month-end date protection",
        "features": [
            "Full calendar month validity",
            "All driver platforms supported",
            "Daily & weekly earnings analytics",
            "Auto-accept assistance",
        ],
        "enabled": True,
    },
    "lifetime": {
        "plan_id": "lifetime",
        "name": "Lifetime Pass",
        "amount_paise": 500000,
        "price_inr": 5000,
        "currency": "INR",
        "duration_type": "lifetime",
        "duration_value": 0,
        "description": "Lifetime access with no periodic expiration",
        "features": [
            "Permanent unlimited access",
            "No recurring payments or renewals",
            "All future platform updates",
            "Priority support & telemetry",
        ],
        "enabled": True,
    },
}

# -----------------------------------------------------------------------------
# Configuration Helpers
# -----------------------------------------------------------------------------
def get_razorpay_key_id() -> str:
    return os.environ.get("RAZORPAY_KEY_ID", "rzp_test_rideassist_mock")


def get_razorpay_key_secret() -> str:
    return os.environ.get("RAZORPAY_KEY_SECRET", "mock_key_secret_for_tests_12345")


def get_razorpay_webhook_secret() -> str:
    return os.environ.get("RAZORPAY_WEBHOOK_SECRET", "mock_webhook_secret_for_tests_12345")


def get_razorpay_client() -> Optional[razorpay.Client]:
    key_id = get_razorpay_key_id()
    key_secret = get_razorpay_key_secret()
    if key_id and key_secret and not any(m in key_id.lower() for m in ("mock", "dummy")):
        try:
            return razorpay.Client(auth=(key_id, key_secret))
        except Exception as e:
            logger.warning("Could not initialize Razorpay client: %s", e)
    return None


# -----------------------------------------------------------------------------
# Pydantic Schemas
# -----------------------------------------------------------------------------
class CreateOrderIn(BaseModel):
    plan_id: str


class CreateOrderOut(BaseModel):
    local_order_id: str
    razorpay_order_id: str
    amount_paise: int
    price_inr: int
    currency: str
    key_id: str
    plan_id: str
    plan_name: str
    user_email: str


class VerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class SubscriptionStatusOut(BaseModel):
    has_access: bool
    entitlement_status: str
    active_plan: Optional[str] = None
    plan_name: Optional[str] = None
    starts_at: Optional[str] = None
    expires_at: Optional[str] = None
    remaining_seconds: Optional[int] = None
    server_time: str
    reason: Optional[str] = None


# -----------------------------------------------------------------------------
# Date Arithmetic & Entitlement Helpers
# -----------------------------------------------------------------------------
def compute_expiration(starts_at: datetime, plan: Dict[str, Any]) -> Optional[datetime]:
    """Computes expiration date with accurate calendar arithmetic."""
    duration_type = plan.get("duration_type")
    duration_value = plan.get("duration_value", 0)

    if duration_type == "hours":
        return starts_at + timedelta(hours=duration_value)
    elif duration_type == "days":
        return starts_at + timedelta(days=duration_value)
    elif duration_type == "months":
        # Calendar month math: Jan 31 + 1 month = Feb 28/29; Mar 31 + 1 month = Apr 30
        return starts_at + relativedelta(months=+duration_value)
    elif duration_type == "lifetime":
        return None
    return starts_at + timedelta(days=30)


def verify_razorpay_signature(order_id: str, payment_id: str, signature: str, secret: str) -> bool:
    """Verifies Razorpay payment signature using constant-time comparison."""
    if not order_id or not payment_id or not signature or not secret:
        return False
    message = f"{order_id}|{payment_id}".encode("utf-8")
    generated = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return secrets.compare_digest(generated, signature)


def verify_webhook_signature(raw_body: bytes, signature: str, webhook_secret: str) -> bool:
    """Verifies Razorpay webhook signature against raw request body."""
    if not raw_body or not signature or not webhook_secret:
        return False
    generated = hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return secrets.compare_digest(generated, signature)


async def check_user_subscription(db, user_id: str) -> Dict[str, Any]:
    """Checks user entitlement authoritatively against server time."""
    now = datetime.now(timezone.utc)
    entitlement = await db.user_entitlements.find_one({"user_id": user_id}, {"_id": 0})
    if not entitlement:
        return {
            "has_access": False,
            "entitlement_status": "none",
            "active_plan": None,
            "plan_name": None,
            "starts_at": None,
            "expires_at": None,
            "remaining_seconds": 0,
            "server_time": now.isoformat(),
            "reason": "No active subscription pass found. Please purchase a pass to start tracking.",
        }

    status_str = entitlement.get("entitlement_status")
    plan_id = entitlement.get("plan_id")
    plan_info = CANONICAL_PLANS.get(plan_id, {})
    plan_name = plan_info.get("name", plan_id.title() if plan_id else None)

    if status_str == "lifetime_active":
        return {
            "has_access": True,
            "entitlement_status": "lifetime_active",
            "active_plan": plan_id or "lifetime",
            "plan_name": "Lifetime Pass",
            "starts_at": entitlement["starts_at"].isoformat() if entitlement.get("starts_at") else None,
            "expires_at": None,
            "remaining_seconds": None,
            "server_time": now.isoformat(),
            "reason": None,
        }

    if status_str != "active":
        return {
            "has_access": False,
            "entitlement_status": status_str or "none",
            "active_plan": plan_id,
            "plan_name": plan_name,
            "starts_at": entitlement["starts_at"].isoformat() if entitlement.get("starts_at") else None,
            "expires_at": entitlement["expires_at"].isoformat() if entitlement.get("expires_at") else None,
            "remaining_seconds": 0,
            "server_time": now.isoformat(),
            "reason": f"Subscription pass is {status_str}.",
        }

    expires_at = entitlement.get("expires_at")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at > now:
            remaining = int((expires_at - now).total_seconds())
            return {
                "has_access": True,
                "entitlement_status": "active",
                "active_plan": plan_id,
                "plan_name": plan_name,
                "starts_at": entitlement["starts_at"].isoformat() if entitlement.get("starts_at") else None,
                "expires_at": expires_at.isoformat(),
                "remaining_seconds": remaining,
                "server_time": now.isoformat(),
                "reason": None,
            }
        else:
            # Expired: update status in background
            if status_str == "active":
                await db.user_entitlements.update_one(
                    {"user_id": user_id, "entitlement_status": "active"},
                    {"$set": {"entitlement_status": "expired", "updated_at": now}},
                )
            return {
                "has_access": False,
                "entitlement_status": "expired",
                "active_plan": plan_id,
                "plan_name": plan_name,
                "starts_at": entitlement["starts_at"].isoformat() if entitlement.get("starts_at") else None,
                "expires_at": expires_at.isoformat(),
                "remaining_seconds": 0,
                "server_time": now.isoformat(),
                "reason": f"Subscription expired on {expires_at.strftime('%b %d, %Y %H:%M UTC')}. Please renew to continue tracking.",
            }

    return {
        "has_access": False,
        "entitlement_status": status_str or "none",
        "active_plan": plan_id,
        "plan_name": plan_name,
        "starts_at": None,
        "expires_at": None,
        "remaining_seconds": 0,
        "server_time": now.isoformat(),
        "reason": f"Subscription is {status_str}.",
    }


async def grant_or_extend_entitlement(
    db, user_id: str, plan_id: str, payment_id: str
) -> Dict[str, Any]:
    """Atomically grants or extends user entitlement based on stacking rules."""
    now = datetime.now(timezone.utc)
    plan = CANONICAL_PLANS.get(plan_id)
    if not plan:
        raise ValueError(f"Unknown plan: {plan_id}")

    existing = await db.user_entitlements.find_one({"user_id": user_id})

    # Rule 1: Lifetime access cannot be overwritten by time-limited passes
    if existing and existing.get("entitlement_status") == "lifetime_active":
        if plan_id != "lifetime":
            logger.info("User %s already has lifetime access; time-limited pass ignored", user_id)
            return existing

    # Rule 2: Purchasing lifetime upgrades user immediately
    if plan_id == "lifetime":
        entitlement = {
            "entitlement_id": str(uuid.uuid4()),
            "user_id": user_id,
            "plan_id": "lifetime",
            "entitlement_status": "lifetime_active",
            "starts_at": existing.get("starts_at", now) if existing else now,
            "expires_at": None,
            "source_payment_id": payment_id,
            "updated_at": now,
        }
        if not existing:
            entitlement["created_at"] = now
        await db.user_entitlements.update_one(
            {"user_id": user_id},
            {"$set": entitlement},
            upsert=True,
        )
        return entitlement

    # Rule 3: Stacking time-limited passes
    base_time = now
    if existing and existing.get("entitlement_status") == "active":
        existing_expires = existing.get("expires_at")
        if existing_expires:
            if existing_expires.tzinfo is None:
                existing_expires = existing_expires.replace(tzinfo=timezone.utc)
            if existing_expires > now:
                base_time = existing_expires

    new_expires_at = compute_expiration(base_time, plan)
    starts_at = existing.get("starts_at", now) if existing and existing.get("entitlement_status") == "active" else now

    entitlement = {
        "entitlement_id": existing.get("entitlement_id") if existing else str(uuid.uuid4()),
        "user_id": user_id,
        "plan_id": plan_id,
        "entitlement_status": "active",
        "starts_at": starts_at,
        "expires_at": new_expires_at,
        "source_payment_id": payment_id,
        "updated_at": now,
    }
    if not existing:
        entitlement["created_at"] = now

    await db.user_entitlements.update_one(
        {"user_id": user_id},
        {"$set": entitlement},
        upsert=True,
    )
    return entitlement


# -----------------------------------------------------------------------------
# Router Builder
# -----------------------------------------------------------------------------
def build_subscriptions_router(db, current_user_dep) -> APIRouter:
    router = APIRouter(prefix="/subscriptions")

    @router.get("/plans")
    async def list_plans():
        """Lists active canonical plans with display pricing and features."""
        return [
            {
                "plan_id": p["plan_id"],
                "name": p["name"],
                "amount_paise": p["amount_paise"],
                "price_inr": p["price_inr"],
                "currency": p["currency"],
                "duration_type": p["duration_type"],
                "duration_value": p["duration_value"],
                "description": p["description"],
                "features": p["features"],
            }
            for p in CANONICAL_PLANS.values()
            if p["enabled"]
        ]

    @router.post("/orders", response_model=CreateOrderOut, status_code=status.HTTP_201_CREATED)
    async def create_order(body: CreateOrderIn, user: dict = Depends(current_user_dep)):
        """Creates a pending payment record and initializes Razorpay Order."""
        plan_id = body.plan_id.lower().strip()
        plan = CANONICAL_PLANS.get(plan_id)
        if not plan or not plan.get("enabled"):
            raise HTTPException(400, f"Invalid plan: {body.plan_id}")

        # Check if user already holds lifetime access
        entitlement = await db.user_entitlements.find_one({"user_id": user["user_id"]})
        if entitlement and entitlement.get("entitlement_status") == "lifetime_active":
            raise HTTPException(400, "You already have Lifetime access. No additional purchases are required.")

        local_order_id = f"ord_{uuid.uuid4().hex[:16]}"
        amount_paise = plan["amount_paise"]
        currency = plan["currency"]

        rzp_client = get_razorpay_client()
        if rzp_client:
            try:
                rzp_order = rzp_client.order.create({
                    "amount": amount_paise,
                    "currency": currency,
                    "receipt": local_order_id,
                    "notes": {
                        "user_id": user["user_id"],
                        "email": user["email"],
                        "plan_id": plan_id,
                    },
                })
                razorpay_order_id = rzp_order["id"]
            except Exception as e:
                logger.error("Razorpay order creation failed: %s", e)
                raise HTTPException(502, f"Payment provider error: {str(e)}")
        else:
            # Deterministic test mode order ID for development and testing
            razorpay_order_id = f"order_test_{local_order_id}"

        now = datetime.now(timezone.utc)
        payment_record = {
            "payment_id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "plan_id": plan_id,
            "local_order_id": local_order_id,
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": None,
            "razorpay_signature": None,
            "amount_paise": amount_paise,
            "currency": currency,
            "payment_status": "created",
            "created_at": now,
            "updated_at": now,
        }
        await db.payments.insert_one(payment_record)

        return CreateOrderOut(
            local_order_id=local_order_id,
            razorpay_order_id=razorpay_order_id,
            amount_paise=amount_paise,
            price_inr=plan["price_inr"],
            currency=currency,
            key_id=get_razorpay_key_id(),
            plan_id=plan_id,
            plan_name=plan["name"],
            user_email=user["email"],
        )

    @router.post("/verify-payment")
    async def verify_payment(body: VerifyPaymentIn, user: dict = Depends(current_user_dep)):
        """Verifies Razorpay payment signature and authoritative capture before activating entitlement."""
        order_id = body.razorpay_order_id.strip()
        payment_id = body.razorpay_payment_id.strip()
        signature = body.razorpay_signature.strip()

        # Step 1: Find local payment record
        payment = await db.payments.find_one({"razorpay_order_id": order_id})
        if not payment:
            raise HTTPException(404, "Order not found")

        # Step 2: Ensure order belongs to authenticated user
        if payment["user_id"] != user["user_id"]:
            raise HTTPException(403, "Payment order does not belong to this user")

        # Step 3: Verify Razorpay signature server-side
        key_secret = get_razorpay_key_secret()
        sig_valid = verify_razorpay_signature(order_id, payment_id, signature, key_secret)
        if not sig_valid:
            logger.warning("Invalid payment signature for order %s and payment %s", order_id, payment_id)
            raise HTTPException(400, "Invalid payment signature")

        # Step 4: Verify payment capture status with Razorpay API (or test simulation)
        rzp_client = get_razorpay_client()
        now = datetime.now(timezone.utc)
        if rzp_client:
            try:
                pay_data = rzp_client.payment.fetch(payment_id)
                # Verify amount and currency
                if pay_data.get("amount") != payment["amount_paise"]:
                    raise HTTPException(400, "Payment amount mismatch")
                if pay_data.get("currency") != payment["currency"]:
                    raise HTTPException(400, "Payment currency mismatch")

                status_str = pay_data.get("status")
                if status_str == "authorized":
                    # Capture payment if not auto-captured
                    pay_data = rzp_client.payment.capture(payment_id, payment["amount_paise"])
                    status_str = pay_data.get("status")

                if status_str != "captured":
                    raise HTTPException(400, f"Payment is not captured: status is {status_str}")
            except HTTPException:
                raise
            except Exception as e:
                logger.error("Razorpay verification query failed: %s", e)
                raise HTTPException(502, f"Failed to confirm payment with provider: {str(e)}")

        # Step 5: Mark payment as captured in database
        await db.payments.update_one(
            {"razorpay_order_id": order_id},
            {
                "$set": {
                    "razorpay_payment_id": payment_id,
                    "razorpay_signature": signature,
                    "payment_status": "captured",
                    "captured_at": now,
                    "updated_at": now,
                }
            },
        )

        # Step 6: Grant or extend entitlement
        entitlement = await grant_or_extend_entitlement(
            db, user["user_id"], payment["plan_id"], payment["payment_id"]
        )

        sub_status = await check_user_subscription(db, user["user_id"])
        return {
            "success": True,
            "message": "Payment verified and subscription activated successfully",
            "entitlement": sub_status,
        }

    @router.get("/me", response_model=SubscriptionStatusOut)
    async def get_my_subscription(user: dict = Depends(current_user_dep)):
        """Authoritative endpoint for tracking access control: returns active status and expiry."""
        sub = await check_user_subscription(db, user["user_id"])
        return SubscriptionStatusOut(**sub)

    @router.get("/history")
    async def get_purchase_history(user: dict = Depends(current_user_dep)):
        """Returns purchase and payment history for the authenticated user."""
        cursor = db.payments.find(
            {"user_id": user["user_id"]},
            {"_id": 0}
        ).sort("created_at", -1)
        payments = await cursor.to_list(100)
        formatted = []
        for p in payments:
            plan_info = CANONICAL_PLANS.get(p.get("plan_id"), {})
            created_at = p.get("created_at")
            formatted.append({
                "payment_id": p.get("payment_id"),
                "plan_id": p.get("plan_id"),
                "plan_name": plan_info.get("name", p.get("plan_id")),
                "amount_paise": p.get("amount_paise"),
                "amount_inr": (p.get("amount_paise") or 0) / 100,
                "currency": p.get("currency", "INR"),
                "payment_status": p.get("payment_status"),
                "razorpay_order_id": p.get("razorpay_order_id"),
                "razorpay_payment_id": p.get("razorpay_payment_id"),
                "created_at": created_at.isoformat() if created_at else None,
            })
        return formatted

    return router


def build_webhooks_router(db) -> APIRouter:
    router = APIRouter(prefix="/webhooks")

    @router.post("/razorpay")
    async def handle_razorpay_webhook(
        request: Request,
        x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
    ):
        """Processes asynchronous Razorpay webhook events with signature validation and idempotency."""
        if not x_razorpay_signature:
            raise HTTPException(400, "Missing X-Razorpay-Signature header")

        raw_body = await request.body()
        webhook_secret = get_razorpay_webhook_secret()
        if not verify_webhook_signature(raw_body, x_razorpay_signature, webhook_secret):
            logger.warning("Invalid Razorpay webhook signature")
            raise HTTPException(400, "Invalid webhook signature")

        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON payload")

        event_id = payload.get("id")
        event_type = payload.get("event")
        if not event_id or not event_type:
            raise HTTPException(400, "Missing event identifier or type")

        # Idempotency check: duplicate webhook delivery suppression
        existing = await db.payment_webhook_events.find_one({"event_id": event_id})
        if existing:
            return {"status": "ok", "message": "Event already processed"}

        now = datetime.now(timezone.utc)
        webhook_record = {
            "event_id": event_id,
            "event_type": event_type,
            "processing_status": "received",
            "payload": payload,
            "received_at": now,
        }
        await db.payment_webhook_events.insert_one(webhook_record)

        try:
            # Process event based on type
            if event_type in ("order.paid", "payment.captured"):
                entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
                if not entity and event_type == "order.paid":
                    entity = payload.get("payload", {}).get("order", {}).get("entity", {})

                order_id = entity.get("order_id") or entity.get("id")
                payment_id = entity.get("id") if event_type == "payment.captured" else None

                if order_id:
                    payment = await db.payments.find_one({"razorpay_order_id": order_id})
                    if payment:
                        update_fields = {"payment_status": "captured", "updated_at": now}
                        if payment_id and not payment.get("razorpay_payment_id"):
                            update_fields["razorpay_payment_id"] = payment_id
                        await db.payments.update_one(
                            {"razorpay_order_id": order_id},
                            {"$set": update_fields}
                        )
                        # Activate entitlement
                        await grant_or_extend_entitlement(
                            db, payment["user_id"], payment["plan_id"], payment["payment_id"]
                        )
            elif event_type == "payment.failed":
                entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
                order_id = entity.get("order_id")
                error_desc = entity.get("error_description", "Payment failed")
                if order_id:
                    await db.payments.update_one(
                        {"razorpay_order_id": order_id},
                        {"$set": {"payment_status": "failed", "failure_reason": error_desc, "updated_at": now}}
                    )
            elif event_type == "refund.processed":
                entity = payload.get("payload", {}).get("refund", {}).get("entity", {})
                payment_id = entity.get("payment_id")
                if payment_id:
                    payment = await db.payments.find_one({"razorpay_payment_id": payment_id})
                    if payment:
                        await db.payments.update_one(
                            {"payment_id": payment["payment_id"]},
                            {"$set": {"payment_status": "refunded", "updated_at": now}}
                        )
                        # Revoke active entitlement if source payment was refunded
                        await db.user_entitlements.update_one(
                            {"user_id": payment["user_id"]},
                            {"$set": {"entitlement_status": "revoked", "updated_at": now}}
                        )

            await db.payment_webhook_events.update_one(
                {"event_id": event_id},
                {"$set": {"processing_status": "processed", "processed_at": datetime.now(timezone.utc)}}
            )
        except Exception as e:
            logger.error("Webhook processing error for event %s: %s", event_id, e)
            await db.payment_webhook_events.update_one(
                {"event_id": event_id},
                {"$set": {"processing_status": "failed", "error_code": str(e)}}
            )

        return {"status": "ok"}

    return router


async def ensure_subscription_indexes(db) -> None:
    """Creates database indexes for subscriptions, payments, and webhooks."""
    await db.subscription_plans.create_index("plan_id", unique=True)
    await db.payments.create_index("local_order_id", unique=True)
    await db.payments.create_index("razorpay_order_id", unique=True)
    await db.payments.create_index("razorpay_payment_id", unique=True, sparse=True)
    await db.payments.create_index([("user_id", 1), ("created_at", -1)])
    await db.user_entitlements.create_index("user_id", unique=True)
    await db.user_entitlements.create_index([("entitlement_status", 1), ("expires_at", 1)])
    await db.payment_webhook_events.create_index("event_id", unique=True)


async def ensure_canonical_plans(db) -> None:
    """Seeds or synchronizes canonical plans into the database."""
    now = datetime.now(timezone.utc)
    for plan_id, plan_data in CANONICAL_PLANS.items():
        doc = dict(plan_data)
        doc["updated_at"] = now
        await db.subscription_plans.update_one(
            {"plan_id": plan_id},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
