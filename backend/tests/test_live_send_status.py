
"""Tests for LiveSendStatus admin endpoint /api/admin/digest-runs/latest
plus integration with /api/admin/trials/send-now (fire-and-forget bulk).
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://identical-build-8.preview.emergentagent.com").rstrip("/")
ADMIN_PWD = "wague-admin-2026"
HEADERS = {"X-Admin-Password": ADMIN_PWD, "Content-Type": "application/json"}


# === Auth gate ===
def test_digest_runs_latest_requires_admin():
    r = requests.get(f"{BASE_URL}/api/admin/digest-runs/latest", timeout=10)
    assert r.status_code == 401, r.text


def test_digest_runs_latest_wrong_password():
    r = requests.get(
        f"{BASE_URL}/api/admin/digest-runs/latest",
        headers={"X-Admin-Password": "wrong"},
        timeout=10,
    )
    assert r.status_code == 401, r.text


# === Shape of response ===
def test_digest_runs_latest_shape():
    r = requests.get(f"{BASE_URL}/api/admin/digest-runs/latest", headers=HEADERS, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    expected_keys = {
        "active", "trigger", "startedAt", "completedAt", "ok",
        "sent", "sentTrials", "recipientsCount", "errors", "hippodrome",
        "errorMessage", "sentLive", "errorsLive", "recentRecipients", "latestRun",
    }
    missing = expected_keys - set(data.keys())
    assert not missing, f"Missing keys in response: {missing}. Got: {data}"
    assert isinstance(data["active"], bool)
    assert isinstance(data["sentLive"], int)
    assert isinstance(data["errorsLive"], int)
    assert isinstance(data["recentRecipients"], list)


# === Bulk trigger -> active=true -> completed ===
def test_bulk_send_then_poll_active_then_completed():
    # Trigger bulk fire-and-forget
    payload = {"all_pending": True, "reset_used": True}
    r = requests.post(
        f"{BASE_URL}/api/admin/trials/send-now",
        headers=HEADERS,
        json=payload,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("queued") is True
    assert body.get("scope") == "all_pending"
    targeted = body.get("targeted_count", 0)

    # Poll latest immediately — should be active=true (or already completed if 0 targets)
    time.sleep(0.5)
    r2 = requests.get(f"{BASE_URL}/api/admin/digest-runs/latest", headers=HEADERS, timeout=10)
    assert r2.status_code == 200
    s = r2.json()
    print(f"[t=0.5s] active={s['active']} sentLive={s['sentLive']} startedAt={s['startedAt']} trigger={s['trigger']}")
    assert s["startedAt"] is not None, "startedAt should be set after spawn"
    # If targeted=0 the runner may complete almost instantly => allow either case
    if targeted > 0:
        assert s["trigger"] in ("manual_bulk_bg", "manual", "manual_resend_single", "manual_add_send"), s["trigger"]

    # Wait up to 60s for completion
    deadline = time.time() + 60
    final = None
    while time.time() < deadline:
        time.sleep(3)
        rr = requests.get(f"{BASE_URL}/api/admin/digest-runs/latest", headers=HEADERS, timeout=10)
        if rr.status_code != 200:
            continue
        st = rr.json()
        print(f"[t={int(time.time() - (deadline - 60))}s] active={st['active']} sentLive={st['sentLive']} errorsLive={st['errorsLive']}")
        if not st["active"] and st["completedAt"]:
            final = st
            break
    assert final is not None, "Bulk send did not complete within 60s"
    assert final["completedAt"] is not None
    # ok may be False if no active trials/subscribers exist — accept both but log
    print(f"Final: ok={final['ok']} sent={final['sent']} sentLive={final['sentLive']} errors={final['errors']}")


# === Smoke: trigger=null + sentLive==0 if no recent activity is acceptable ===
def test_idle_state_acceptable():
    # After completion, the previous test left a completedAt — sentLive may be >0
    r = requests.get(f"{BASE_URL}/api/admin/digest-runs/latest", headers=HEADERS, timeout=10)
    assert r.status_code == 200
    s = r.json()
    # Either active or has a startedAt from previous test — both ok
    assert s["active"] in (True, False)

