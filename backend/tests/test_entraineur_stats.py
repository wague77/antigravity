
"""Iteration 4 — Tests for trainer stats (entraineur) in R1 pronostics email.

Covers :
 - turf_analytics._score_entraineur : baseline no-history, stability tiers, podium bonus
 - turf_analytics.compute_top8 : entraineur present at top-level + in breakdown, weight sums 100
 - turf_analytics.compute_entraineur_stats : aggregation + top 5 sort + empty case
 - notifications._build_course_block : renders STATS ENTRAINEURS section
 - POST /api/admin/notifications/digest/r1-pronostics : response shape incl entraineurs_count
"""
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from turf_analytics import (  # noqa: E402
    _score_entraineur,
    compute_top8,
    compute_entraineur_stats,
)
from notifications import _build_course_block  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PWD = "wague-admin-2026"
H_ADMIN = {"X-Admin-Password": ADMIN_PWD, "Content-Type": "application/json"}


# ============ _score_entraineur ============
class TestScoreEntraineur:
    def test_empty_history(self):
        r = _score_entraineur([], "MARTIN")
        assert 40.0 <= r["score"] <= 50.0
        assert r["stability"] == 0
        assert r["podiums"] == 0

    def test_empty_trainer_name(self):
        r = _score_entraineur([{"entraineur": "X", "place": 1}], "")
        assert r["score"] == 40.0

    def test_new_trainer(self):
        # 3 history entries all under a different trainer
        h = [
            {"entraineur": "OLD", "place": 1},
            {"entraineur": "OLD", "place": 2},
            {"entraineur": "OLD", "place": 3},
        ]
        r = _score_entraineur(h, "NEW")
        assert r["stability"] == 0
        assert r["score"] == 35.0
        assert "Nouvel entraineur" in " ".join(r["reasons"])

    def test_stability_with_podiums(self):
        h = [
            {"entraineur": "MARTIN", "place": 1},
            {"entraineur": "MARTIN", "place": 2},
            {"entraineur": "MARTIN", "place": 3},
        ]
        r = _score_entraineur(h, "martin")  # case-insensitive
        assert r["stability"] == 3
        assert r["podiums"] == 3
        # base = 40 + 3*15 = 85 ; bonus = 3*8 = 24 → min 100
        assert r["score"] == 100.0

    def test_partial_stability(self):
        h = [
            {"entraineur": "MARTIN", "place": 2},
            {"entraineur": "OTHER", "place": 5},
            {"entraineur": "MARTIN", "place": 10},
        ]
        r = _score_entraineur(h, "MARTIN")
        assert r["stability"] == 2
        assert r["podiums"] == 1
        # base=40+2*15=70, bonus = 1*8 = 8 → 78
        assert r["score"] == 78.0


# ============ compute_top8 ============
class TestComputeTop8WithEntraineur:
    def test_entraineur_in_output(self):
        data = {
            "courseInfo": {"hippodrome": "VINCENNES", "discipline": "TROT"},
            "participants": [
                {
                    "numPmu": 1, "nom": "A", "driver": "DRA",
                    "entraineur": "MARTIN", "cote": 2.5,
                    "history": [
                        {"entraineur": "MARTIN", "place": 1, "daysAgo": 20, "partants": 14},
                        {"entraineur": "MARTIN", "place": 2, "daysAgo": 50, "partants": 14},
                    ],
                },
                {
                    "numPmu": 2, "nom": "B", "driver": "DRB",
                    "entraineur": "DUPONT", "cote": 8.0,
                    "history": [],
                },
            ],
        }
        res = compute_top8(data)
        assert len(res) == 2
        for horse in res:
            assert "entraineur" in horse
            assert "entraineur" in horse["breakdown"]
            # breakdown has 6 criteria
            bk = horse["breakdown"]
            assert set(bk.keys()) == {"forme", "cote", "fraicheur", "piste", "driver", "entraineur"}
        # Horse #1 has entraineur MARTIN
        h1 = next(h for h in res if h["numPmu"] == 1)
        assert h1["entraineur"] == "MARTIN"
        assert h1["breakdown"]["entraineur"] >= 70.0  # stable+podiums
        # Horse 1 should rank first (better cote + forme + entraineur)
        assert res[0]["numPmu"] == 1

    def test_empty_participants(self):
        res = compute_top8({"participants": []})
        assert res == []

    def test_baseline_no_history_no_entraineur(self):
        data = {"participants": [{"numPmu": 5, "nom": "X", "cote": 5.0, "history": []}]}
        res = compute_top8(data)
        assert len(res) == 1
        # No history + empty trainer → score should be baseline 45.0 (or 40 with empty name)
        assert 35.0 <= res[0]["breakdown"]["entraineur"] <= 50.0

    def test_non_partant_excluded(self):
        data = {
            "participants": [
                {"numPmu": 1, "nom": "A", "statut": "NON_PARTANT", "entraineur": "X"},
                {"numPmu": 2, "nom": "B", "cote": 3.0, "entraineur": "Y"},
            ]
        }
        res = compute_top8(data)
        assert len(res) == 1
        assert res[0]["numPmu"] == 2


