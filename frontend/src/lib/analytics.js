
// Moteur d'analyse heuristique pour la détection
// Favoris / Outsiders / Tocards et scoring multi-critères

// ============ FORME (0-100) ============
// Pondération des 3 dernières courses : 50% n-1 + 30% n-2 + 20% n-3
const placeToPoints = (place, partants) => {
  if (!place || place <= 0) return 0;
  if (!partants || partants <= 0) partants = 16;
  if (place === 1) return 100;
  if (place === 2) return 85;
  if (place === 3) return 75;
  if (place <= 5) return 60;
  const ratio = place / partants;
  if (ratio <= 0.4) return 50;
  if (ratio <= 0.6) return 35;
  if (ratio <= 0.8) return 20;
  return 10;
};

export const computeFormScore = (history = []) => {
  const weights = [0.5, 0.3, 0.2];
  let score = 0;
  let weightSum = 0;
  history.slice(0, 3).forEach((h, i) => {
    if (!h || !h.partants) return;
    const pts = placeToPoints(h.place, h.partants);
    score += pts * weights[i];
    weightSum += weights[i];
  });
  if (weightSum === 0) return null;
  return Math.round(score / weightSum);
};

// ============ TENDANCE COTE (montée/baisse/stable) ============
export const computeCoteTrend = (cote, coteRef) => {
  if (cote == null || coteRef == null) return null;
  const diff = cote - coteRef;
  const ratio = coteRef > 0 ? diff / coteRef : 0;
  if (ratio < -0.10) return { dir: "down", label: "↘ baisse", color: "text-green-700" };
  if (ratio > 0.10) return { dir: "up", label: "↗ monte", color: "text-red-700" };
  return { dir: "flat", label: "→ stable", color: "text-gray-600" };
};

// ============ COMPATIBILITÉ DISTANCE/DISCIPLINE ============
export const computeDistanceMatch = (history = [], currentDistance, currentDiscipline) => {
  if (!history.length || !currentDistance) return null;
  const sameDist = history.filter(
    (h) => h.distance && Math.abs(h.distance - currentDistance) <= 200
  ).length;
  const sameDisc = currentDiscipline
    ? history.filter((h) => h.discipline === currentDiscipline).length
    : history.length;
  if (sameDist >= 2 && sameDisc >= 2) return { level: "specialist", label: "Spécialiste", color: "bg-green-300 text-green-900" };
  if (sameDisc < 1 && currentDiscipline) return { level: "off", label: "Hors registre", color: "bg-red-300 text-red-900" };
  if (sameDist === 0) return { level: "adapt", label: "Adaptation", color: "bg-yellow-300 text-yellow-900" };
  return { level: "ok", label: "OK", color: "bg-blue-200 text-blue-900" };
};

// ============ CONTINUITÉ DRIVER ============
export const computeDriverContinuity = (currentDriver, history = []) => {
  if (!currentDriver || !history.length) return null;
  const driverInHistory = history.map((h) => (h.driver || "").trim()).filter(Boolean);
  const sameCount = driverInHistory.filter((d) => d === currentDriver).length;
  const winnerWith = history.find((h) => h.driver === currentDriver && h.place && h.place <= 3);
  if (winnerWith) return { level: "winner", label: "Driver gagnant", color: "bg-yellow-300 text-yellow-900" };
  if (sameCount >= 2) return { level: "loyal", label: "Driver fidèle", color: "bg-green-200 text-green-900" };
  if (sameCount === 0) return { level: "new", label: "Nouveau driver", color: "bg-orange-200 text-orange-900" };
  return { level: "ok", label: "Driver récurrent", color: "bg-blue-200 text-blue-900" };
};

// ============ ÉVOLUTION DE CLASSE (allocation) ============
export const computeClassEvolution = (history = [], currentAllocation) => {
  if (!history.length || !currentAllocation) return null;
  const allocs = history.map((h) => h.allocation || 0).filter((a) => a > 0);
  if (!allocs.length) return null;
  const avg = allocs.reduce((a, b) => a + b, 0) / allocs.length;
  const ratio = currentAllocation / avg;
  if (ratio > 1.3) return { level: "up", label: "Montée de classe", color: "bg-orange-300 text-orange-900" };
  if (ratio < 0.7) return { level: "down", label: "Descente de classe", color: "bg-green-300 text-green-900" };
  return { level: "same", label: "Même niveau", color: "bg-blue-200 text-blue-900" };
};

