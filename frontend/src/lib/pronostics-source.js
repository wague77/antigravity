
// Pronostics scoring algorithm — local, based on PMU API data
// Inputs: cotes (rapportFinal/rapportProbable), musique (recent form), numero, etc.
//
// PORTAGE FIDÈLE de src/lib/pronostics.ts (TURFEX SOURCE)
// Aucun changement d'algorithme, juste TS → JS.

// Parse "1a 2a 3a Da 5a" -> array of finishing positions (D/T/A treated as bad)
function parseMusique(musique) {
  if (!musique) return [];
  const tokens = musique.match(/(\d+|D|T|A|R)[a-z]?/gi) || [];
  return tokens
    .slice(0, 8)
    .map((t) => {
      const head = t[0].toUpperCase();
      if (head === "D" || head === "T" || head === "A" || head === "R") return 11; // disqualified-like
      const n = parseInt(t, 10);
      return isNaN(n) ? 11 : n;
    });
}

function formScoreFromMusique(musique) {
  const arr = parseMusique(musique);
  if (arr.length === 0) return 40;
  // Weighted: most recent counts more
  let total = 0;
  let weightSum = 0;
  arr.forEach((pos, i) => {
    const weight = arr.length - i;
    // pos 1 -> 100, pos 2 -> 85, pos 3 -> 70, pos 4 -> 55, pos 5 -> 45, 6 -> 35, ... 10+ -> 10
    const score = pos === 1 ? 100 : pos === 2 ? 85 : pos === 3 ? 72 : pos === 4 ? 58 : pos <= 6 ? 42 : pos <= 9 ? 25 : 8;
    total += score * weight;
    weightSum += weight;
  });
  return weightSum ? total / weightSum : 40;
}

function oddsScore(odds) {
  if (!odds || odds <= 0) return 30;
  // Lower odds = favorite. Map: 1.5 -> 95, 3 -> 80, 6 -> 60, 12 -> 40, 25+ -> 20
  if (odds <= 1.8) return 95;
  if (odds <= 2.5) return 88;
  if (odds <= 4) return 78;
  if (odds <= 7) return 65;
  if (odds <= 12) return 50;
  if (odds <= 20) return 35;
  if (odds <= 35) return 22;
  return 12;
}

function experienceScore(p) {
  const courses = p.nombreCourses ?? 0;
  const victoires = p.nombreVictoires ?? 0;
  const places = p.nombrePlaces ?? 0;
  if (courses === 0) return 35;
  const winRate = victoires / courses;
  const placeRate = (victoires + places) / courses;
  // 0..1 -> 0..100
  const score = winRate * 60 + placeRate * 40;
  // Boost for experienced horses
  const expBonus = Math.min(courses, 30) / 30 * 15;
  return Math.min(100, score * 100 + expBonus);
}

export function scoreParticipants(participants) {
  const valid = participants.filter((p) => (p.statut ?? "PARTANT") === "PARTANT");

  const scored = valid.map((p) => {
    const odds = p.dernierRapportDirect?.rapport ?? p.dernierRapportReference?.rapport;
    const formScore = formScoreFromMusique(p.musique);
    const oddsSc = oddsScore(odds);
    const expSc = experienceScore(p);

    // Weighted blend: odds 45%, form 35%, experience 20%
    const score = oddsSc * 0.45 + formScore * 0.35 + expSc * 0.2;

    return {
      ...p,
      formScore: Math.round(formScore),
      oddsScore: Math.round(oddsSc),
      experienceScore: Math.round(expSc),
      score: Math.round(score * 100) / 100,
      confidence: 0,
      rank: 0,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((p, i) => {
    p.rank = i + 1;
    // Confidence stars: top1 5★, top2 4★, top3 3★, top5 2★, rest 1★
    p.confidence = i === 0 ? 5 : i === 1 ? 4 : i === 2 ? 3 : i < 5 ? 2 : 1;
  });

  return scored;
}

export function getOdds(p) {
  return p.dernierRapportDirect?.rapport ?? p.dernierRapportReference?.rapport ?? null;
}

