"""
Unit tests for user sign-on (registration + login) in the /auth API.

Run from the backend/ directory:
    pip install pytest httpx
    pytest test_signon.py -v

No real MongoDB is needed: the `user_collection` in routes_auth is replaced
with an in-memory fake, and the env vars the app requires are set below
BEFORE any app module is imported (config.Settings and routes_auth read
them at import time).
"""
import os

os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")  # client is lazy, never connects
os.environ.setdefault("JWT_SECRET", "test-secret")

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from jose import jwt as jose_jwt

import routes_auth
from app import app
from config import settings
from security import hash_password, verify_password


# --------------------------------------------------------------------------
# In-memory stand-in for the async Mongo collection
# --------------------------------------------------------------------------
class FakeInsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class FakeUserCollection:
    """Implements only what the sign-on routes use: find_one / insert_one."""

    def __init__(self):
        self.docs = []

    async def find_one(self, query):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return doc
        return None

    async def insert_one(self, document):
        doc = dict(document)
        doc["_id"] = ObjectId()
        self.docs.append(doc)
        return FakeInsertResult(doc["_id"])


# --------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------
@pytest.fixture
def fake_db(monkeypatch):
    fake = FakeUserCollection()
    monkeypatch.setattr(routes_auth, "user_collection", fake)
    return fake


@pytest.fixture
def client(fake_db):
    return TestClient(app)


VALID_USER = {
    "user_name": "janedoe",
    "email": "jdoe@example.com",
    "password": "s3cretPass!",
}


def register(client, **overrides):
    return client.post("/auth/register/", json={**VALID_USER, **overrides})


def login(client, **overrides):
    return client.post("/auth/login/", json={**VALID_USER, **overrides})


# --------------------------------------------------------------------------
# Registration
# --------------------------------------------------------------------------
class TestRegister:
    def test_register_success(self, client):
        res = register(client)
        assert res.status_code == 201
        body = res.json()
        assert body["user_name"] == VALID_USER["user_name"]
        assert body["email"] == VALID_USER["email"]

    @pytest.mark.xfail(
        reason="Known app bug: UserOut aliases `id` to `_id` without populate_by_name=True, "
        "so UserOut(id=...) in routes_auth.create_user drops the id and returns null.",
        strict=True,
    )
    def test_register_returns_generated_id(self, client, fake_db):
        body = register(client).json()
        assert body["id"] == str(fake_db.docs[0]["_id"])

    def test_register_never_returns_password(self, client):
        body = register(client).json()
        assert "password" not in body

    def test_register_stores_hashed_password(self, client, fake_db):
        register(client)
        stored = fake_db.docs[0]
        assert stored["password"] != VALID_USER["password"]
        assert verify_password(VALID_USER["password"], stored["password"])

    def test_register_stores_username_and_email(self, client, fake_db):
        register(client)
        stored = fake_db.docs[0]
        assert stored["user_name"] == VALID_USER["user_name"]
        assert stored["email"] == VALID_USER["email"]

    def test_register_duplicate_email_rejected(self, client, fake_db):
        assert register(client).status_code == 201
        res = register(client, user_name="someone_else")
        assert res.status_code == 400
        assert res.json()["detail"] == "Email already registered"
        assert len(fake_db.docs) == 1

    def test_register_invalid_email_rejected(self, client, fake_db):
        res = register(client, email="not-an-email")
        assert res.status_code == 422
        assert fake_db.docs == []

    @pytest.mark.parametrize("missing", ["user_name", "email", "password"])
    def test_register_missing_field_rejected(self, client, fake_db, missing):
        payload = {k: v for k, v in VALID_USER.items() if k != missing}
        res = client.post("/auth/register/", json=payload)
        assert res.status_code == 422
        assert fake_db.docs == []

    def test_register_empty_body_rejected(self, client):
        assert client.post("/auth/register/", json={}).status_code == 422


# --------------------------------------------------------------------------
# Login
# --------------------------------------------------------------------------
class TestLogin:
    @pytest.fixture(autouse=True)
    def _registered_user(self, client):
        assert register(client).status_code == 201

    def test_login_success_returns_bearer_token(self, client):
        res = login(client)
        assert res.status_code == 200
        body = res.json()
        assert body["token_type"] == "bearer"
        assert isinstance(body["access_token"], str) and body["access_token"]

    def test_login_token_contains_expected_claims(self, client, fake_db):
        token = login(client).json()["access_token"]
        payload = jose_jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        assert payload["sub"] == VALID_USER["email"]
        assert payload["id"] == str(fake_db.docs[0]["_id"])
        assert "exp" in payload

    def test_login_wrong_password_rejected(self, client):
        res = login(client, password="wrong-password")
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid email or password"

    def test_login_unknown_email_rejected(self, client):
        res = login(client, email="nobody@example.com")
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid email or password"

    def test_login_error_does_not_reveal_which_field_was_wrong(self, client):
        bad_pw = login(client, password="nope").json()
        bad_email = login(client, email="nobody@example.com").json()
        assert bad_pw == bad_email

    def test_login_invalid_email_format_rejected(self, client):
        assert login(client, email="not-an-email").status_code == 422

    @pytest.mark.parametrize("missing",  ["email", "password"])
    def test_login_missing_field_rejected(self, client, missing):
        payload = {k: v for k, v in VALID_USER.items() if k != missing}
        assert client.post("/auth/login/", json=payload).status_code == 422

    def test_login_password_is_case_sensitive(self, client):
        res = login(client, password=VALID_USER["password"].swapcase())
        assert res.status_code == 401

    def test_login_with_different_username_still_succeeds(self, client):
        """
        Documents CURRENT behavior: the login route authenticates on
        email + password only. `user_name` is required by the UserLogin
        schema but is never checked. Change this test if you make
        user_name part of authentication.
        """
        res = login(client, user_name="a_totally_different_name")
        assert res.status_code == 200


# --------------------------------------------------------------------------
# Using the token after sign-on (/auth/me)
# --------------------------------------------------------------------------
class TestSessionToken:
    def test_me_with_valid_token(self, client):
        register(client)
        token = login(client).json()["access_token"]
        res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["email"] == VALID_USER["email"]

    def test_me_without_token_rejected(self, client):
        res = client.get("/auth/me")
        assert res.status_code in (401, 403)  # HTTPBearer status varies by FastAPI version

    def test_me_with_garbage_token_rejected(self, client):
        res = client.get("/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
        assert res.status_code == 401

    def test_me_with_token_signed_by_wrong_secret_rejected(self, client):
        forged = jose_jwt.encode(
            {"sub": VALID_USER["email"], "id": "abc"}, "wrong-secret", algorithm="HS256"
        )
        res = client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
        assert res.status_code == 401


# --------------------------------------------------------------------------
# Password hashing helpers
# --------------------------------------------------------------------------
class TestSecurityHelpers:
    def test_hash_is_not_plaintext_and_verifies(self):
        hashed = hash_password("hunter2")
        assert hashed != "hunter2"
        assert verify_password("hunter2", hashed)

    def test_verify_rejects_wrong_password(self):
        assert not verify_password("wrong", hash_password("hunter2"))

    def test_hashes_are_salted(self):
        assert hash_password("same") != hash_password("same")