// ============ PATTERN DE REPOS ============
export const computeRestPattern = (restDays) => {
  if (restDays == null) return null;
  if (restDays < 7) return { level: "short", label: "Repos court", color: "bg-orange-200 text-orange-900" };
  if (restDays <= 21) return { level: "optimal", label: "Repos optimal", color: "bg-green-300 text-green-900" };
  if (restDays <= 60) return { level: "ok", label: "Repos correct", color: "bg-yellow-200 text-yellow-900" };
  if (restDays <= 90) return { level: "long", label: "Long repos", color: "bg-blue-200 text-blue-900" };
  return { level: "rust", label: "Rouille", color: "bg-red-200 text-red-900" };
};

// ============ HISTORIQUE SUR L'HIPPODROME ============
export const computeHippodromeRecord = (history = [], currentHippodrome) => {
  if (!currentHippodrome || !history.length) return null;
  const hippoLow = currentHippodrome.toLowerCase();
  const hits = history.filter((h) => (h.hippodrome || "").toLowerCase().includes(hippoLow.slice(0, 6)));
  if (!hits.length) return { level: "new", label: "Premier sur ce track", color: "bg-gray-200 text-gray-700" };
  const best = Math.min(...hits.map((h) => h.place || 99));
  if (best <= 3) return { level: "expert", label: `🏟 Spécialiste (${best}er ici)`, color: "bg-green-300 text-green-900 font-bold" };
  if (best <= 6) return { level: "knows", label: `Connaît (${best}e ici)`, color: "bg-yellow-200 text-yellow-900" };
  return { level: "bad", label: `Difficulté ici`, color: "bg-red-200 text-red-900" };
};

// ============ VALUE BET (cote vs CAF) ============
export const computeValueBet = (caf, cafRank, totalCount, cote) => {
  if (!cote || cote <= 0 || !caf) return null;
  // Probabilité implicite du marché (1/cote, simplifié sans marge bookmaker)
  const marketProb = 1 / cote;
  // Probabilité estimée par le rang CAF (top 1 = haute, dernier = basse)
  if (!cafRank || !totalCount) return null;
  const cafProb = Math.max(0.01, 1 - (cafRank - 1) / totalCount);
  // Si cafProb >> marketProb → value bet
  const edge = cafProb / marketProb;
  if (edge > 2.0 && cote >= 6) return { flag: "huge", label: "🔥 GROS VALUE", color: "bg-pink-500 text-white" };
  if (edge > 1.4 && cote >= 4) return { flag: "value", label: "🔥 Value bet", color: "bg-pink-300 text-pink-900" };
  if (edge < 0.6) return { flag: "trap", label: "⚠ Piège ?", color: "bg-gray-200 text-gray-700" };
  return null;
};

