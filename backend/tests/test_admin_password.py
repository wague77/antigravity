
"""Tests for admin change-password feature + regression on admin endpoints.

IMPORTANT: restores admin password to the initial default at the end.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://identical-build-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEFAULT_PWD = "wague-admin-2026"
NEW_PWD = "TestNewPwd-2026!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def restore_password_after(session):
    """Ensure admin password is reset to DEFAULT_PWD after tests (module teardown)."""
    yield
    # Try to reset with NEW_PWD first (if tests changed it), fallback to DEFAULT
    for current in [NEW_PWD, DEFAULT_PWD]:
        try:
            r = session.post(
                f"{API}/admin/change-password",
                json={"currentPassword": current, "newPassword": DEFAULT_PWD},
                headers={"X-Admin-Password": current},
            )
            if r.status_code == 200:
                break
            if r.status_code == 400 and "différent" in (r.text or ""):
                # already default
                break
        except Exception:
            pass


# ------ Login baseline ------

def test_login_default_password(session):
    r = session.post(f"{API}/admin/login", json={"password": DEFAULT_PWD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["adminToken"] == DEFAULT_PWD


def test_login_wrong_password_401(session):
    # NOTE: this counts 1 failure in admin rate-limiter (4/5min threshold)
    r = session.post(f"{API}/admin/login", json={"password": "definitely-wrong-pwd"})
    assert r.status_code == 401
    # Success after will soft-reset
    r2 = session.post(f"{API}/admin/login", json={"password": DEFAULT_PWD})
    assert r2.status_code == 200


# ------ change-password validation ------

def test_change_password_missing_header(session):
    r = session.post(
        f"{API}/admin/change-password",
        json={"currentPassword": DEFAULT_PWD, "newPassword": NEW_PWD},
    )
    assert r.status_code == 401


def test_change_password_wrong_header(session):
    r = session.post(
        f"{API}/admin/change-password",
        json={"currentPassword": DEFAULT_PWD, "newPassword": NEW_PWD},
        headers={"X-Admin-Password": "bad-token"},
    )
    assert r.status_code == 401


def test_change_password_new_too_short(session):
    r = session.post(
        f"{API}/admin/change-password",
        json={"currentPassword": DEFAULT_PWD, "newPassword": "short"},
        headers={"X-Admin-Password": DEFAULT_PWD},
    )
    assert r.status_code == 400
    assert "8" in r.text


def test_change_password_same_as_current(session):
    r = session.post(
        f"{API}/admin/change-password",
        json={"currentPassword": DEFAULT_PWD, "newPassword": DEFAULT_PWD},
        headers={"X-Admin-Password": DEFAULT_PWD},
    )
    assert r.status_code == 400


def test_change_password_wrong_current_body(session):
    # current body is wrong -> 401 (counts as 1 admin failure via punish)
    r = session.post(
        f"{API}/admin/change-password",
        json={"currentPassword": "wrong-current", "newPassword": NEW_PWD},
        headers={"X-Admin-Password": DEFAULT_PWD},
    )
    assert r.status_code == 401


# ------ change-password success + token rotation ------

def test_change_password_success_and_rotation(session):
    # Change from DEFAULT -> NEW
    r = session.post(
        f"{API}/admin/change-password",
        json={"currentPassword": DEFAULT_PWD, "newPassword": NEW_PWD},
        headers={"X-Admin-Password": DEFAULT_PWD},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["adminToken"] == NEW_PWD

    # Login with NEW works
    r2 = session.post(f"{API}/admin/login", json={"password": NEW_PWD})
    assert r2.status_code == 200
    assert r2.json()["adminToken"] == NEW_PWD

    # Login with OLD fails (counts 1 admin failure)
    r3 = session.post(f"{API}/admin/login", json={"password": DEFAULT_PWD})
    assert r3.status_code == 401

    # Protected endpoints: NEW works, OLD rejected
    r4 = session.get(f"{API}/admin/codes", headers={"X-Admin-Password": NEW_PWD})
    assert r4.status_code == 200
    assert "items" in r4.json()

    r5 = session.get(f"{API}/admin/codes", headers={"X-Admin-Password": DEFAULT_PWD})
    assert r5.status_code == 401

    r6 = session.get(f"{API}/admin/security", headers={"X-Admin-Password": NEW_PWD})
    assert r6.status_code == 200

    # POST create code with new password
    r7 = session.post(
        f"{API}/admin/codes",
        json={"label": "TEST_pwd_rotation", "durationDays": 1, "count": 1, "maxUses": 1},
        headers={"X-Admin-Password": NEW_PWD},
    )
    assert r7.status_code == 200
    created = r7.json()["codes"][0]
    # cleanup
    session.delete(
        f"{API}/admin/codes/{created['id']}",
        headers={"X-Admin-Password": NEW_PWD},
    )

    # Restore back to DEFAULT
    r8 = session.post(
        f"{API}/admin/change-password",
        json={"currentPassword": NEW_PWD, "newPassword": DEFAULT_PWD},
        headers={"X-Admin-Password": NEW_PWD},
    )
    assert r8.status_code == 200
    assert r8.json()["adminToken"] == DEFAULT_PWD

    # Final: login with DEFAULT works again
    r9 = session.post(f"{API}/admin/login", json={"password": DEFAULT_PWD})
    assert r9.status_code == 200

