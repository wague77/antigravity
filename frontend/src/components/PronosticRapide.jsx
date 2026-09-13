"use client";

import { useMemo } from "react";
import { analyzeHorse, buildBetRecommendations, computeCourseDifficulty, computeKelly } from "@/lib/analytics";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { downloadShareImage } from "@/lib/share-image";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { Zap, Crown, Target, Trophy, Share2, TrendingUp, DollarSign } from "lucide-react";
import { AIAnalyzeButton } from "@/components/AIAnalyzeButton";

export const PronosticRapide = ({ horses = {}, cafs = [], currentCourse = {}, arrivee = [], courseInfo = "", weather = null }) => {
  const { settings } = useSettings();

  const { analyzed, recos, difficulty } = useMemo(() => {
    const allCafs = cafs.map((c, i) => ({ classe: i + 1, caf: c }));
    const sortedByCaf = [...allCafs].sort((a, b) => b.caf - a.caf);
    const cafRankMap = {};
    sortedByCaf.forEach((it, idx) => { if (it.caf > 0) cafRankMap[it.classe] = idx + 1; });
    const totalCount = sortedByCaf.filter((x) => x.caf > 0).length;
    const list = Object.entries(horses)
      .map(([k, h]) => ({ num: Number(k), ...h, caf: cafs[Number(k) - 1] }))
      .filter((r) => r.nom)
      .map((r) => ({ ...r, cafRank: cafRankMap[r.num], totalCount, ...analyzeHorse(r, { cafRank: cafRankMap[r.num], totalCount, currentCourse }) }));
    return {
      analyzed: list,
      recos: buildBetRecommendations(list),
      difficulty: computeCourseDifficulty(list, currentCourse),
    };
  }, [horses, cafs, currentCourse]);

  const sorted = [...analyzed].sort((a, b) => (b.grade?.score ?? 0) - (a.grade?.score ?? 0));
  const top5 = sorted.slice(0, 5);

  if (analyzed.length === 0) {
    return (
      <div className="bg-surface border-2 border-black rounded p-6 text-center text-muted-foreground italic">
        Scrape une course pour générer le pronostic rapide.
      </div>
    );
  }

  const bankroll = settings.bankroll || 0;
  const kellyFrac = settings.kellyFraction || 0.25;

  const handleShare = () => {
    const topHorses = top5.map((h) => ({
      num: h.num,
      nom: h.nom,
      driver: h.driver,
      grade: h.grade?.grade,
      cote: h.cote,
      category: h.category?.label,
    }));
    downloadShareImage({
      appName: APP_NAME,
      tagline: APP_TAGLINE,
      courseInfo,
      difficulty,
      weather,
      topHorses,
      recos: {
        tierce: recos.tierce.combinaison,
        quinte: [...recos.quinte.bases, ...recos.quinte.outsiders],
        coupSur: recos.coupSur,
        coupTente: recos.coupTente,
      },
      arrivee,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={handleShare}
          className="bg-gradient-to-r from-pink-500 to-violet-500 text-white font-bold hover:opacity-90"
        >
          <Share2 className="h-4 w-4 mr-1" />
          Télécharger image partage (.png)
        </Button>
        <AIAnalyzeButton
          kind="top8"
          label="🤖 Analyser ce top avec l'IA"
          size="default"
          variant="outline"
          className="bg-gradient-to-r from-violet-100 to-pink-100 border-2 border-violet-400 hover:from-violet-200 hover:to-pink-200 font-bold text-violet-900"
          payload={{
            top8: top5.map((h) => ({
              numero: h.num,
              nom: h.nom,
              driver: h.driver,
              cote: h.cote,
              grade: h.grade?.grade,
              formScore: h.grade?.score,
              reasons: (h.grade?.reasons || []).slice(0, 4),
            })),
            courseContext: {
              libelle: courseInfo,
              hippodrome: currentCourse?.hippodrome,
              discipline: currentCourse?.discipline,
              distance: currentCourse?.distance,
              terrain: weather?.terrain,
            },
          }}
        />
        <div className="text-xs text-muted-foreground italic ml-auto">
          ⚡ Tout l'essentiel pour décider en 5 secondes
        </div>
      </div>

      {/* Bandeau mega synthèse */}
      <div className="bg-gradient-to-br from-slate-900 via-black to-slate-900 border-4 border-black rounded overflow-hidden shadow-2xl">
        <div className="grid md:grid-cols-3 gap-0">
          {/* Difficulté */}
          {difficulty && (
            <div className="p-5 text-center border-r border-white/20">
              <div className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-2">Difficulté</div>
              <div className={`inline-block px-5 py-3 rounded-lg font-extrabold text-3xl border-2 border-black ${difficulty.colorBadge}`}>
                {difficulty.badge}
              </div>
              <div className="text-white/70 text-xs mt-2">{difficulty.score}/100</div>
            </div>
          )}
          {/* Coup sûr */}
          <div className="p-5 text-center border-r border-white/20">
            <div className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-2">👑 Coup sûr</div>
            {recos.coupSur ? (
              <>
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-400 to-green-500 border-2 border-black rounded-lg px-4 py-2">
                  <span className="text-5xl font-extrabold text-black">{recos.coupSur}</span>
                  <div className="text-left text-black">
                    <div className="font-bold text-sm">{sorted[0]?.nom}</div>
                    <div className="text-xs">Grade {sorted[0]?.grade?.grade}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-white/40 text-sm italic">—</div>
            )}
          </div>
          {/* Coup tenté */}
          <div className="p-5 text-center">
            <div className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-2">⚡ Coup tenté</div>
            {recos.coupTente ? (
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-400 to-orange-400 border-2 border-black rounded-lg px-4 py-2">
                <span className="text-5xl font-extrabold text-black">{recos.coupTente}</span>
                <div className="text-left text-black">
                  <div className="font-bold text-sm">
                    {analyzed.find((a) => a.num === recos.coupTente)?.nom}
                  </div>
                  <div className="text-xs">@{analyzed.find((a) => a.num === recos.coupTente)?.cote?.toFixed(1)}</div>
                </div>
              </div>
            ) : (
              <div className="text-white/40 text-sm italic">—</div>
            )}
          </div>
        </div>
      </div>

      {/* TOP 5 avec Kelly */}
      <div className="bg-surface border-2 border-black rounded overflow-hidden">
        <div className="bg-black text-white px-4 py-2 font-bold flex items-center gap-2">
          <Crown className="h-4 w-4 text-yellow-300" />
          TOP 5 — avec mise Kelly suggérée (bankroll : {bankroll} €, Kelly × {kellyFrac})
        </div>
        <div className="divide-y divide-black/10">
          {top5.map((h, idx) => {
            // Estimation de la probabilité de gagner basée sur rank/score
            const normalizedScore = (h.grade?.score ?? 50) / 100;
            // Ajuste : top 1 du score ~ 25-40% chance gagner, suivants dégressif
            const baseProb = Math.max(0.05, Math.min(0.45, normalizedScore * 0.45));
            const kelly = computeKelly(h.cote, baseProb, kellyFrac);
            const stake = kelly && bankroll > 0 ? Math.round(kelly.fraction * bankroll) : 0;
            const arrIdx = arrivee.indexOf(h.num);
            return (
              <div key={h.num} className={`p-3 flex items-center gap-3 ${arrIdx === 0 ? "bg-yellow-100" : arrIdx > 0 ? "bg-green-50" : "bg-white"}`}>
                <div className="text-center min-w-[60px]">
                  <div className="text-3xl font-extrabold leading-none">{h.num}</div>
                  {arrIdx >= 0 && <div className="text-[10px] font-bold text-row-pink">Arrivé {arrIdx + 1}</div>}
                </div>
                <div className={`inline-block px-3 py-1 rounded font-extrabold text-lg ${h.grade?.color}`}>
                  {h.grade?.grade}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{h.nom}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {h.driver && `🏇 ${h.driver} • `}
                    <span className={h.category?.color?.includes("blue") ? "text-blue-700" : h.category?.color?.includes("green") ? "text-green-700" : "text-purple-700"}>
                      {h.category?.label}
                    </span>
                    {h.series && <> • <span className="font-bold">{h.series.label}</span></>}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Cote</div>
                  <div className="font-mono font-bold text-lg">{h.cote?.toFixed(1) ?? "—"}</div>
                </div>
                <div className="text-center min-w-[120px]">
                  <div className="text-[10px] text-muted-foreground uppercase">Kelly</div>
                  {kelly && kelly.fraction > 0 ? (
                    <>
                      <div className={`inline-block px-2 py-0.5 rounded text-sm font-bold ${kelly.color}`}>
                        {kelly.percent}%
                      </div>
                      <div className="text-xs font-bold text-emerald-700">
                        {stake > 0 ? `≈ ${stake} €` : "—"}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">Ne pas miser</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Jeux en un coup d'œil */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-white border-2 border-black rounded p-3">
          <div className="text-xs font-bold uppercase flex items-center gap-1 text-row-pink mb-1">
            <Target className="h-3 w-3" /> Tiercé
          </div>
          <div className="font-mono font-extrabold text-2xl">
            {recos.tierce.combinaison.join(" - ")}
          </div>
        </div>
        <div className="bg-white border-2 border-black rounded p-3">
          <div className="text-xs font-bold uppercase flex items-center gap-1 text-yellow-700 mb-1">
            <Trophy className="h-3 w-3" /> Quinté+ (base + compléments)
          </div>
          <div className="font-mono font-extrabold text-2xl">
            {[...recos.quinte.bases, ...recos.quinte.outsiders].join(" - ")}
          </div>
        </div>
        <div className="bg-white border-2 border-black rounded p-3">
          <div className="text-xs font-bold uppercase flex items-center gap-1 text-blue-700 mb-1">
            <TrendingUp className="h-3 w-3" /> Couplé
          </div>
          <div className="font-mono font-extrabold text-2xl">
            {recos.couple.combinaison.length === 2 ? recos.couple.combinaison.join(" - ") : "—"}
          </div>
        </div>
      </div>

      {/* Avertissement */}
      <div className="text-[10px] text-muted-foreground italic text-center">
        La mise Kelly est une suggestion basée sur la probabilité estimée et la cote. Ne mise jamais plus que ce que tu peux perdre.
      </div>
    </div>
  );
};

