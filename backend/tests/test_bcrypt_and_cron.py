
"""Tests pour migration bcrypt admin password + endpoints CRON externe + audit digest_runs."""
import os
import asyncio

import pytest
import httpx

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set", allow_module_level=True)

API = f"{BASE_URL}/api"
ADMIN_PWD = "wague-admin-2026"


@pytest.fixture
def client():
    with httpx.Client(timeout=30.0) as c:
        yield c


class TestBcryptMigration:
    def test_login_plain_password_still_works(self, client):
        r = client.post(f"{API}/admin/login", json={"password": ADMIN_PWD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        # Token renvoyé au frontend doit rester le plain pour compat sessionStorage
        assert data.get("adminToken") == ADMIN_PWD

    def test_db_stored_as_bcrypt_hash(self):
        """Après au moins 1 login réussi, la DB doit contenir un hash bcrypt."""
        from motor.motor_asyncio import AsyncIOMotorClient
        from pathlib import Path
        from dotenv import load_dotenv

        load_dotenv(Path("/app/backend/.env"))

        async def _check():
            client_db = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client_db[os.environ["DB_NAME"]]
            doc = await db.admin_config.find_one({"key": "admin_password"})
            client_db.close()
            return doc

        doc = asyncio.run(_check())
        assert doc is not None
        v = doc.get("value", "")
        assert v.startswith(("$2a$", "$2b$", "$2y$")), f"Expected bcrypt hash, got: {v[:10]}"
        assert len(v) == 60, f"Expected 60 chars, got {len(v)}"

    def test_require_admin_header_still_accepts_plain(self, client):
        r = client.get(f"{API}/admin/codes", headers={"X-Admin-Password": ADMIN_PWD})
        assert r.status_code == 200

    def test_require_admin_rejects_wrong(self, client):
        r = client.get(f"{API}/admin/codes", headers={"X-Admin-Password": "wrong"})
        assert r.status_code == 401


class TestCronExternal:
    def test_cron_r1_rejects_missing_token(self, client):
        r = client.get(f"{API}/cron/r1-pronostics")
        assert r.status_code == 401

    def test_cron_r1_rejects_wrong_token(self, client):
        r = client.get(f"{API}/cron/r1-pronostics?token=wrong")
        assert r.status_code == 401

    def test_cron_trial_followup_rejects_missing_token(self, client):
        r = client.get(f"{API}/cron/trial-followup")
        assert r.status_code == 401


class TestDigestHistoryEndpoint:
    def test_history_requires_admin(self, client):
        r = client.get(f"{API}/admin/notifications/digest/history")
        assert r.status_code == 401

    def test_history_returns_structure(self, client):
        r = client.get(
            f"{API}/admin/notifications/digest/history?limit=5",
            headers={"X-Admin-Password": ADMIN_PWD},
        )
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "countByJob" in data
        assert "lastSuccessByJob" in data
        assert "cronConfigured" in data
        # All 4 known jobs must be present in lastSuccessByJob keys
        for j in ["r1_pronostics", "trial_followup", "daily_digest", "weekly_digest"]:
            assert j in data["lastSuccessByJob"]

    def test_history_job_filter(self, client):
        r = client.get(
            f"{API}/admin/notifications/digest/history?job=trial_followup&limit=10",
            headers={"X-Admin-Password": ADMIN_PWD},
        )
        assert r.status_code == 200
        data = r.json()
        # Tous les items doivent être trial_followup (s'il y en a)
        for it in data.get("items", []):
            assert it["jobName"] == "trial_followup"

    def test_history_items_have_id_and_trigger(self, client):
        r = client.get(
            f"{API}/admin/notifications/digest/history?limit=20",
            headers={"X-Admin-Password": ADMIN_PWD},
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        if items:
            it = items[0]
            assert "id" in it and it["id"]
            assert "jobName" in it
            assert "trigger" in it
            assert "runAt" in it
            assert "ok" in it

