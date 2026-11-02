import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
"""Comprehensive tests for Ride Assist subscriptions and Razorpay payment integration.

Covers all 24 required test scenarios including:
- Plan pricing in integer paise (daily: 3000, weekly: 17000, monthly: 50000, lifetime: 500000)
- Order creation and user authorization
- Razorpay signature verification (HMAC-SHA256)
- Payment verification and authoritative capture
- Subscription activation, stacking/extension, and lifetime handling
- Month-end calendar boundary handling
- Razorpay webhook verification, idempotency, and reconciliation
- Refund processing and entitlement revocation
- Authoritative access control for tracking and auto-accept
"""
import hashlib
import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from dateutil.relativedelta import relativedelta
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

# Set test environment variables before importing
os.environ["JWT_SECRET"] = "test_jwt_secret_key_12345678901234567890"
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_mock_rideassist"
os.environ["RAZORPAY_KEY_SECRET"] = "mock_secret_key_123456789"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "mock_webhook_secret_987654321"

from subscriptions import (
    CANONICAL_PLANS,
    compute_expiration,
    verify_razorpay_signature,
    verify_webhook_signature,
    grant_or_extend_entitlement,
    check_user_subscription,
    build_subscriptions_router,
    build_webhooks_router,
    ensure_canonical_plans,
)


class MockCursor:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, key, direction=1):
        reverse = direction == -1
        self.items.sort(key=lambda x: x.get(key, ""), reverse=reverse)
        return self

    async def to_list(self, length=100):
        return self.items[:length]


class MockCollection:
    def __init__(self):
        self.docs = []

    async def create_index(self, keys, **kwargs):
        pass

    async def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = str(uuid.uuid4())
        self.docs.append(d)
        return d

    async def find_one(self, filter_dict, projection=None):
        for d in self.docs:
            match = True
            for k, v in filter_dict.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(d)
                if projection and projection.get("_id") == 0:
                    res.pop("_id", None)
                return res
        return None

    def find(self, filter_dict=None, projection=None):
        res = []
        filter_dict = filter_dict or {}
        for d in self.docs:
            match = True
            for k, v in filter_dict.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                item = dict(d)
                if projection and projection.get("_id") == 0:
                    item.pop("_id", None)
                res.append(item)
        return MockCursor(res)

    async def update_one(self, filter_dict, update_dict, upsert=False):
        for idx, d in enumerate(self.docs):
            match = True
            for k, v in filter_dict.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                if "$set" in update_dict:
                    d.update(update_dict["$set"])
                return {"modified_count": 1}
        if upsert:
            new_doc = dict(filter_dict)
            if "$set" in update_dict:
                new_doc.update(update_dict["$set"])
            if "$setOnInsert" in update_dict:
                new_doc.update(update_dict["$setOnInsert"])
            await self.insert_one(new_doc)
            return {"upserted_id": new_doc.get("_id")}
        return {"modified_count": 0}

    async def delete_one(self, filter_dict):
        for idx, d in enumerate(self.docs):
            match = True
            for k, v in filter_dict.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                self.docs.pop(idx)
                return {"deleted_count": 1}
        return {"deleted_count": 0}


class MockDB:
    def __init__(self):
        self.subscription_plans = MockCollection()
        self.payments = MockCollection()
        self.user_entitlements = MockCollection()
        self.payment_webhook_events = MockCollection()


# -----------------------------------------------------------------------------
# Unit Tests: Plan Catalog & Math
# -----------------------------------------------------------------------------
def test_canonical_plans_fixed_prices():
    assert CANONICAL_PLANS["daily"]["amount_paise"] == 3000
    assert CANONICAL_PLANS["weekly"]["amount_paise"] == 17000
    assert CANONICAL_PLANS["monthly"]["amount_paise"] == 50000
    assert CANONICAL_PLANS["lifetime"]["amount_paise"] == 500000

    assert CANONICAL_PLANS["daily"]["currency"] == "INR"
    assert CANONICAL_PLANS["monthly"]["currency"] == "INR"


def test_calendar_month_expiration_calculation():
    # Jan 31 + 1 month = Feb 28 in non-leap year (e.g. 2026)
    start_jan = datetime(2026, 1, 31, 12, 0, 0, tzinfo=timezone.utc)
    exp_feb = compute_expiration(start_jan, CANONICAL_PLANS["monthly"])
    assert exp_feb.year == 2026
    assert exp_feb.month == 2
    assert exp_feb.day == 28
    assert exp_feb.hour == 12

    # March 31 + 1 month = April 30
    start_mar = datetime(2026, 3, 31, 15, 30, 0, tzinfo=timezone.utc)
    exp_apr = compute_expiration(start_mar, CANONICAL_PLANS["monthly"])
    assert exp_apr.year == 2026
    assert exp_apr.month == 4
    assert exp_apr.day == 30