// ============ CATÉGORISATION FAVORI / OUTSIDER / TOCARD ============
export const categorize = ({ cote, cafRank, totalCount, formScore }) => {
  const rankRatio = cafRank && totalCount ? cafRank / totalCount : 0.5;
  const isCafTop3 = cafRank && cafRank <= 3;
  const isCafTop7 = cafRank && cafRank <= 7;
  const isCafTop10 = cafRank && cafRank <= 10;
  const f = formScore ?? 50;

  if (cote != null && cote < 5) {
    if (isCafTop3 && f > 70) return { type: "fav-solid", label: "Favori solide", icon: "🟢", color: "bg-green-400 text-green-900 border-green-700", action: "À jouer en base" };
    if (isCafTop10 && f > 50) return { type: "fav-ok", label: "Favori correct", icon: "🟢", color: "bg-green-200 text-green-900 border-green-600", action: "Base possible" };
    return { type: "fav-doubt", label: "Favori douteux", icon: "🟡", color: "bg-yellow-200 text-yellow-900 border-yellow-600", action: "À éviter" };
  }
  if (cote != null && cote >= 5 && cote < 8) {
    if (isCafTop7 && f > 60) return { type: "second-fav", label: "Second favori", icon: "🟢", color: "bg-green-200 text-green-900 border-green-600", action: "Bon profil" };
    return { type: "second-fav-mid", label: "Outsider proche", icon: "🟡", color: "bg-yellow-100 text-yellow-900 border-yellow-500", action: "À surveiller" };
  }
  if (cote != null && cote >= 8 && cote < 25) {
    if (isCafTop7 && f > 60) return { type: "outsider-value", label: "Outsider VALUE", icon: "🔵🔥", color: "bg-blue-300 text-blue-900 border-blue-700 font-bold", action: "🔥 Coup à tenter" };
    if (isCafTop10) return { type: "outsider", label: "Outsider", icon: "🔵", color: "bg-blue-100 text-blue-900 border-blue-500", action: "À surveiller" };
    return { type: "outsider-weak", label: "Outsider faible", icon: "⚪", color: "bg-gray-200 text-gray-700 border-gray-400", action: "Risqué" };
  }
  // cote >= 25 ou inconnue
  if (isCafTop10 && f > 65) return { type: "tocard-surprise", label: "Tocard SURPRISE", icon: "🔴⭐", color: "bg-red-300 text-red-900 border-red-700 font-bold", action: "Coup tenté risqué" };
  if (isCafTop10) return { type: "tocard-monitor", label: "Tocard à surveiller", icon: "🔴", color: "bg-red-200 text-red-900 border-red-500", action: "Possible surprise" };
  return { type: "tocard-avoid", label: "Tocard à éviter", icon: "⚫", color: "bg-gray-300 text-gray-600 border-gray-500", action: "À fuir" };
};

// ============ NOTE COMPOSITE A+ → E ============
export const computeGrade = ({ formScore, cafRank, totalCount, cote, restPattern, distanceMatch, valueBet }) => {
  let score = 0;
  // Forme : 0-25 pts
  score += ((formScore ?? 40) / 100) * 25;
  // Rang CAF : 0-30 pts
  if (cafRank && totalCount) {
    score += Math.max(0, (1 - (cafRank - 1) / totalCount)) * 30;
  } else {
    score += 10;
  }
  // Cote : 0-15 pts (favorise les cotes basses, mais bonus value)
  if (cote != null && cote > 0) {
    if (cote < 4) score += 12;
    else if (cote < 8) score += 14;
    else if (cote < 15) score += 11;
    else if (cote < 25) score += 7;
    else score += 3;
  } else {
    score += 5;
  }
  // Repos : 0-10 pts
  if (restPattern?.level === "optimal") score += 10;
  else if (restPattern?.level === "ok") score += 7;
  else if (restPattern?.level === "long") score += 5;
  else if (restPattern?.level === "short") score += 3;
  else if (restPattern?.level === "rust") score += 1;
  // Distance match : 0-10 pts
  if (distanceMatch?.level === "specialist") score += 10;
  else if (distanceMatch?.level === "ok") score += 7;
  else if (distanceMatch?.level === "adapt") score += 4;
  else if (distanceMatch?.level === "off") score += 1;
  // Bonus value bet : 0-10 pts
  if (valueBet?.flag === "huge") score += 10;
  else if (valueBet?.flag === "value") score += 6;

  // → grade A+ = 80+, A = 70-79, B = 55-69, C = 40-54, D = 25-39, E < 25
  let grade, color;
  if (score >= 80) { grade = "A+"; color = "bg-emerald-500 text-white"; }
  else if (score >= 70) { grade = "A"; color = "bg-emerald-300 text-emerald-900"; }
  else if (score >= 55) { grade = "B"; color = "bg-blue-300 text-blue-900"; }
  else if (score >= 40) { grade = "C"; color = "bg-yellow-300 text-yellow-900"; }
  else if (score >= 25) { grade = "D"; color = "bg-orange-300 text-orange-900"; }
  else { grade = "E"; color = "bg-red-300 text-red-900"; }
  return { grade, color, score: Math.round(score) };
};

