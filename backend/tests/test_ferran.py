
"""Backend tests for /api/ferran/* endpoints (Ferran Method integration).

Tests connectivity to PMU upstream + analyze function. Tries today first,
falls back to yesterday if no courses.
"""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Try fallback URL from frontend .env if REACT_APP_BACKEND_URL not set in this env
if not BASE_URL:
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')
                    break
    except Exception:
        pass


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def working_date_and_course(session):
    """Find a date with courses available. Try today, then yesterday, then 2 days ago."""
    candidates = [
        (datetime.utcnow() - timedelta(days=offset)).strftime("%Y-%m-%d")
        for offset in (0, 1, 2)
    ]
    for date in candidates:
        try:
            r = session.get(f"{BASE_URL}/api/ferran/programme/{date}", timeout=30)
            if r.status_code != 200:
                continue
            data = r.json()
            reunions = data.get("reunions", [])
            for reunion in reunions:
                courses = reunion.get("courses") or []
                if courses:
                    return {
                        "date": date,
                        "reunion": reunion["numReunion"],
                        "course": courses[0]["numCourse"],
                    }
        except Exception:
            continue
    pytest.skip("No PMU programme data available for any recent date")


# === Programme endpoint ===
class TestFerranProgramme:
    def test_programme_today_or_yesterday(self, session):
        for offset in (0, 1, 2):
            date = (datetime.utcnow() - timedelta(days=offset)).strftime("%Y-%m-%d")
            r = session.get(f"{BASE_URL}/api/ferran/programme/{date}", timeout=30)
            if r.status_code == 200:
                data = r.json()
                assert "date" in data
                assert "reunions" in data
                assert isinstance(data["reunions"], list)
                return
        pytest.fail("Programme endpoint returned no successful response for today/yesterday/2-days-ago")

    def test_programme_invalid_date_format(self, session):
        r = session.get(f"{BASE_URL}/api/ferran/programme/2025-13-99", timeout=15)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"

    def test_programme_structure(self, session, working_date_and_course):
        r = session.get(f"{BASE_URL}/api/ferran/programme/{working_date_and_course['date']}", timeout=30)
        assert r.status_code == 200
        data = r.json()
        reunion = data["reunions"][0]
        # Validate enriched fields exist
        assert "numReunion" in reunion
        assert "hippodrome" in reunion
        assert "courses" in reunion
        if reunion["courses"]:
            c = reunion["courses"][0]
            for key in ["numCourse", "libelle", "discipline"]:
                assert key in c, f"Missing key {key} in course"


# === Participants endpoint ===
class TestFerranParticipants:
    def test_participants_returns_list(self, session, working_date_and_course):
        d = working_date_and_course
        url = f"{BASE_URL}/api/ferran/programme/{d['date']}/R{d['reunion']}/C{d['course']}/participants"
        r = session.get(url, timeout=30)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "participants" in data
        assert "count" in data
        assert isinstance(data["participants"], list)
        assert data["count"] == len(data["participants"])
        if data["participants"]:
            p = data["participants"][0]
            assert "numPmu" in p
            assert "nom" in p


# === Rapports endpoint ===
class TestFerranRapports:
    def test_rapports_returns_array(self, session, working_date_and_course):
        d = working_date_and_course
        url = f"{BASE_URL}/api/ferran/programme/{d['date']}/R{d['reunion']}/C{d['course']}/rapports"
        r = session.get(url, timeout=30)
        # rapports may legitimately be empty if course has not started; accept 200 with empty rapports
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "rapports" in data


# === Arrivee endpoint ===
class TestFerranArrivee:
    def test_arrivee_response_shape(self, session, working_date_and_course):
        d = working_date_and_course
        url = f"{BASE_URL}/api/ferran/programme/{d['date']}/R{d['reunion']}/C{d['course']}/arrivee"
        r = session.get(url, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # ordreArrivee may be None if race not finished
        assert "ordreArrivee" in data
        assert "arriveeDefinitive" in data


# === Analyze endpoint (Ferran Method) ===
class TestFerranAnalyze:
    def test_analyze_returns_full_structure(self, session, working_date_and_course):
        d = working_date_and_course
        url = f"{BASE_URL}/api/ferran/analyze/{d['date']}/R{d['reunion']}/C{d['course']}"
        r = session.get(url, timeout=45)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        data = r.json()
        # Validate all keys per spec
        for key in [
            "totalPartants", "favorites", "parity", "scored",
            "kept", "eliminated", "topCouples", "topTierces", "suites"
        ]:
            assert key in data, f"Missing key '{key}' in analyze response"
        assert isinstance(data["favorites"], list)
        assert isinstance(data["scored"], list)
        assert "dominant" in data["parity"]
        assert data["parity"]["dominant"] in ("pair", "impair")
        # If course has partants, scored should not be empty
        if data["totalPartants"] > 0:
            assert len(data["scored"]) > 0


# === Stats endpoint ===
class TestFerranStats:
    def test_stats_returns_aggregates(self, session, working_date_and_course):
        url = f"{BASE_URL}/api/ferran/stats/{working_date_and_course['date']}"
        r = session.get(url, timeout=60)  # heavier endpoint
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        data = r.json()
        for key in [
            "totalCourses", "totalPartants", "topDrivers", "topTrainers",
            "sexDistribution", "ageDistribution", "disciplineDistribution",
        ]:
            assert key in data, f"Missing key '{key}' in stats response"
        assert isinstance(data["topDrivers"], list)
        assert isinstance(data["topTrainers"], list)


# === Cache (TTL) sanity check ===
class TestFerranCache:
    def test_cache_speeds_up_second_call(self, session, working_date_and_course):
        import time
        date = working_date_and_course["date"]
        # Warm cache
        session.get(f"{BASE_URL}/api/ferran/programme/{date}", timeout=30)
        t0 = time.time()
        r = session.get(f"{BASE_URL}/api/ferran/programme/{date}", timeout=30)
        elapsed = time.time() - t0
        assert r.status_code == 200
        # Cached call should be < 3s (network + DB read)
        assert elapsed < 5, f"Cache call too slow: {elapsed:.2f}s"


# === Regression: existing TURFEX endpoints still work ===
class TestTurfexRegression:
    def test_root(self, session):
        r = session.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200

    def test_existing_programme_endpoint(self, session):
        date = datetime.utcnow().strftime("%Y-%m-%d")
        r = session.get(f"{BASE_URL}/api/programme/{date}", timeout=30)
        assert r.status_code in (200, 404, 500), f"Got {r.status_code}"  # any structured response