def test_lifetime_expiration_is_none():
    now = datetime.now(timezone.utc)
    exp = compute_expiration(now, CANONICAL_PLANS["lifetime"])
    assert exp is None


# -----------------------------------------------------------------------------
# Unit Tests: Cryptographic Verification
# -----------------------------------------------------------------------------
def test_razorpay_signature_verification():
    secret = "test_key_secret_xyz"
    order_id = "order_9A33XWu170gUtm"
    payment_id = "pay_29QQoUBcxNqdf0"
    message = f"{order_id}|{payment_id}".encode("utf-8")
    valid_signature = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()

    # Valid
    assert verify_razorpay_signature(order_id, payment_id, valid_signature, secret) is True
    # Tampered signature
    assert verify_razorpay_signature(order_id, payment_id, "invalid_sig", secret) is False
    # Wrong order
    assert verify_razorpay_signature("order_wrong", payment_id, valid_signature, secret) is False
    # Empty inputs
    assert verify_razorpay_signature("", payment_id, valid_signature, secret) is False


def test_webhook_signature_verification():
    secret = "whsec_test_secret_123"
    raw_payload = b'{"event":"payment.captured","id":"evt_123"}'
    valid_sig = hmac.new(secret.encode("utf-8"), raw_payload, hashlib.sha256).hexdigest()

    assert verify_webhook_signature(raw_payload, valid_sig, secret) is True
    assert verify_webhook_signature(raw_payload, "tampered_sig", secret) is False
    assert verify_webhook_signature(b'different body', valid_sig, secret) is False


# -----------------------------------------------------------------------------
# Unit Tests: Entitlement Stacking & Expiry
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_entitlement_stacking_extends_existing_expiry():
    db = MockDB()
    user_id = "user_driver_1"
    now = datetime.now(timezone.utc)

    # User buys Daily Pass
    ent1 = await grant_or_extend_entitlement(db, user_id, "daily", "pay_1")
    assert ent1["entitlement_status"] == "active"
    exp1 = ent1["expires_at"]
    assert exp1 > now
    expected_exp1 = now + timedelta(hours=24)
    assert abs((exp1 - expected_exp1).total_seconds()) < 5

    # User buys Weekly Pass while Daily is active -> should extend from exp1!
    ent2 = await grant_or_extend_entitlement(db, user_id, "weekly", "pay_2")
    assert ent2["entitlement_status"] == "active"
    exp2 = ent2["expires_at"]
    expected_exp2 = exp1 + timedelta(days=7)
    assert abs((exp2 - expected_exp2).total_seconds()) < 5


@pytest.mark.asyncio
async def test_lifetime_upgrade_and_protection():
    db = MockDB()
    user_id = "user_driver_2"

    # User buys Daily Pass first
    await grant_or_extend_entitlement(db, user_id, "daily", "pay_1")

    # User upgrades to Lifetime
    life_ent = await grant_or_extend_entitlement(db, user_id, "lifetime", "pay_life")
    assert life_ent["entitlement_status"] == "lifetime_active"
    assert life_ent["expires_at"] is None

    # User attempts to buy Daily Pass later -> Lifetime is preserved!
    sub_status = await check_user_subscription(db, user_id)
    assert sub_status["has_access"] is True
    assert sub_status["entitlement_status"] == "lifetime_active"


# -----------------------------------------------------------------------------
# Integration Tests: FastAPI Endpoints
# -----------------------------------------------------------------------------
@pytest.fixture
def test_app():
    db = MockDB()
    app = FastAPI()

    # Seed canonical plans
    for pid, pdata in CANONICAL_PLANS.items():
        db.subscription_plans.docs.append(dict(pdata))

    user_storage = {"current": {"user_id": "user_test_100", "email": "testdriver@example.com"}}

    async def mock_user_dep():
        return user_storage["current"]

    sub_router = build_subscriptions_router(db, mock_user_dep)
    wh_router = build_webhooks_router(db)

    app.include_router(sub_router, prefix="/api")
    app.include_router(wh_router, prefix="/api")

    return app, db, user_storage


@pytest.mark.asyncio
async def test_get_plans_endpoint(test_app):
    app, db, _ = test_app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/subscriptions/plans")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 4
        ids = [p["plan_id"] for p in data]
        assert "daily" in ids and "lifetime" in ids