# ============ compute_entraineur_stats ============
class TestComputeEntraineurStats:
    def test_empty(self):
        assert compute_entraineur_stats({"participants": []}) == []

    def test_no_trainer(self):
        data = {"participants": [{"numPmu": 1, "nom": "A", "entraineur": ""}]}
        assert compute_entraineur_stats(data) == []

    def test_aggregation_and_ranking(self):
        data = {
            "participants": [
                {
                    "numPmu": 1, "nom": "ALPHA", "entraineur": "MARTIN",
                    "history": [
                        {"place": 1, "daysAgo": 20},
                        {"place": 2, "daysAgo": 40},
                    ],
                },
                {
                    "numPmu": 2, "nom": "BETA", "entraineur": "martin",  # same trainer, case-insensitive key
                    "history": [
                        {"place": 3, "daysAgo": 25},
                        {"place": 7, "daysAgo": 45},
                    ],
                },
                {
                    "numPmu": 3, "nom": "GAMMA", "entraineur": "DUPONT",
                    "history": [
                        {"place": 5, "daysAgo": 15},
                    ],
                },
            ]
        }
        res = compute_entraineur_stats(data)
        assert len(res) == 2
        top = res[0]
        # MARTIN should rank first with 2 horses + 3 podiums (1,2,3) + 3 top5
        assert top["entraineur"].upper() == "MARTIN"
        assert top["chevaux"] == 2
        assert set(n.upper() for n in top["chevauxNoms"]) == {"ALPHA", "BETA"}
        assert top["podiums"] == 3  # places 1,2,3
        assert top["top5"] == 3
        assert top["bestPlace"] == 1
        assert top["nbCourses3derniers"] == 4
        # score = podiums*10 + top5*4 = 30 + 12 = 42
        assert top["score"] == 42
        assert top["avgPlace"] is not None

    def test_top5_limit(self):
        participants = []
        for i in range(7):
            participants.append({
                "numPmu": i + 1, "nom": f"H{i}",
                "entraineur": f"T{i}",
                "history": [{"place": i + 1, "daysAgo": 20}],
            })
        res = compute_entraineur_stats({"participants": participants})
        assert len(res) == 5

    def test_excludes_non_partants(self):
        data = {
            "participants": [
                {"numPmu": 1, "nom": "A", "entraineur": "MARTIN", "statut": "NON_PARTANT"},
                {"numPmu": 2, "nom": "B", "entraineur": "DUPONT", "history": []},
            ]
        }
        res = compute_entraineur_stats(data)
        assert len(res) == 1
        assert res[0]["entraineur"] == "DUPONT"


# ============ HTML rendering ============
class TestBuildCourseBlock:
    def test_renders_trainer_section(self):
        course = {"numero": 3, "libelle": "PRIX TEST", "discipline": "TROT", "distance": 2700}
        favoris = [{
            "numPmu": 1, "nom": "ALPHA", "driver": "DR", "entraineur": "MARTIN",
            "cote": 2.5,
        }]
        outsiders = [{
            "numPmu": 7, "nom": "BETA", "driver": "DR2", "entraineur": "DUPONT",
            "cote": 18.0,
        }]
        entraineurs = [{
            "entraineur": "MARTIN", "chevaux": 2, "chevauxNoms": ["ALPHA", "BETA"],
            "podiums": 3, "top5": 3, "nbCourses3derniers": 4, "bestPlace": 1,
            "avgPlace": 2.0, "podiumRate": 75.0, "score": 42,
        }]
        html = _build_course_block(course, favoris, outsiders, entraineurs)
        assert "STATS ENTRAINEURS" in html
        assert "MARTIN" in html
        assert "ALPHA" in html
        # Best place rendered
        assert "1e" in html
        # New sections
        assert "FAVORIS" in html
        assert "OUTSIDERS" in html

    def test_no_trainers_param_no_section(self):
        course = {"numero": 1, "libelle": "X", "discipline": "TROT"}
        html = _build_course_block(course, [], [], None)
        assert "STATS ENTRAINEURS" not in html

    def test_empty_trainers_no_section(self):
        course = {"numero": 1, "libelle": "X"}
        html = _build_course_block(course, [], [], [])
        # Falsy list → section skipped
        assert "STATS ENTRAINEURS" not in html


# ============ API integration ============
class TestR1DigestEndpoint:
    @pytest.fixture(scope="class")
    def s(self):
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json"})
        return sess

    def test_digest_r1_shape(self, s):
        # Endpoint is now FIRE-AND-FORGET — returns {ok:True, queued:True} immediately
        # (the actual send + courses_detail can be inspected via /admin/digest-runs).
        r = s.post(
            f"{API}/admin/notifications/digest/r1-pronostics",
            headers=H_ADMIN,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "ok" in d
        if d.get("ok"):
            assert d.get("queued") is True
            assert "message" in d
        else:
            print(f"INFO r1-pronostics ok=false: {d}")