// ============ SÉRIE EN COURS (du cheval) ============
export const computeSeries = (history = []) => {
  if (!history.length) return null;
  const places = history.slice(0, 3).map((h) => h.place || 0).filter((p) => p > 0);
  if (!places.length) return null;
  const top3 = places.filter((p) => p <= 3).length;
  const flops = places.filter((p) => p > 6).length;
  if (top3 >= 3) return { level: "fire", label: "🔥 EN FEU (3 top 3)", color: "bg-red-500 text-white font-bold" };
  if (top3 >= 2) return { level: "hot", label: "🔥 En forme", color: "bg-orange-400 text-orange-950 font-bold" };
  if (flops >= 3) return { level: "cold", label: "❄️ En froid", color: "bg-blue-300 text-blue-900" };
  if (places[0] <= 3 && places[1] > 5) return { level: "comeback", label: "⭐ Redémarrage", color: "bg-green-300 text-green-900 font-bold" };
  return null;
};

// ============ KELLY CRITERION ============
// f* = (b·p - q) / b
// b = cote-1, p = probabilité estimée de gagner, q = 1-p
export const computeKelly = (cote, estimatedProb, fraction = 0.25) => {
  if (!cote || cote <= 1 || !estimatedProb) return null;
  const b = cote - 1;
  const p = Math.max(0, Math.min(1, estimatedProb));
  const q = 1 - p;
  const f = (b * p - q) / b;
  if (f <= 0) return { fraction: 0, label: "Ne pas miser", color: "bg-gray-200 text-gray-700" };
  // Kelly fractionnaire (1/4 recommandé pour gestion prudente)
  const frac = f * fraction;
  let color = "bg-green-300 text-green-900";
  if (frac > 0.05) color = "bg-yellow-300 text-yellow-900";
  if (frac > 0.10) color = "bg-orange-300 text-orange-900";
  return {
    fraction: Math.min(0.15, frac),
    percent: Math.round(Math.min(0.15, frac) * 10000) / 100,
    label: `${Math.round(Math.min(0.15, frac) * 10000) / 100}%`,
    full: Math.round(f * 10000) / 100,
    color,
  };
};

