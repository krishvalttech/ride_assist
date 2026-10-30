# RideAssist email/password auth API tests (register, login, me, logout, forgot/reset password)
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
AUTH = f"{BASE_URL}/api/auth"
SEED_EMAIL = "delivered+driver@resend.dev"
SEED_PASSWORD = "Driver@123"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def new_user(api):
    email = f"delivered+test_{uuid.uuid4().hex[:8]}@resend.dev"
    r = api.post(f"{AUTH}/register", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 201, r.text
    return {"email": email, "password": "TestPass123", "resp": r.json()}


# Registration
class TestRegister:
    def test_register_returns_token_and_user(self, new_user):
        data = new_user["resp"]
        assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        assert data["user"]["email"] == new_user["email"]
        assert "password_hash" not in data["user"] and "_id" not in data["user"]

    def test_register_duplicate_409(self, api, new_user):
        r = api.post(f"{AUTH}/register", json={"email": new_user["email"], "password": "OtherPass123"})
        assert r.status_code == 409

    def test_register_duplicate_case_insensitive_409(self, api, new_user):
        r = api.post(f"{AUTH}/register", json={"email": new_user["email"].upper(), "password": "OtherPass123"})
        assert r.status_code == 409

    def test_register_short_password_400(self, api):
        r = api.post(f"{AUTH}/register", json={"email": f"delivered+s{uuid.uuid4().hex[:6]}@resend.dev", "password": "short"})
        assert r.status_code == 400
        assert "8" in r.json()["detail"]

    def test_register_invalid_email_422(self, api):
        r = api.post(f"{AUTH}/register", json={"email": "not-an-email", "password": "TestPass123"})
        assert r.status_code == 422


# Login
class TestLogin:
    def test_login_seed_user(self, api):
        r = api.post(f"{AUTH}/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["email"] == SEED_EMAIL and d["access_token"]

    def test_login_new_user(self, api, new_user):
        r = api.post(f"{AUTH}/login", json={"email": new_user["email"], "password": new_user["password"]})
        assert r.status_code == 200
        assert r.json()["user"]["user_id"] == new_user["resp"]["user"]["user_id"]

    def test_login_wrong_password_401(self, api):
        r = api.post(f"{AUTH}/login", json={"email": SEED_EMAIL, "password": "WrongPass999"})
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid email or password"

    def test_login_unknown_user_401(self, api):
        r = api.post(f"{AUTH}/login", json={"email": "nobody_xyz@example.com", "password": "WrongPass999"})
        assert r.status_code == 401


# Session: me + logout
class TestSession:
    def test_me_with_token(self, api, new_user):
        tok = new_user["resp"]["access_token"]
        r = api.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert r.json()["email"] == new_user["email"]

    def test_me_bad_token_401(self, api):
        r = api.get(f"{AUTH}/me", headers={"Authorization": "Bearer garbage.token.value"})
        assert r.status_code == 401

    def test_me_no_token_401(self, api):
        r = requests.get(f"{AUTH}/me")
        assert r.status_code == 401

    def test_logout_revokes_token(self, api, new_user):
        r = api.post(f"{AUTH}/login", json={"email": new_user["email"], "password": new_user["password"]})
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        assert api.get(f"{AUTH}/me", headers=h).status_code == 200
        lo = api.post(f"{AUTH}/logout", headers=h)
        assert lo.status_code == 200 and lo.json()["ok"] is True
        assert api.get(f"{AUTH}/me", headers=h).status_code == 401
        # other token from register still valid
        h2 = {"Authorization": f"Bearer {new_user['resp']['access_token']}"}
        assert api.get(f"{AUTH}/me", headers=h2).status_code == 200


# Forgot / reset password
class TestPasswordReset:
    def test_forgot_unknown_email_generic_200(self, api):
        r = api.post(f"{AUTH}/forgot-password", json={"email": "unknown_xyz@example.com"})
        assert r.status_code == 200
        assert "reset code" in r.json()["message"]

    def test_forgot_known_email_generic_200(self, api, new_user):
        r = api.post(f"{AUTH}/forgot-password", json={"email": new_user["email"]}, timeout=40)
        assert r.status_code == 200, r.text
        assert "reset code" in r.json()["message"]

    def test_reset_wrong_code_400(self, api, new_user):
        r = api.post(f"{AUTH}/reset-password", json={"email": new_user["email"], "code": "000000", "new_password": "NewPass1234"})
        # extremely unlikely the random code is 000000
        assert r.status_code == 400
        assert r.json()["detail"] == "Invalid or expired code"

    def test_reset_non_digit_code_400(self, api, new_user):
        r = api.post(f"{AUTH}/reset-password", json={"email": new_user["email"], "code": "12ab", "new_password": "NewPass1234"})
        assert r.status_code == 400

    def test_reset_short_password_400(self, api, new_user):
        r = api.post(f"{AUTH}/reset-password", json={"email": new_user["email"], "code": "123456", "new_password": "short"})
        assert r.status_code == 400

    def test_reset_unknown_email_400(self, api):
        r = api.post(f"{AUTH}/reset-password", json={"email": "unknown_xyz@example.com", "code": "123456", "new_password": "NewPass1234"})
        assert r.status_code == 400

    def test_reset_lockout_after_attempts(self, api, new_user):
        # after 5 wrong attempts total, even further attempts return 400; old password still works
        for _ in range(6):
            api.post(f"{AUTH}/reset-password", json={"email": new_user["email"], "code": "999999", "new_password": "NewPass1234"})
        r = api.post(f"{AUTH}/login", json={"email": new_user["email"], "password": new_user["password"]})
        assert r.status_code == 200