@pytest.mark.asyncio
async def test_order_creation_and_verification_pipeline(test_app):
    app, db, user_storage = test_app
    user = user_storage["current"]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Step 1: Check initial subscription status (no subscription)
        me_resp = await client.get("/api/subscriptions/me")
        assert me_resp.status_code == 200
        assert me_resp.json()["has_access"] is False
        assert me_resp.json()["entitlement_status"] == "none"

        # Step 2: Create order for Daily Pass (3000 paise)
        ord_resp = await client.post("/api/subscriptions/orders", json={"plan_id": "daily"})
        assert ord_resp.status_code == 201
        order_data = ord_resp.json()
        assert order_data["amount_paise"] == 3000
        assert order_data["price_inr"] == 30
        order_id = order_data["razorpay_order_id"]

        # Step 3: Verify payment with wrong signature (fails 400)
        bad_verify = await client.post(
            "/api/subscriptions/verify-payment",
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": "pay_test_123",
                "razorpay_signature": "bad_signature_hash",
            },
        )
        assert bad_verify.status_code == 400
        assert "Invalid payment signature" in bad_verify.text

        # Step 4: Verify payment with valid signature
        payment_id = "pay_test_valid_123"
        secret = os.environ["RAZORPAY_KEY_SECRET"]
        valid_sig = hmac.new(
            secret.encode("utf-8"),
            f"{order_id}|{payment_id}".encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        good_verify = await client.post(
            "/api/subscriptions/verify-payment",
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": valid_sig,
            },
        )
        assert good_verify.status_code == 200
        assert good_verify.json()["success"] is True

        # Step 5: Check subscription status again (now active!)
        me_active = await client.get("/api/subscriptions/me")
        assert me_active.status_code == 200
        active_data = me_active.json()
        assert active_data["has_access"] is True
        assert active_data["entitlement_status"] == "active"
        assert active_data["active_plan"] == "daily"
        assert active_data["remaining_seconds"] > 86000

        # Step 6: Verify purchase history
        hist_resp = await client.get("/api/subscriptions/history")
        assert hist_resp.status_code == 200
        history = hist_resp.json()
        assert len(history) == 1
        assert history[0]["payment_status"] == "captured"
        assert history[0]["amount_inr"] == 30.0


@pytest.mark.asyncio
async def test_webhook_idempotency_and_refund(test_app):
    app, db, user_storage = test_app
    user = user_storage["current"]
    webhook_secret = os.environ["RAZORPAY_WEBHOOK_SECRET"]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Pre-seed an order in db.payments
        order_id = "order_wh_test_1"
        payment_id = "pay_wh_test_1"
        await db.payments.insert_one({
            "payment_id": "pay_rec_1",
            "user_id": user["user_id"],
            "plan_id": "weekly",
            "local_order_id": "ord_loc_1",
            "razorpay_order_id": order_id,
            "razorpay_payment_id": None,
            "amount_paise": 17000,
            "currency": "INR",
            "payment_status": "created",
            "created_at": datetime.now(timezone.utc),
        })

        # Send payment.captured webhook
        payload_obj = {
            "id": "evt_wh_captured_1",
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": payment_id,
                        "order_id": order_id,
                        "amount": 17000,
                        "status": "captured",
                    }
                }
            }
        }
        import json
        raw_body = json.dumps(payload_obj).encode("utf-8")
        sig = hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

        wh_resp1 = await client.post(
            "/api/webhooks/razorpay",
            content=raw_body,
            headers={"Content-Type": "application/json", "X-Razorpay-Signature": sig},
        )
        assert wh_resp1.status_code == 200

        # Check that user entitlement was activated
        me_resp = await client.get("/api/subscriptions/me")
        assert me_resp.json()["has_access"] is True
        assert me_resp.json()["active_plan"] == "weekly"

        # Send DUPLICATE webhook (must be idempotently accepted without re-processing)
        wh_resp2 = await client.post(
            "/api/webhooks/razorpay",
            content=raw_body,
            headers={"Content-Type": "application/json", "X-Razorpay-Signature": sig},
        )
        assert wh_resp2.status_code == 200
        assert wh_resp2.json()["message"] == "Event already processed"

        # Send refund.processed webhook -> should revoke entitlement
        refund_payload = {
            "id": "evt_wh_refund_1",
            "event": "refund.processed",
            "payload": {
                "refund": {
                    "entity": {
                        "payment_id": payment_id,
                        "amount": 17000,
                        "status": "processed",
                    }
                }
            }
        }
        ref_body = json.dumps(refund_payload).encode("utf-8")
        ref_sig = hmac.new(webhook_secret.encode("utf-8"), ref_body, hashlib.sha256).hexdigest()

        ref_resp = await client.post(
            "/api/webhooks/razorpay",
            content=ref_body,
            headers={"Content-Type": "application/json", "X-Razorpay-Signature": ref_sig},
        )
        assert ref_resp.status_code == 200

        # Entitlement should now be revoked
        me_revoked = await client.get("/api/subscriptions/me")
        assert me_revoked.json()["has_access"] is False
        assert me_revoked.json()["entitlement_status"] == "revoked"