// ============ INDICE DE DIFFICULTÉ DE LA COURSE ============
// Retourne FACILE / MOYENNE / DIFFICILE selon plusieurs critères
export const computeCourseDifficulty = (analyses, currentCourse = {}) => {
  if (!analyses || analyses.length < 3) return null;

  let score = 0; // score de difficulté (0 = facile, 100 = ultra difficile)
  const details = [];

  // 1) Dispersion des cotes (écart favori ↔ 5ème) — 25 pts max
  const cotes = analyses.map((a) => a.cote).filter((c) => c != null && c > 0).sort((a, b) => a - b);
  if (cotes.length >= 5) {
    const ratio = cotes[4] / cotes[0];
    if (ratio < 3) { score += 25; details.push({ icon: "🎯", text: "Cotes resserrées (top 5 très proche)", weight: 25 }); }
    else if (ratio < 6) { score += 12; details.push({ icon: "📊", text: "Cotes moyennement dispersées", weight: 12 }); }
    else { details.push({ icon: "👑", text: "Favori net sur le papier", weight: 0 }); }
  }

  // 2) Écart des scores composites entre top 3 — 20 pts max
  const scores = analyses.map((a) => a.grade?.score ?? 0).sort((a, b) => b - a);
  if (scores.length >= 3) {
    const gap = scores[0] - scores[2];
    if (gap < 8) { score += 20; details.push({ icon: "⚖️", text: "Top 3 très serré (écart score < 8)", weight: 20 }); }
    else if (gap < 15) { score += 10; details.push({ icon: "🎲", text: "Top 3 assez serré", weight: 10 }); }
    else { details.push({ icon: "🏆", text: "Leader clairement détaché", weight: 0 }); }
  }

  // 3) Nombre de partants — 15 pts max
  const n = analyses.length;
  if (n >= 18) { score += 15; details.push({ icon: "👥", text: `${n} partants (peloton massif)`, weight: 15 }); }
  else if (n >= 14) { score += 8; details.push({ icon: "👥", text: `${n} partants`, weight: 8 }); }
  else { details.push({ icon: "👥", text: `${n} partants (peu nombreux)`, weight: 0 }); }

  // 4) Nombre de catégories A+/A — 15 pts (inversé : peu de A = difficile car ouvert)
  const topGrades = analyses.filter((a) => a.grade?.grade === "A+" || a.grade?.grade === "A").length;
  if (topGrades === 0) { score += 15; details.push({ icon: "❓", text: "Aucun cheval grade A (course ouverte)", weight: 15 }); }
  else if (topGrades === 1) { details.push({ icon: "⭐", text: "1 seul grade A — favori logique", weight: 0 }); }
  else if (topGrades <= 3) { score += 8; details.push({ icon: "⚡", text: `${topGrades} chevaux grade A`, weight: 8 }); }
  else { score += 15; details.push({ icon: "💥", text: `${topGrades} chevaux grade A (très ouverte)`, weight: 15 }); }

  // 5) Type de discipline — 10 pts
  const disc = (currentCourse?.discipline || "").toLowerCase();
  if (disc.includes("handicap") || disc.includes("apprent")) {
    score += 10;
    details.push({ icon: "🧩", text: "Course Handicap/Apprentis (plus aléatoire)", weight: 10 });
  } else if (disc.includes("obstacle") || disc.includes("haie") || disc.includes("steeple")) {
    score += 8;
    details.push({ icon: "🚧", text: "Obstacle (chutes possibles)", weight: 8 });
  }

  // 6) Nombre de courses avec changement de driver — 5 pts
  const driverChanges = analyses.filter((a) => a.driverContinuity?.level === "new").length;
  if (driverChanges >= 5) {
    score += 5;
    details.push({ icon: "🏇", text: `${driverChanges} changements de driver`, weight: 5 });
  }

  // 7) Nombre de chevaux avec repos risqué — 10 pts
  const riskyRest = analyses.filter((a) => ["rust", "short"].includes(a.restPattern?.level)).length;
  if (riskyRest >= 5) {
    score += 10;
    details.push({ icon: "😴", text: `${riskyRest} chevaux avec repos risqué`, weight: 10 });
  }

  // Normalise à 0-100
  score = Math.min(100, score);

  let level, badge, colorBadge, strategy;
  if (score < 30) {
    level = "EASY";
    badge = "FACILE";
    colorBadge = "bg-gradient-to-r from-green-400 to-emerald-500 text-white";
    strategy = {
      title: "Course lisible — favori logique",
      bets: [
        "✅ **Simple gagnant** sur le favori (grade A+)",
        "✅ **Couplé ordre** Top 2 CAF",
        "⚠️ Éviter les gros champs (peu de surprise à attendre)",
      ],
    };
  } else if (score < 60) {
    level = "MEDIUM";
    badge = "MOYENNE";
    colorBadge = "bg-gradient-to-r from-yellow-400 to-orange-400 text-black";
    strategy = {
      title: "Course équilibrée — 3-5 candidats sérieux",
      bets: [
        "✅ **Tiercé désordre** Top 3 score composite",
        "✅ **Couplé désordre** sur 2 grades A",
        "💡 Value bets à surveiller",
      ],
    };
  } else {
    level = "HARD";
    badge = "DIFFICILE";
    colorBadge = "bg-gradient-to-r from-red-500 to-pink-600 text-white";
    strategy = {
      title: "Course ouverte — surprise probable",
      bets: [
        "🎲 **Quinté+ champ réduit** (5-7 chevaux)",
        "🎯 **Trio ordre/désordre** large",
        "⚠️ Ne pas miser gros — mise conservatoire",
        "💡 Chercher les tocards surprise (grade B+/C+ avec cote élevée)",
      ],
    };
  }

  return { score, level, badge, colorBadge, strategy, details };
};

