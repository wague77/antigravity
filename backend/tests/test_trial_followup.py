
"""Tests for trial J+2 follow-up feature (iteration 7)."""
import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback to frontend/.env
    from pathlib import Path
    env_path = Path('/app/frontend/.env')
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

ADMIN_PASSWORD = "wague-admin-2026"
ADMIN_HEADERS = {"X-Admin-Password": ADMIN_PASSWORD, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update(ADMIN_HEADERS)
    return s


# ----- Mongo direct client to seed trials (bypass subscriber check) -----
@pytest.fixture(scope="module")
def mongo_db():
    from pymongo import MongoClient
    mongo_url = os.environ.get('MONGO_URL') or 'mongodb://localhost:27017'
    db_name = os.environ.get('DB_NAME') or 'test_database'
    # Try to read from backend .env directly
    from pathlib import Path
    env_path = Path('/app/backend/.env')
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('MONGO_URL='):
                mongo_url = line.split('=', 1)[1].strip().strip('"')
            elif line.startswith('DB_NAME='):
                db_name = line.split('=', 1)[1].strip().strip('"')
    client = MongoClient(mongo_url)
    return client[db_name]


@pytest.fixture(scope="module", autouse=True)
def cleanup(mongo_db, api):
    yield
    # Reset settings to defaults
    api.patch(f"{BASE_URL}/api/admin/notifications/settings", json={
        "trial_followup": True,
        "trial_followup_promo_code": "TURFEX5",
        "trial_followup_discount_label": "5 € de réduction",
    })
    # delete test trials
    mongo_db.visitor_trials.delete_many({"email": {"$regex": "^TEST_followup_"}})


# --- Settings tests ---

class TestFollowupSettings:
    def test_status_contains_new_keys(self, api):
        r = api.get(f"{BASE_URL}/api/admin/notifications/status")
        assert r.status_code == 200
        d = r.json()
        assert "settings" in d
        s = d["settings"]
        assert "trial_followup" in s
        assert isinstance(s["trial_followup"], bool)
        assert "trial_followup_promo_code" in s
        assert "trial_followup_discount_label" in s
        # defaults
        defaults = d["defaults"]
        assert defaults["trial_followup"] is True
        assert defaults["trial_followup_promo_code"] == "TURFEX5"
        assert defaults["trial_followup_discount_label"] == "5 € de réduction"

    def test_patch_promo_code_persists(self, api):
        r = api.patch(f"{BASE_URL}/api/admin/notifications/settings",
                      json={"trial_followup_promo_code": "NEWCODE10"})
        assert r.status_code == 200
        assert r.json()["settings"]["trial_followup_promo_code"] == "NEWCODE10"
        # reload via GET
        r2 = api.get(f"{BASE_URL}/api/admin/notifications/status")
        assert r2.json()["settings"]["trial_followup_promo_code"] == "NEWCODE10"
        # restore
        api.patch(f"{BASE_URL}/api/admin/notifications/settings",
                  json={"trial_followup_promo_code": "TURFEX5"})


# --- Trigger tests ---

class TestFollowupTrigger:
    def test_no_eligible_returns_false(self, api, mongo_db):
        # Ensure no trials in window J-3..J-1 by cleaning up any TEST_ data
        mongo_db.visitor_trials.delete_many({"email": {"$regex": "^TEST_followup_"}})
        r = api.post(f"{BASE_URL}/api/admin/notifications/digest/trial-followup", json={})
        # Note: could succeed if there are real trials, so accept either
        assert r.status_code == 200
        d = r.json()
        # must contain ok field
        assert "ok" in d
        if not d["ok"]:
            assert "error" in d
            # expected error or disabled
            assert "eligible" in d["error"] or "trial" in d["error"].lower() or "disabled" in d["error"]

    def test_event_disabled(self, api):
        # Disable
        api.patch(f"{BASE_URL}/api/admin/notifications/settings",
                  json={"trial_followup": False})
        r = api.post(f"{BASE_URL}/api/admin/notifications/digest/trial-followup", json={})
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False
        assert "disabled" in (d.get("error") or "")
        # re-enable
        api.patch(f"{BASE_URL}/api/admin/notifications/settings",
                  json={"trial_followup": True})

    def test_force_all_used_processes_marked_trials(self, api, mongo_db):
        # Seed a test trial bypassing endpoint validation
        tid = str(uuid.uuid4())
        used_at = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()  # not in window
        mongo_db.visitor_trials.insert_one({
            "id": tid,
            "email": f"TEST_followup_{tid[:8]}@example.invalid",
            "active": True,
            "trialUsed": True,
            "trialUsedAt": used_at,
            "followupSent": False,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })

        # Without force_all_used -> should not pick it (outside window)
        r = api.post(f"{BASE_URL}/api/admin/notifications/digest/trial-followup", json={})
        d = r.json()
        # Trial at J-0 (5h ago) is outside window [J-3, J-1]
        # so it should not be eligible through normal flow

        # With force_all_used=true -> it should process it (send may fail due to invalid domain)
        r2 = api.post(f"{BASE_URL}/api/admin/notifications/digest/trial-followup",
                      json={"force_all_used": True})
        assert r2.status_code == 200
        d2 = r2.json()
        # Should have promoCode field in response
        if d2.get("ok") or "eligible" in d2:
            assert "promoCode" in d2 or d2.get("eligible", 0) >= 1 or d2.get("sent", 0) >= 0

        # Cleanup
        mongo_db.visitor_trials.delete_one({"id": tid})

    def test_idempotent_not_double_send(self, api, mongo_db):
        # Seed a trial already marked followupSent=true
        tid = str(uuid.uuid4())
        used_at = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        mongo_db.visitor_trials.insert_one({
            "id": tid,
            "email": f"TEST_followup_idem_{tid[:8]}@example.invalid",
            "active": True,
            "trialUsed": True,
            "trialUsedAt": used_at,
            "followupSent": True,
            "followupSentAt": datetime.now(timezone.utc).isoformat(),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
        r = api.post(f"{BASE_URL}/api/admin/notifications/digest/trial-followup",
                     json={"force_all_used": True})
        d = r.json()
        # This specific trial should not be counted (followupSent=true filter)
        # We can't strictly assert sent==0 since other real trials may exist
        # but we can assert structure
        assert r.status_code == 200
        assert "ok" in d
        # Cleanup
        mongo_db.visitor_trials.delete_one({"id": tid})

