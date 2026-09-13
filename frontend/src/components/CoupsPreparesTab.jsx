
import { useMemo } from "react";
import { analyzeHorse } from "@/lib/analytics";
import { Flame, Star, Eye, AlertTriangle, Sparkles } from "lucide-react";

const LEVEL_ICON = {
  alpha: <Flame className="h-5 w-5" />,
  strong: <Star className="h-5 w-5" />,
  watch: <Eye className="h-5 w-5" />,
};

export const CoupsPreparesTab = ({ horses = {}, cafs = [], currentCourse = {}, arrivee = [] }) => {
  const analyzed = useMemo(() => {
    const allCafs = cafs.map((c, i) => ({ classe: i + 1, caf: c }));
    const sortedByCaf = [...allCafs].sort((a, b) => b.caf - a.caf);
    const cafRankMap = {};
    sortedByCaf.forEach((it, idx) => { if (it.caf > 0) cafRankMap[it.classe] = idx + 1; });
    const totalCount = sortedByCaf.filter((x) => x.caf > 0).length;
    return Object.entries(horses)
      .map(([k, h]) => ({ num: Number(k), ...h, caf: cafs[Number(k) - 1] }))
      .filter((r) => r.nom)
      .map((r) => ({
        ...r,
        cafRank: cafRankMap[r.num],
        ...analyzeHorse(r, { cafRank: cafRankMap[r.num], totalCount, currentCourse }),
      }))
      .filter((a) => a.coupPrepare)
      .sort((a, b) => b.coupPrepare.score - a.coupPrepare.score);
  }, [horses, cafs, currentCourse]);

  if (analyzed.length === 0) {
    return (
      <div className="bg-surface border-2 border-black rounded p-6 text-center text-muted-foreground italic">
        Aucun coup préparé détecté pour cette course. Lance le scraping ou attends une course plus prometteuse.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-r from-purple-900 to-pink-900 text-white border-4 border-black rounded p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-yellow-300" />
          <h2 className="font-extrabold text-lg">Détection de coups préparés</h2>
        </div>
        <p className="text-xs opacity-90">
          Algorithme qui croise <b>10 signaux cachés</b> : descente de catégorie, repos optimal, série en cours, value bet, driver fidèle, spécialiste hippodrome, cote en baisse... Plus le score est haut, plus le pari est prometteur.
        </p>
      </div>

      <div className="space-y-3">
        {analyzed.map((a) => {
          const cp = a.coupPrepare;
          const arrIdx = arrivee.indexOf(a.num);
          return (
            <div key={a.num} className="bg-white border-2 border-black rounded overflow-hidden shadow-md">
              <div className={`px-4 py-2 flex items-center gap-3 ${cp.color}`}>
                <span className="text-3xl font-extrabold">{a.num}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-base flex items-center gap-2">
                    {LEVEL_ICON[cp.level]}
                    {cp.badge}
                    <span className="font-mono text-sm opacity-90">— {cp.score}/100</span>
                  </div>
                  <div className="text-sm font-bold">{a.nom} {a.driver && <span className="opacity-80 font-normal">— 🏇 {a.driver}</span>}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-extrabold ${a.grade?.color}`}>
                    Grade {a.grade?.grade}
                  </span>
                  <span className="text-xs font-mono">@{a.cote?.toFixed(1) ?? "?"}</span>
                  {arrIdx >= 0 && (
                    <span className="bg-yellow-400 text-black px-1.5 py-0.5 rounded text-[10px] font-extrabold">
                      ARRIVÉ {arrIdx + 1}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 bg-white">
                <div className="text-xs font-bold uppercase text-muted-foreground mb-2">
                  Signaux détectés ({cp.signals.length}) :
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cp.signals.map((s, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 bg-yellow-100 border border-yellow-400 rounded px-2 py-1 text-xs font-bold"
                    >
                      <span>{s.icon}</span>
                      <span>{s.text}</span>
                      <span className="text-yellow-800 ml-0.5">+{s.weight}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-xs flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-yellow-700 shrink-0 mt-0.5" />
        <div>
          <strong>Détection automatique :</strong> ces chevaux cumulent plusieurs signaux positifs cachés.
          Un "COUP ALPHA" (score &ge; 70) est rare mais très puissant. Un "COUP FORT" (50-69) reste à fort potentiel.
          Combine avec la cote pour identifier les meilleurs paris.
        </div>
      </div>
    </div>
  );
};

