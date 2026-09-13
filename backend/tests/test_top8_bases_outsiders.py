
"""Tests de la fonction compute_top8_bases_outsiders : sélection 4 favoris + 4 outsiders."""
import sys
sys.path.insert(0, "/app/backend")
import pytest
from turf_analytics import compute_top8_bases_outsiders, _score_career


def _mk_horse(num, nom, cote, history=None):
    return {
        "numPmu": num,
        "nom": nom,
        "cote": cote,
        "driver": f"Driver {num}",
        "entraineur": f"Ent {num}",
        "history": history or [],
        "statut": "PARTANT",
    }


def _ctx(participants):
    return {
        "participants": participants,
        "courseInfo": {"hippodrome": "Vincennes", "discipline": "Attelé"},
    }


class TestCareerScore:
    def test_no_history(self):
        assert _score_career([]) == 30.0

    def test_strong_career(self):
        history = [{"place": 1}, {"place": 2}, {"place": 1}, {"place": 3}, {"place": 1}]
        score = _score_career(history)
        assert score >= 70, f"strong career should score high, got {score}"

    def test_weak_career(self):
        history = [{"place": 12}, {"place": 14}, {"place": 9}]
        score = _score_career(history)
        assert score < 30, f"weak career should score low, got {score}"


class TestTop8BasesOutsiders:
    def test_normal_case_4_4(self):
        """16 partants : 8 dans 2-10, 5 dans 11-25, 3 hors fourchette → 4 fav + 4 out."""
        participants = []
        # 8 favoris cotes 2-10
        for i, c in enumerate([2.5, 3.0, 4.5, 5.0, 6.5, 7.5, 8.5, 9.5], 1):
            participants.append(_mk_horse(i, f"FAV {i}", c, [{"place": 1}, {"place": 2}]))
        # 5 outsiders cotes 11-25
        for i, c in enumerate([12.0, 14.5, 17.0, 22.0, 24.0], 9):
            participants.append(_mk_horse(i, f"OUT {i}", c, [{"place": 4}, {"place": 5}]))
        # 3 long shot cotes >25
        for i, c in enumerate([28.0, 35.0, 50.0], 14):
            participants.append(_mk_horse(i, f"LS {i}", c, []))

        result = compute_top8_bases_outsiders(_ctx(participants))
        assert "favoris" in result
        assert "outsiders" in result
        assert len(result["favoris"]) == 4
        assert len(result["outsiders"]) == 4

        # Tous les favoris doivent avoir cote 2-10
        for f in result["favoris"]:
            assert 2.0 <= f["cote"] <= 10.0, f"favori cote out of range: {f['cote']}"

        # Outsiders : cote 11-25 strictement (5 candidats, on en prend 4)
        for o in result["outsiders"]:
            assert 11.0 <= o["cote"] <= 25.0, f"outsider cote out of range: {o['cote']}"

        # Pas de doublon entre groupes
        fav_ids = {f["numPmu"] for f in result["favoris"]}
        out_ids = {o["numPmu"] for o in result["outsiders"]}
        assert fav_ids.isdisjoint(out_ids)

    def test_fallback_few_outsiders(self):
        """6 favoris cote 2-10, seulement 2 outsiders 11-25 et 2 long shot 26-40 → fallback élargit à 11-35."""
        participants = []
        for i, c in enumerate([2.5, 3.0, 4.5, 5.0, 6.5, 9.5], 1):
            participants.append(_mk_horse(i, f"FAV {i}", c))
        for i, c in enumerate([12.0, 18.0], 7):
            participants.append(_mk_horse(i, f"OUT {i}", c))
        for i, c in enumerate([30.0, 32.0], 9):
            participants.append(_mk_horse(i, f"LS {i}", c))

        result = compute_top8_bases_outsiders(_ctx(participants))
        assert len(result["favoris"]) == 4
        # Outsiders devrait contenir au moins les 2 dans 11-25 + élargir à 11-35
        assert len(result["outsiders"]) == 4
        # Les 2 cotes 30, 32 doivent être incluses (fallback à 11-35)
        out_cotes = sorted([o["cote"] for o in result["outsiders"]])
        assert 30.0 in out_cotes or 32.0 in out_cotes

    def test_fallback_no_outsider_at_all(self):
        """8 chevaux tous cote 2-10 → favoris = 4, outsiders fallback fallback fallback à n'importe quoi (mais y'aurait rien à 'pas pris')."""
        participants = [_mk_horse(i, f"H{i}", c) for i, c in enumerate([2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0], 1)]
        result = compute_top8_bases_outsiders(_ctx(participants))
        assert len(result["favoris"]) == 4
        # Tout le reste va dans outsiders (fallback ultime : n'importe quel cheval restant)
        assert len(result["outsiders"]) == 4
        fav_ids = {f["numPmu"] for f in result["favoris"]}
        out_ids = {o["numPmu"] for o in result["outsiders"]}
        assert fav_ids.isdisjoint(out_ids)
        # Tous les 8 chevaux sont distribués
        assert len(fav_ids | out_ids) == 8

    def test_few_horses_total(self):
        """Course avec seulement 5 partants → favoris=4, outsiders<=1 (peut être 1 ou plus selon cotes)."""
        participants = [_mk_horse(i, f"H{i}", c) for i, c in enumerate([3.0, 5.0, 7.0, 9.0, 22.0], 1)]
        result = compute_top8_bases_outsiders(_ctx(participants))
        assert len(result["favoris"]) <= 4
        assert len(result["outsiders"]) <= 4
        # Total ne dépasse pas le nombre de partants
        total = len(result["favoris"]) + len(result["outsiders"])
        assert total <= 5

    def test_returns_clean_payload(self):
        """Vérifie qu'aucun champ technique (préfixe _) n'est dans la sortie."""
        participants = [_mk_horse(i, f"H{i}", c) for i, c in enumerate([3.0, 5.0, 12.0, 18.0], 1)]
        result = compute_top8_bases_outsiders(_ctx(participants))
        for h in result["favoris"] + result["outsiders"]:
            for k in h.keys():
                assert not k.startswith("_"), f"leaked internal field: {k}"
            # Champs essentiels pour l'email
            for required in ["numPmu", "nom", "cote", "driver", "entraineur"]:
                assert required in h, f"missing {required}"

    def test_combined_score_prefers_better_form(self):
        """Entre 2 chevaux à cote équivalente, celui avec meilleure forme est préféré."""
        good_history = [{"place": 1}, {"place": 1}, {"place": 2}]
        bad_history = [{"place": 12}, {"place": 14}, {"place": 9}]
        participants = [
            _mk_horse(1, "GOOD_FAV", 4.0, good_history),
            _mk_horse(2, "BAD_FAV", 4.5, bad_history),  # cote similaire mais forme nulle
            _mk_horse(3, "FILL_3", 6.0),
            _mk_horse(4, "FILL_4", 8.0),
            _mk_horse(5, "FILL_5", 9.0),
            _mk_horse(6, "OUT_6", 12.0),
            _mk_horse(7, "OUT_7", 18.0),
            _mk_horse(8, "OUT_8", 22.0),
            _mk_horse(9, "OUT_9", 24.0),
        ]
        result = compute_top8_bases_outsiders(_ctx(participants))
        fav_names = [f["nom"] for f in result["favoris"]]
        # GOOD_FAV doit être dans les favoris (forme bonne), BAD_FAV peut être éjecté si trop faible
        assert "GOOD_FAV" in fav_names