// ============ ÉCURIE DU JOUR ============
// Détecte si plusieurs chevaux partagent le même entraîneur ou driver
export const computeStables = (analyses) => {
  const byEntraineur = {};
  const byDriver = {};
  analyses.forEach((a) => {
    if (a.entraineur) {
      byEntraineur[a.entraineur] = byEntraineur[a.entraineur] || [];
      byEntraineur[a.entraineur].push(a.num);
    }
    if (a.driver) {
      byDriver[a.driver] = byDriver[a.driver] || [];
      byDriver[a.driver].push(a.num);
    }
  });
  const entMultiple = Object.entries(byEntraineur).filter(([_, nums]) => nums.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const drvMultiple = Object.entries(byDriver).filter(([_, nums]) => nums.length >= 2).sort((a, b) => b[1].length - a[1].length);
  return {
    entraineurs: entMultiple.map(([nom, nums]) => ({ nom, nums, count: nums.length })),
    drivers: drvMultiple.map(([nom, nums]) => ({ nom, nums, count: nums.length })),
  };
};

// ============ DÉTECTION DE "COUPS PRÉPARÉS" ============
// Identifie les chevaux avec un cumul de signaux positifs cachés
// (descente de classe, repos optimal, série en cours, value bet, etc.)
export const detectCoupPrepare = (analysis) => {
  const signals = [];
  let score = 0;

  // 1) Descente de classe (catégorie plus accessible) — 20 pts
  if (analysis.classEvolution?.level === "down") {
    signals.push({ icon: "⬇️", text: "Descente de catégorie", weight: 20 });
    score += 20;
  }

  // 2) Repos optimal — 15 pts
  if (analysis.restPattern?.level === "optimal") {
    signals.push({ icon: "💪", text: "Repos optimal (7-21j)", weight: 15 });
    score += 15;
  }

  // 3) Série en feu / comeback — 20 pts
  if (analysis.series?.level === "fire") {
    signals.push({ icon: "🔥", text: "En feu (3 top 3)", weight: 20 });
    score += 20;
  } else if (analysis.series?.level === "comeback") {
    signals.push({ icon: "⭐", text: "Redémarrage (n-1 réussi)", weight: 18 });
    score += 18;
  } else if (analysis.series?.level === "hot") {
    signals.push({ icon: "🔥", text: "En forme", weight: 12 });
    score += 12;
  }

  // 4) Driver fidèle gagnant — 12 pts
  if (analysis.driverContinuity?.level === "winner") {
    signals.push({ icon: "🏆", text: "Driver gagnant", weight: 12 });
    score += 12;
  } else if (analysis.driverContinuity?.level === "loyal") {
    signals.push({ icon: "👥", text: "Driver fidèle", weight: 6 });
    score += 6;
  }

  // 5) Spécialiste de l'hippodrome — 12 pts
  if (analysis.hippodromeRecord?.level === "expert") {
    signals.push({ icon: "🏟", text: "Spécialiste de l'hippodrome", weight: 12 });
    score += 12;
  }

  // 6) Spécialiste distance/discipline — 10 pts
  if (analysis.distanceMatch?.level === "specialist") {
    signals.push({ icon: "📏", text: "Spécialiste de la distance", weight: 10 });
    score += 10;
  }

  // 7) Value bet — 18 pts (signal très puissant)
  if (analysis.valueBet?.flag === "huge") {
    signals.push({ icon: "🔥", text: "GROS value bet (CAF >> cote)", weight: 18 });
    score += 18;
  } else if (analysis.valueBet?.flag === "value") {
    signals.push({ icon: "🔥", text: "Value bet", weight: 10 });
    score += 10;
  }

  // 8) Forme excellente — 10 pts
  if (analysis.formScore && analysis.formScore >= 75) {
    signals.push({ icon: "📈", text: `Forme excellente (${analysis.formScore})`, weight: 10 });
    score += 10;
  }

  // 9) Cote attractive (entre 5 et 25) — 8 pts
  if (analysis.cote != null && analysis.cote >= 5 && analysis.cote <= 25) {
    signals.push({ icon: "💰", text: `Cote attractive (${analysis.cote.toFixed(1)})`, weight: 8 });
    score += 8;
  }

  // 10) Cote en baisse (argent intelligent) — 10 pts
  if (analysis.coteTrend?.dir === "down") {
    signals.push({ icon: "↘", text: "Cote en baisse (argent malin)", weight: 10 });
    score += 10;
  }

  // Verdict
  if (score < 25) return null; // pas assez de signaux
  let level, badge, color;
  if (score >= 70) {
    level = "alpha";
    badge = "🚨 COUP ALPHA";
    color = "bg-gradient-to-r from-red-500 to-pink-500 text-white";
  } else if (score >= 50) {
    level = "strong";
    badge = "⭐ COUP FORT";
    color = "bg-gradient-to-r from-orange-400 to-yellow-400 text-black";
  } else {
    level = "watch";
    badge = "👀 À SURVEILLER";
    color = "bg-blue-300 text-blue-900";
  }
  return { score, level, badge, color, signals };
};

// ============ STATS AGRÉGÉES DRIVER / ENTRAÎNEUR ============
// Calcule à partir des histoires de tous les chevaux scrapés
export const computeDriverStats = (horses, key = "driver") => {
  const stats = {};
  Object.values(horses).forEach((h) => {
    if (!h) return;
    const pastDriver = (h.history || []).map((x) => x[key === "driver" ? "driver" : key]).filter(Boolean);
    pastDriver.forEach((name, i) => {
      if (!stats[name]) stats[name] = { name, rides: 0, top3: 0, top1: 0, allocations: 0 };
      stats[name].rides += 1;
      const place = h.history?.[i]?.place;
      const allocation = h.history?.[i]?.allocation;
      if (place === 1) stats[name].top1 += 1;
      if (place && place <= 3) stats[name].top3 += 1;
      if (allocation) stats[name].allocations += allocation;
    });
  });
  // Convertit en tableau trié + ROI estimé
  return Object.values(stats)
    .map((s) => ({
      ...s,
      winRate: s.rides > 0 ? Math.round((s.top1 / s.rides) * 100) : 0,
      placeRate: s.rides > 0 ? Math.round((s.top3 / s.rides) * 100) : 0,
      heat: s.placeRate > 50 ? "fire" : s.placeRate > 30 ? "warm" : "cold",
    }))
    .sort((a, b) => b.placeRate - a.placeRate || b.rides - a.rides);
};

// ============ AVANTAGE DE CORDE (uniquement plat/obstacle) ============
// La corde indique de quel côté l'hippodrome courbe :
//   - "GAUCHE" → corde intérieure = petits numéros (1, 2, 3...)
//   - "DROITE" → corde intérieure = grands numéros
// En trot (ATTELE/MONTE), les chevaux partent en autostart ou volte → pas d'avantage de corde.
export const computeCordeAdvantage = (num, corde, discipline, totalPartants = 16) => {
  if (!num || !corde) return null;
  const disc = (discipline || "").toUpperCase();
  // Trot = pas pertinent
  if (disc.includes("ATTELE") || disc.includes("MONTE")) {
    return null;
  }
  const cordeUp = String(corde).toUpperCase().trim();
  if (cordeUp.includes("NSP") || cordeUp === "") return null;

  const n = parseInt(num, 10);
  const total = parseInt(totalPartants, 10) || 16;
  // L'effet est plus net en plat qu'en obstacle (haies/steeple/cross)
  const isPlat = disc.includes("PLAT");

  // Détermine la "distance à la corde idéale" (en numéros)
  let distFromInside;
  if (cordeUp.includes("GAUCHE")) {
    distFromInside = n - 1; // n=1 → 0 (idéal), n=2 → 1, ...
  } else if (cordeUp.includes("DROITE")) {
    distFromInside = total - n; // n=total → 0 (idéal)
  } else {
    return null;
  }

  if (distFromInside <= 1) {
    return {
      level: "ideal",
      label: isPlat ? "🏁 Corde idéale" : "Corde favorable",
      color: "bg-green-400 text-green-900 font-bold",
    };
  }
  if (distFromInside <= 3) {
    return {
      level: "good",
      label: "Bonne corde",
      color: "bg-green-200 text-green-800",
    };
  }
  if (distFromInside >= total - 3) {
    return {
      level: "bad",
      label: isPlat ? "⚠ Corde extérieure" : "Corde défavorable",
      color: "bg-red-200 text-red-800",
    };
  }
  return {
    level: "neutral",
    label: "Corde neutre",
    color: "bg-gray-100 text-gray-600",
  };
};

// ============ ANALYSE COMPLÈTE D'UN PARTANT ============
export const analyzeHorse = (horse, ctx) => {
  // ctx = { cafRank, totalCount, currentCourse: { distance, discipline, allocation, hippodrome, corde } }
  const { cafRank, totalCount, currentCourse = {} } = ctx;
  const formScore = computeFormScore(horse.history);
  const coteTrend = computeCoteTrend(horse.cote, horse.coteRef);
  const distanceMatch = computeDistanceMatch(horse.history, currentCourse.distance, currentCourse.discipline);
  const driverContinuity = computeDriverContinuity(horse.driver, horse.history);
  const classEvolution = computeClassEvolution(horse.history, currentCourse.allocation);
  const restPattern = computeRestPattern(horse.restDays);
  const hippodromeRecord = computeHippodromeRecord(horse.history, currentCourse.hippodrome);
  const valueBet = computeValueBet(horse.caf, cafRank, totalCount, horse.cote);
  const cordeAdvantage = computeCordeAdvantage(horse.num, currentCourse.corde, currentCourse.discipline, totalCount);
  const category = categorize({ cote: horse.cote, cafRank, totalCount, formScore });
  const grade = computeGrade({
    formScore,
    cafRank,
    totalCount,
    cote: horse.cote,
    restPattern,
    distanceMatch,
    valueBet,
  });
  const series = computeSeries(horse.history);
  const result = {
    formScore,
    coteTrend,
    distanceMatch,
    driverContinuity,
    classEvolution,
    restPattern,
    hippodromeRecord,
    valueBet,
    cordeAdvantage,
    category,
    grade,
    series,
  };
  result.coupPrepare = detectCoupPrepare({ ...result, cote: horse.cote });
  return result;
};

// ============ RECOMMANDATIONS DE JEUX PMU ============
export const buildBetRecommendations = (analyses) => {
  // analyses = [{ num, ...analyseHorse(), cafRank }]
  const sorted = [...analyses].sort((a, b) => b.grade.score - a.grade.score);
  const top3 = sorted.slice(0, 3).map((a) => a.num);
  const top5 = sorted.slice(0, 5).map((a) => a.num);
  const top7 = sorted.slice(0, 7).map((a) => a.num);
  const valueBets = analyses.filter((a) => a.valueBet?.flag === "huge" || a.valueBet?.flag === "value");
  const surprises = analyses.filter((a) => a.category?.type === "tocard-surprise" || a.category?.type === "outsider-value");
  // Couplé : 2 meilleurs A+/A
  const aGrades = sorted.filter((a) => a.grade.grade === "A+" || a.grade.grade === "A").slice(0, 2).map((a) => a.num);

  return {
    tierce: { combinaison: top3, label: "Tiercé suggéré (Top 3 score)" },
    quinte: { bases: top3, outsiders: top5.slice(3, 5), label: "Quinté+ : 3 bases + 2 compléments" },
    couple: { combinaison: aGrades, label: aGrades.length === 2 ? "Couplé sécurisé (A+/A)" : "Couplé indisponible" },
    valueBets: valueBets.map((a) => a.num),
    surprises: surprises.map((a) => a.num),
    coupSur: sorted[0]?.grade.grade === "A+" && sorted[0]?.category?.type !== "fav-doubt"
      ? sorted[0].num
      : null,
    coupTente: surprises.find((s) => s.grade.score >= 55)?.num || null,
    top7,
  };
};

