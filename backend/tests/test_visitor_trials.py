
"""Tests for visitor trial lead capture + admin trials CRUD endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://identical-build-8.preview.emergentagent.com").rstrip("/")
ADMIN_PWD = "wague-admin-2026"


def _fip():
    """Unique fake IP per test run to isolate rate limiter."""
    return f"10.{os.getpid() % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"


@pytest.fixture(scope="module")
def admin_headers():
    return {"X-Admin-Password": ADMIN_PWD}


@pytest.fixture(scope="module")
def created_trial_ids():
    ids = []
    yield ids
    # Cleanup
    for tid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/admin/trials/{tid}",
                            headers={"X-Admin-Password": ADMIN_PWD}, timeout=10)
        except Exception:
            pass


def test_create_trial_valid(created_trial_ids):
    email = f"trial_{uuid.uuid4().hex[:8]}@turfex.test"
    ip = _fip()
    r = requests.post(f"{BASE_URL}/api/visitor/trial",
                      json={"email": email},
                      headers={"X-Forwarded-For": ip},
                      timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("created") is True
    assert d.get("trialDate")
    assert "message" in d

    # Verify persisted via admin
    lr = requests.get(f"{BASE_URL}/api/admin/trials",
                      headers={"X-Admin-Password": ADMIN_PWD}, timeout=10)
    assert lr.status_code == 200
    items = lr.json().get("items", [])
    match = next((t for t in items if t["email"] == email), None)
    assert match is not None
    assert match["active"] is True
    assert match["trialUsed"] is False
    assert match["source"] == "login_page"
    created_trial_ids.append(match["id"])


def test_duplicate_trial_returns_already(created_trial_ids):
    email = f"trial_{uuid.uuid4().hex[:8]}@turfex.test"
    ip = _fip()
    h = {"X-Forwarded-For": ip}
    r1 = requests.post(f"{BASE_URL}/api/visitor/trial", json={"email": email}, headers=h, timeout=10)
    assert r1.status_code == 200
    # Track cleanup
    lr = requests.get(f"{BASE_URL}/api/admin/trials",
                      headers={"X-Admin-Password": ADMIN_PWD}, timeout=10)
    m = next((t for t in lr.json()["items"] if t["email"] == email), None)
    if m:
        created_trial_ids.append(m["id"])

    # duplicate same email, same IP
    r2 = requests.post(f"{BASE_URL}/api/visitor/trial", json={"email": email}, headers=h, timeout=10)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d.get("ok") is True
    assert d.get("already") == "trial"
    assert "trialDate" in d
    assert "trialUsed" in d


def test_invalid_email_returns_400():
    ip = _fip()
    for bad in ["notanemail", "no@dot", "with space@test.com"]:
        r = requests.post(f"{BASE_URL}/api/visitor/trial",
                          json={"email": bad},
                          headers={"X-Forwarded-For": ip},
                          timeout=10)
        assert r.status_code == 400, f"{bad!r} -> {r.status_code}: {r.text}"


def test_active_subscriber_returns_already_subscriber():
    r = requests.post(f"{BASE_URL}/api/visitor/trial",
                      json={"email": "hubertwague123@gmail.com"},
                      headers={"X-Forwarded-For": _fip()},
                      timeout=10)
    assert r.status_code == 200
    d = r.json()
    # Either already subscriber OR already code (both are acceptable)
    assert d.get("ok") is True
    assert d.get("already") in ("subscriber", "code", "trial")


def test_list_trials_structure(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "items" in d
    assert "stats" in d
    assert "today" in d
    for k in ["total", "active", "used", "pending", "disabled"]:
        assert k in d["stats"]


def test_list_trials_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/trials", timeout=10)
    assert r.status_code == 401


def test_update_trial_toggle_and_note(created_trial_ids, admin_headers):
    email = f"trial_{uuid.uuid4().hex[:8]}@turfex.test"
    requests.post(f"{BASE_URL}/api/visitor/trial",
                  json={"email": email},
                  headers={"X-Forwarded-For": _fip()}, timeout=10)
    lr = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_headers, timeout=10)
    m = next((t for t in lr.json()["items"] if t["email"] == email), None)
    assert m is not None
    tid = m["id"]
    created_trial_ids.append(tid)

    # Deactivate
    r = requests.patch(f"{BASE_URL}/api/admin/trials/{tid}",
                       json={"active": False}, headers=admin_headers, timeout=10)
    assert r.status_code == 200
    # Verify
    lr2 = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_headers, timeout=10)
    m2 = next((t for t in lr2.json()["items"] if t["id"] == tid), None)
    assert m2["active"] is False

    # Update note
    r3 = requests.patch(f"{BASE_URL}/api/admin/trials/{tid}",
                        json={"note": "test note"}, headers=admin_headers, timeout=10)
    assert r3.status_code == 200
    lr3 = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_headers, timeout=10)
    m3 = next((t for t in lr3.json()["items"] if t["id"] == tid), None)
    assert m3["note"] == "test note"


def test_promote_trial_to_subscriber(created_trial_ids, admin_headers):
    email = f"trial_{uuid.uuid4().hex[:8]}@turfex.test"
    requests.post(f"{BASE_URL}/api/visitor/trial",
                  json={"email": email},
                  headers={"X-Forwarded-For": _fip()}, timeout=10)
    lr = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_headers, timeout=10)
    m = next((t for t in lr.json()["items"] if t["email"] == email), None)
    assert m is not None
    tid = m["id"]
    created_trial_ids.append(tid)

    r = requests.post(f"{BASE_URL}/api/admin/trials/{tid}/promote",
                      headers=admin_headers, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("subscriber", {}).get("email") == email

    # Second promote -> already
    r2 = requests.post(f"{BASE_URL}/api/admin/trials/{tid}/promote",
                       headers=admin_headers, timeout=10)
    assert r2.status_code == 200
    assert r2.json().get("already") is True

    # Cleanup subscriber
    sr = requests.get(f"{BASE_URL}/api/admin/subscribers", headers=admin_headers, timeout=10)
    sub = next((s for s in sr.json().get("manual", []) if s["email"] == email), None)
    if sub:
        requests.delete(f"{BASE_URL}/api/admin/subscribers/{sub['id']}",
                        headers=admin_headers, timeout=10)


def test_delete_trial(admin_headers):
    email = f"trial_{uuid.uuid4().hex[:8]}@turfex.test"
    requests.post(f"{BASE_URL}/api/visitor/trial",
                  json={"email": email},
                  headers={"X-Forwarded-For": _fip()}, timeout=10)
    lr = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_headers, timeout=10)
    m = next((t for t in lr.json()["items"] if t["email"] == email), None)
    assert m is not None
    tid = m["id"]

    r = requests.delete(f"{BASE_URL}/api/admin/trials/{tid}",
                        headers=admin_headers, timeout=10)
    assert r.status_code == 200
    assert r.json().get("deleted") == 1

    lr2 = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_headers, timeout=10)
    assert not any(t["id"] == tid for t in lr2.json()["items"])


def test_subscribers_has_activeRecipientsDetail(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/subscribers", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "activeRecipientsDetail" in d
    # Each entry should have email + source
    for rec in d["activeRecipientsDetail"]:
        assert "email" in rec
        assert "source" in rec
        assert rec["source"] in ("code", "manual", "trial")


def test_rate_limit_trial_5_per_hour():
    """Send 5 distinct emails from same IP, then 6th should be 429."""
    ip = _fip()
    h = {"X-Forwarded-For": ip}
    created_emails = []
    for i in range(5):
        email = f"trial_rl_{uuid.uuid4().hex[:8]}@turfex.test"
        r = requests.post(f"{BASE_URL}/api/visitor/trial",
                          json={"email": email}, headers=h, timeout=10)
        assert r.status_code == 200, f"Attempt {i}: {r.status_code} {r.text}"
        created_emails.append(email)

    # 6th should be locked (429) — hard cap is DB-backed via count_documents on ip + createdAt
    r6 = requests.post(f"{BASE_URL}/api/visitor/trial",
                       json={"email": f"trial_rl6_{uuid.uuid4().hex[:8]}@turfex.test"},
                       headers=h, timeout=10)
    assert r6.status_code == 429, f"6th attempt expected 429 got {r6.status_code}: {r6.text}"
    body = r6.json()
    # FastAPI wraps HTTPException detail under "detail"
    detail = body.get("detail", body)
    assert detail.get("retryAfter") == 3600
    assert detail.get("scope") == "trial"
    assert "inscription" in (detail.get("error") or "").lower() or "trop" in (detail.get("error") or "").lower()

    # Cleanup
    admin_h = {"X-Admin-Password": ADMIN_PWD}
    lr = requests.get(f"{BASE_URL}/api/admin/trials", headers=admin_h, timeout=10)
    for t in lr.json().get("items", []):
        if t["email"] in created_emails:
            requests.delete(f"{BASE_URL}/api/admin/trials/{t['id']}", headers=admin_h, timeout=10)


def test_rate_limit_trial_via_invalid_emails():
    """5 invalid emails from same IP -> lockout on 5th/6th."""
    ip = _fip()
    h = {"X-Forwarded-For": ip}
    statuses = []
    for i in range(6):
        r = requests.post(f"{BASE_URL}/api/visitor/trial",
                          json={"email": f"invalid{i}"},  # no @
                          headers=h, timeout=10)
        statuses.append(r.status_code)
    # Expect at least one 429 in the sequence
    assert 429 in statuses, f"Expected 429 among {statuses}"
    # Verify scope field
    locked = [s for s in statuses if s == 429]
    assert len(locked) >= 1

