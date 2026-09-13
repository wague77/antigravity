"use client";

import { useMemo, useState } from "react";
import { analyzeHorse, detectCoupPrepare } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Target,
  Info,
  Download,
  Copy,
  Layers,
  Sigma,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

/* Types de carrés magiques classiques PMU */
const CARRE_TYPES = [
  {
    key: "2x4",
    label: "2×4 (2 bases × 4 outsiders)",
    desc: "8 couplés — mise faible, conviction forte sur les 2 bases",
    nbBases: 2,
    nbOutsiders: 4,
  },
  {
    key: "4x4",
    label: "4×4 classique (4 bases × 4 outsiders)",
    desc: "16 couplés — large couverture, budget moyen",
    nbBases: 4,
    nbOutsiders: 4,
  },
  {
    key: "3+5",
    label: "3+5 (3 bases liées + 5 outsiders)",
    desc: "3 couplés bases-bases + 15 bases×outsiders = 18 couplés",
    nbBases: 3,
    nbOutsiders: 5,
  },
];

const SOURCES = [
  {
    key: "grade-a",
    label: "Grade A / A+ (Pronostic rapide)",
    desc: "Les chevaux notés A+ ou A par l'algo pro",
    icon: Sparkles,
  },
  {
    key: "coups-prepares",
    label: "Coups préparés (Prepared Hits)",
    desc: "Les chevaux détectés comme forts candidats par le moteur",
    icon: Target,
  },
  {
    key: "top-form",
    label: "Top par Form Score",
    desc: "Les N chevaux avec le meilleur score de forme récente",
    icon: TrendingUp,
  },
  {
    key: "top-caf",
    label: "Top 3 CAF (pronostic manuel)",
    desc: "Les 3 premiers de ton classement CAF manuel",
    icon: Sigma,
  },
];

// Génère les couplés (paires non ordonnées) pour un type donné
function buildCouples(type, bases, outsiders) {
  const couples = [];
  if (type === "2x4" || type === "4x4") {
    for (const b of bases) {
      for (const o of outsiders) {
        if (b !== o) couples.push({ a: b, b: o, kind: "base-outsider" });
      }
    }
  } else if (type === "3+5") {
    // Couplés entre bases (3 paires pour 3 bases : 1-2, 1-3, 2-3)
    for (let i = 0; i < bases.length; i++) {
      for (let j = i + 1; j < bases.length; j++) {
        couples.push({ a: bases[i], b: bases[j], kind: "base-base" });
      }
    }
    // Puis bases × outsiders
    for (const b of bases) {
      for (const o of outsiders) {
        if (b !== o) couples.push({ a: b, b: o, kind: "base-outsider" });
      }
    }
  }
  return couples;
}

// Score de confiance du couplé (moyenne des scores individuels)
function coupleConfidence(couple, analysisByNum) {
  const a = analysisByNum[couple.a]?.grade?.score ?? 0;
  const b = analysisByNum[couple.b]?.grade?.score ?? 0;
  return Math.round((a + b) / 2);
}

