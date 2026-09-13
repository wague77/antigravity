
import { useMemo } from "react";
import { analyzeHorse, buildBetRecommendations } from "@/lib/analytics";
import { Trophy, Target, Sparkles, AlertCircle, TrendingUp, Crown, Zap } from "lucide-react";

const horseLabel = (analyzed, num) => {
  const a = analyzed.find((x) => x.num === num);
  return a ? `${a.nom}` : "?";
};

export const StrategieTab = ({ horses = {}, cafs = [], currentCourse = {}, arrivee = [] }) => {
  const { analyzed, recos } = useMemo(() => {
    const allCafs = cafs.map((c, i) => ({ classe: i + 1, caf: c }));
    const sortedByCaf = [...allCafs].sort((a, b) => b.caf - a.caf);
    const cafRankMap = {};
    sortedByCaf.forEach((it, idx) => {
      if (it.caf > 0) cafRankMap[it.classe] = idx + 1;
    });
    const totalCount = sortedByCaf.filter((x) => x.caf > 0).length;
    const list = Object.entries(horses)
      .map(([k, h]) => ({ num: Number(k), ...h, caf: cafs[Number(k) - 1] }))
      .filter((r) => r.nom)
      .map((r) => {
        const cafRank = cafRankMap[r.num];
        return { ...r, cafRank, totalCount, ...analyzeHorse(r, { cafRank, totalCount, currentCourse }) };
      });
    return { analyzed: list, recos: buildBetRecommendations(list) };
  }, [horses, cafs, currentCourse]);

  if (!analyzed.length) {
    return (
      <div className="bg-surface border-2 border-black rounded p-6 text-center text-muted-foreground italic">
        Lance le scraping d'une course pour générer des recommandations.
      </div>
    );
  }

  const HorseChip = ({ num, color = "bg-blue-300" }) => {
    const a = analyzed.find((x) => x.num === num);
    if (!a) return null;
    const arrIdx = arrivee.indexOf(num);
    return (
      <div className={`inline-flex items-center gap-1.5 ${color} border-2 border-black rounded px-2 py-1 mr-1 mb-1`}>
        <span className="font-extrabold text-base">{num}</span>
        {arrIdx >= 0 && <sup className="text-[9px] font-bold">{arrIdx + 1}</sup>}
        <span className="text-xs font-bold">{a.nom?.slice(0, 14)}</span>
        <span className={`text-[10px] px-1 rounded ${a.grade.color}`}>{a.grade.grade}</span>
      </div>
    );
  };

  // Vérification rétroactive si l'arrivée est connue
  const checkResult = (combinaison) => {
    if (!arrivee.length) return null;
    const arrTop3 = arrivee.slice(0, 3);
    const hits3 = combinaison.filter((n) => arrTop3.includes(n)).length;
    return hits3;
  };

  return (
    <div className="space-y-4">
      {/* COUP SÛR / COUP TENTÉ */}
      <div className="grid md:grid-cols-2 gap-3">
        {recos.coupSur ? (
          <div className="bg-gradient-to-br from-emerald-300 to-green-400 border-4 border-black rounded p-4">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-6 w-6 text-yellow-700" />
              <span className="font-extrabold text-lg">COUP SÛR</span>
            </div>
            <p className="text-xs mb-2">Note A+ avec excellent profil global</p>
            <HorseChip num={recos.coupSur} color="bg-yellow-300" />
          </div>
        ) : (
          <div className="bg-gray-100 border-2 border-black rounded p-4 opacity-60">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-6 w-6 text-gray-400" />
              <span className="font-bold text-lg">Aucun coup sûr</span>
            </div>
            <p className="text-xs">Aucun cheval ne combine note A+ et profil sécurisé</p>
          </div>
        )}

        {recos.coupTente ? (
          <div className="bg-gradient-to-br from-pink-300 to-orange-400 border-4 border-black rounded p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-6 w-6 text-purple-700" />
              <span className="font-extrabold text-lg">COUP TENTÉ</span>
            </div>
            <p className="text-xs mb-2">Outsider/tocard avec score &gt; 55 — gros gain potentiel</p>
            <HorseChip num={recos.coupTente} color="bg-orange-200" />
          </div>
        ) : (
          <div className="bg-gray-100 border-2 border-black rounded p-4 opacity-60">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-6 w-6 text-gray-400" />
              <span className="font-bold text-lg">Aucun coup tenté</span>
            </div>
            <p className="text-xs">Pas d'outsider/tocard avec score suffisant pour un coup risqué</p>
          </div>
        )}
      </div>

      {/* JEUX PMU SUGGÉRÉS */}
      <div className="bg-surface border-2 border-black rounded p-4 space-y-3">
        <h3 className="font-extrabold text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          Jeux PMU suggérés
        </h3>

        {/* Tiercé */}
        <div className="bg-white border-2 border-black rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-row-pink" />
            <span className="font-bold">{recos.tierce.label}</span>
            {arrivee.length > 0 && (
              <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${
                checkResult(recos.tierce.combinaison) >= 2 ? "bg-green-300" : checkResult(recos.tierce.combinaison) >= 1 ? "bg-yellow-300" : "bg-red-200"
              }`}>
                Résultat : {checkResult(recos.tierce.combinaison)}/3 dans le tiercé
              </span>
            )}
          </div>
          <div className="flex flex-wrap">
            {recos.tierce.combinaison.map((n) => (
              <HorseChip key={n} num={n} color="bg-yellow-200" />
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 italic">
            Suggestion : jouer en ordre + désordre. Si tiercé exact = jackpot ; sinon désordre rapporte ~15-20× la mise.
          </div>
        </div>

        {/* Quinté+ */}
        <div className="bg-white border-2 border-black rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-yellow-600" />
            <span className="font-bold">{recos.quinte.label}</span>
          </div>
          <div className="text-xs font-bold mb-1">🎯 Bases (à conserver) :</div>
          <div className="flex flex-wrap mb-2">
            {recos.quinte.bases.map((n) => (
              <HorseChip key={n} num={n} color="bg-emerald-200" />
            ))}
          </div>
          <div className="text-xs font-bold mb-1">➕ Compléments :</div>
          <div className="flex flex-wrap">
            {recos.quinte.outsiders.map((n) => (
              <HorseChip key={n} num={n} color="bg-blue-200" />
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2 italic">
            Champ réduit : 5 chevaux = 120 combinaisons (1 unitaire = 1€) → mise totale 120€. Permutations possibles pour réduire.
          </div>
        </div>

        {/* Couplé */}
        <div className="bg-white border-2 border-black rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span className="font-bold">{recos.couple.label}</span>
          </div>
          {recos.couple.combinaison.length === 2 ? (
            <div className="flex flex-wrap">
              {recos.couple.combinaison.map((n) => (
                <HorseChip key={n} num={n} color="bg-blue-200" />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Pas assez de chevaux notés A/A+ pour un couplé sécurisé
            </p>
          )}
        </div>

        {/* Top 7 score */}
        <div className="bg-white border-2 border-black rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            <span className="font-bold">Top 7 selon score composite</span>
          </div>
          <div className="flex flex-wrap">
            {recos.top7.map((n, i) => (
              <HorseChip key={n} num={n} color={i < 3 ? "bg-emerald-200" : i < 5 ? "bg-blue-200" : "bg-yellow-200"} />
            ))}
          </div>
        </div>
      </div>

      {/* VALUE BETS & SURPRISES */}
      {(recos.valueBets.length > 0 || recos.surprises.length > 0) && (
        <div className="bg-pink-50 border-2 border-pink-400 rounded p-4 space-y-3">
          <h3 className="font-extrabold text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-pink-600" />
            🔥 Value bets & surprises
          </h3>
          {recos.valueBets.length > 0 && (
            <div>
              <div className="text-xs font-bold mb-1">Value bets (CAF haut + cote haute) :</div>
              <div className="flex flex-wrap">
                {recos.valueBets.map((n) => (
                  <HorseChip key={n} num={n} color="bg-pink-300" />
                ))}
              </div>
            </div>
          )}
          {recos.surprises.length > 0 && (
            <div>
              <div className="text-xs font-bold mb-1">Surprises potentielles (outsider/tocard avec bon score) :</div>
              <div className="flex flex-wrap">
                {recos.surprises.map((n) => (
                  <HorseChip key={n} num={n} color="bg-orange-300" />
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground italic">
            Ces chevaux ont une probabilité estimée par notre algo plus élevée que ne le suggère leur cote du marché.
            <strong> Idéal pour des paris simples gagnants à mise modérée et gain potentiel élevé.</strong>
          </p>
        </div>
      )}

      {/* ALERTES */}
      <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-xs flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-yellow-700 shrink-0 mt-0.5" />
        <div>
          <strong>Avertissement :</strong> Ces recommandations sont basées sur des heuristiques (forme, CAF, cote, repos, etc.).
          Aucune méthode ne garantit un gain. Ne mise que ce que tu peux te permettre de perdre. Le jeu peut être addictif —
          consulte <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noreferrer" className="underline">joueurs-info-service.fr</a> en cas de besoin.
        </div>
      </div>
    </div>
  );
};