export const CarresMagiquesPanel = ({
  horses = {},
  cafs = [],
  currentCourse = {},
  arrivee = [],
}) => {
  const [type, setType] = useState("4x4");
  const [source, setSource] = useState("grade-a");
  const [topN, setTopN] = useState(4);
  const [unitStake, setUnitStake] = useState(1.5);

  // Analyse complète de tous les chevaux (réutilise analyzeHorse)
  const analyzed = useMemo(() => {
    const allCafs = cafs.map((c, i) => ({ classe: i + 1, caf: c }));
    const sortedByCaf = [...allCafs].sort((a, b) => b.caf - a.caf);
    const cafRankMap = {};
    sortedByCaf.forEach((it, idx) => {
      if (it.caf > 0) cafRankMap[it.classe] = idx + 1;
    });
    const totalCount = sortedByCaf.filter((x) => x.caf > 0).length;

    const list = Object.entries(horses)
      .map(([k, h]) => ({ num: Number(k), ...h, caf: cafs[Number(k) - 1] }))
      .filter((r) => r.nom);

    return list.map((r) => {
      const cafRank = cafRankMap[r.num];
      const a = analyzeHorse(r, { cafRank, totalCount, currentCourse });
      const cp = detectCoupPrepare(a);
      return { ...r, cafRank, ...a, coupPrepare: cp };
    });
  }, [horses, cafs, currentCourse]);

  // byNum pour accès rapide
  const analysisByNum = useMemo(() => {
    const m = {};
    analyzed.forEach((a) => {
      m[a.num] = a;
    });
    return m;
  }, [analyzed]);

  const selectedType = CARRE_TYPES.find((t) => t.key === type);
  const nbBases = selectedType?.nbBases || 4;
  const nbOutsiders = selectedType?.nbOutsiders || 4;

  // Détermine bases + outsiders selon la source
  const { bases, outsiders, sourceHint } = useMemo(() => {
    let pool = [];
    let hint = "";

    if (source === "grade-a") {
      pool = analyzed
        .filter((a) => a.grade?.grade === "A+" || a.grade?.grade === "A")
        .sort((x, y) => (y.grade?.score ?? 0) - (x.grade?.score ?? 0));
      hint = `${pool.length} cheval(aux) Grade A/A+ détecté(s)`;
    } else if (source === "coups-prepares") {
      pool = analyzed
        .filter((a) => a.coupPrepare && a.coupPrepare.isCoupPrepare)
        .sort((x, y) => (y.coupPrepare?.score ?? 0) - (x.coupPrepare?.score ?? 0));
      hint = `${pool.length} coup(s) préparé(s)`;
    } else if (source === "top-form") {
      pool = [...analyzed]
        .filter((a) => (a.formScore ?? 0) > 0)
        .sort((x, y) => (y.formScore ?? 0) - (x.formScore ?? 0))
        .slice(0, Math.max(nbBases, topN));
      hint = `Top ${pool.length} par Form Score`;
    } else if (source === "top-caf") {
      // Top par CAF (descendant) — autant que nécessaire pour le type choisi
      pool = [...analyzed]
        .filter((a) => (a.caf ?? 0) > 0)
        .sort((x, y) => (y.caf ?? 0) - (x.caf ?? 0))
        .slice(0, nbBases);
      hint = `Top ${pool.length} par CAF`;
    }

    const basesList = pool.slice(0, nbBases).map((a) => a.num);

    // Outsiders = prochains meilleurs scores HORS bases
    const basesSet = new Set(basesList);
    const outsidersList = [...analyzed]
      .filter((a) => !basesSet.has(a.num))
      .sort((x, y) => (y.grade?.score ?? 0) - (x.grade?.score ?? 0))
      .slice(0, nbOutsiders)
      .map((a) => a.num);

    return { bases: basesList, outsiders: outsidersList, sourceHint: hint };
  }, [source, analyzed, nbBases, nbOutsiders, topN]);

  const couples = useMemo(
    () => buildCouples(type, bases, outsiders),
    [type, bases, outsiders]
  );

  // Stats
  const stats = useMemo(() => {
    const total = couples.length;
    const totalStake = total * unitStake;
    const avgConfidence =
      total > 0
        ? Math.round(
            couples.reduce((s, c) => s + coupleConfidence(c, analysisByNum), 0) / total
          )
        : 0;

    // Si arrivée déjà connue, compte les couplés gagnants (top 3)
    let winners = 0;
    if (arrivee.length >= 3) {
      const top3 = new Set(arrivee.slice(0, 3));
      couples.forEach((c) => {
        if (top3.has(c.a) && top3.has(c.b)) winners++;
      });
    }

    return { total, totalStake, avgConfidence, winners };
  }, [couples, unitStake, arrivee, analysisByNum]);

  const handleCopyCouples = () => {
    if (!couples.length) return;
    const text = couples
      .map((c) => `${c.a}-${c.b}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success(`${couples.length} couplés copiés`);
  };

  const handleDownload = () => {
    if (!couples.length) return;
    const lines = [
      `# Carré magique ${selectedType.label}`,
      `# Source : ${SOURCES.find((s) => s.key === source)?.label}`,
      `# Bases : ${bases.join(", ")}`,
      `# Outsiders : ${outsiders.join(", ")}`,
      `# Mise unitaire : ${unitStake}€ × ${couples.length} couplés = ${stats.totalStake.toFixed(2)}€`,
      "",
      "A,B,Type,Confiance",
      ...couples.map((c) => {
        const conf = coupleConfidence(c, analysisByNum);
        return `${c.a},${c.b},${c.kind},${conf}`;
      }),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carre-magique-${type}-${currentCourse.reunion || "R"}${currentCourse.course || ""}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Fichier téléchargé");
  };

  const hasData = analyzed.length > 0;
  const canGenerate = bases.length >= (type === "3+5" ? 3 : type === "2x4" ? 2 : 4);

  return (
    <div className="space-y-4" data-testid="carres-magiques-panel">
      {/* En-tête */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 p-4 rounded-lg border-2 border-black">
        <div className="flex items-center gap-2 text-white">
          <Layers className="h-6 w-6" />
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide">Carrés magiques PMU</h2>
            <p className="text-xs text-white/90">
              Détection avancée de couplés à partir de tes coups sûrs. Choisis un type de carré et
              une source de conviction — on génère le tableau des combinaisons optimales.
            </p>
          </div>
        </div>
      </div>

      {!hasData && (
        <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded text-sm" data-testid="carres-magiques-no-data">
          <Info className="h-4 w-4 inline mr-1" />
          Charge d'abord une course (onglet Pronostic rapide) pour générer les carrés magiques.
        </div>
      )}

      {hasData && (
        <>
          {/* Sélecteurs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white border-2 border-black rounded p-3">
              <Label className="text-xs font-bold uppercase mb-2 block">
                1. Type de carré
              </Label>
              <div className="space-y-1.5">
                {CARRE_TYPES.map((t) => (
                  <label
                    key={t.key}
                    className={`flex items-start gap-2 p-2 rounded cursor-pointer border-2 ${
                      type === t.key
                        ? "bg-pink-100 border-black"
                        : "bg-white border-transparent hover:bg-gray-50"
                    }`}
                    data-testid={`carre-type-${t.key}`}
                  >
                    <input
                      type="radio"
                      checked={type === t.key}
                      onChange={() => setType(t.key)}
                      className="mt-1"
                      aria-label={t.label}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold">{t.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight">{t.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white border-2 border-black rounded p-3">
              <Label className="text-xs font-bold uppercase mb-2 block">
                2. Source des coups sûrs
              </Label>
              <div className="space-y-1.5">
                {SOURCES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <label
                      key={s.key}
                      className={`flex items-start gap-2 p-2 rounded cursor-pointer border-2 ${
                        source === s.key
                          ? "bg-yellow-100 border-black"
                          : "bg-white border-transparent hover:bg-gray-50"
                      }`}
                      data-testid={`carre-source-${s.key}`}
                    >
                      <input
                        type="radio"
                        checked={source === s.key}
                        onChange={() => setSource(s.key)}
                        className="mt-1"
                        aria-label={s.label}
                      />
                      <Icon className="h-4 w-4 mt-0.5 text-row-pink shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight">{s.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Paramètres supplémentaires */}
          <div className="bg-white border-2 border-black rounded p-3 flex flex-wrap items-center gap-3">
            {source === "top-form" && (
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold">Top N :</Label>
                <Input
                  type="number"
                  min={2}
                  max={6}
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value) || 4)}
                  className="h-8 w-20 bg-white"
                  data-testid="carre-topn-input"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs font-bold">Mise unitaire :</Label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={unitStake}
                onChange={(e) => setUnitStake(Number(e.target.value) || 1.5)}
                className="h-8 w-24 bg-white"
                data-testid="carre-unitstake-input"
              />
              <span className="text-xs">€/couplé</span>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                onClick={handleCopyCouples}
                variant="outline"
                size="sm"
                className="bg-white border-2 border-black hover:bg-pink-100"
                disabled={!canGenerate}
                data-testid="carre-copy-btn"
              >
                <Copy className="h-3 w-3 mr-1" /> Copier
              </Button>
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
                className="bg-white border-2 border-black hover:bg-yellow-100"
                disabled={!canGenerate}
                data-testid="carre-download-btn"
              >
                <Download className="h-3 w-3 mr-1" /> Télécharger
              </Button>
            </div>
          </div>

          {/* Stats + sélection */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-blue-100 border-2 border-blue-300 rounded p-2 text-center">
              <div className="text-[10px] uppercase font-bold">Couplés</div>
              <div className="text-2xl font-extrabold text-blue-900" data-testid="carre-stat-count">
                {stats.total}
              </div>
            </div>
            <div className="bg-yellow-100 border-2 border-yellow-300 rounded p-2 text-center">
              <div className="text-[10px] uppercase font-bold">Mise totale</div>
              <div className="text-2xl font-extrabold text-yellow-900">
                {stats.totalStake.toFixed(2)}€
              </div>
            </div>
            <div className="bg-green-100 border-2 border-green-300 rounded p-2 text-center">
              <div className="text-[10px] uppercase font-bold">Confiance moy.</div>
              <div className="text-2xl font-extrabold text-green-900">{stats.avgConfidence}/100</div>
            </div>
            <div
              className={`border-2 rounded p-2 text-center ${
                stats.winners > 0 ? "bg-pink-100 border-pink-300" : "bg-gray-100 border-gray-300"
              }`}
            >
              <div className="text-[10px] uppercase font-bold">
                {arrivee.length >= 3 ? "Gagnants" : "Arrivée ?"}
              </div>
              <div className="text-2xl font-extrabold">
                {arrivee.length >= 3 ? stats.winners : "—"}
              </div>
            </div>
          </div>

          {/* Hint source */}
          <div className="text-xs text-muted-foreground italic">
            💡 {sourceHint} · {bases.length} base(s) retenue(s) · {outsiders.length} outsider(s) retenu(s)
            {!canGenerate && (
              <span className="text-red-600 font-bold">
                {" "}
                ⚠ Pas assez de chevaux pour ce type de carré (il faut {nbBases} bases)
              </span>
            )}
          </div>

          {canGenerate && (
            <>
              {/* Grille visuelle du carré */}
              <div className="bg-white border-2 border-black rounded p-3 overflow-x-auto">
                <div className="text-xs font-bold uppercase mb-2">Matrice du carré</div>
                <table
                  className="w-full text-sm border-collapse"
                  data-testid="carre-matrix"
                >
                  <thead>
                    <tr>
                      <th className="p-2 bg-black text-white text-left">Bases \ Outsiders</th>
                      {outsiders.map((o) => (
                        <th
                          key={o}
                          className="p-2 bg-orange-200 border border-black text-center font-mono font-extrabold"
                        >
                          {o}
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {analysisByNum[o]?.nom?.substring(0, 10) || ""}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bases.map((b) => (
                      <tr key={b}>
                        <th className="p-2 bg-green-200 border border-black text-left font-mono font-extrabold">
                          {b}
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {analysisByNum[b]?.nom?.substring(0, 12) || ""}
                          </div>
                        </th>
                        {outsiders.map((o) => {
                          const isValid = b !== o;
                          const isWinner =
                            arrivee.length >= 3 &&
                            arrivee.slice(0, 3).includes(b) &&
                            arrivee.slice(0, 3).includes(o);
                          return (
                            <td
                              key={`${b}-${o}`}
                              className={`p-2 border border-black text-center font-mono font-bold ${
                                isValid
                                  ? isWinner
                                    ? "bg-green-500 text-white"
                                    : "bg-yellow-50"
                                  : "bg-gray-200 text-gray-400"
                              }`}
                              data-testid={`carre-cell-${b}-${o}`}
                            >
                              {isValid ? `${b}-${o}` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {type === "3+5" && (
                  <div className="mt-3 pt-3 border-t-2 border-dashed">
                    <div className="text-xs font-bold uppercase mb-1">Couplés bases ↔ bases</div>
                    <div className="flex flex-wrap gap-2">
                      {couples
                        .filter((c) => c.kind === "base-base")
                        .map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-green-200 border border-black rounded font-mono font-bold text-sm"
                          >
                            {c.a}-{c.b}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Liste détaillée */}
              <details className="bg-surface border-2 border-black rounded p-3">
                <summary className="cursor-pointer font-bold text-sm">
                  Voir la liste détaillée des {couples.length} couplés avec scores
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm" data-testid="carre-couples-table">
                    <thead>
                      <tr className="bg-black text-white">
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Couplé</th>
                        <th className="p-2 text-left">Chevaux</th>
                        <th className="p-2 text-center">Type</th>
                        <th className="p-2 text-center">Confiance</th>
                        <th className="p-2 text-right">Mise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {couples.map((c, i) => {
                        const conf = coupleConfidence(c, analysisByNum);
                        const na = analysisByNum[c.a]?.nom || `#${c.a}`;
                        const nb = analysisByNum[c.b]?.nom || `#${c.b}`;
                        return (
                          <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="p-2 font-mono">{i + 1}</td>
                            <td className="p-2 font-mono font-bold text-base">
                              {c.a}-{c.b}
                            </td>
                            <td className="p-2 text-xs text-muted-foreground truncate max-w-[240px]">
                              {na} / {nb}
                            </td>
                            <td className="p-2 text-center">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  c.kind === "base-base"
                                    ? "bg-green-200 text-green-900"
                                    : "bg-yellow-200 text-yellow-900"
                                }`}
                              >
                                {c.kind === "base-base" ? "B↔B" : "B×O"}
                              </span>
                            </td>
                            <td className="p-2 text-center font-mono font-bold">
                              {conf}
                            </td>
                            <td className="p-2 text-right font-mono">{unitStake.toFixed(2)}€</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default CarresMagiquesPanel;

