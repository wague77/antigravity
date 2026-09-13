
import { Trophy, Target } from "lucide-react";

const ARRIVEE_COLORS = [
  "bg-yellow-300 text-black border-yellow-600",   // 1er - or
  "bg-gray-300 text-black border-gray-500",       // 2e - argent
  "bg-orange-400 text-black border-orange-600",   // 3e - bronze
  "bg-green-300 text-black border-green-600",
  "bg-blue-300 text-black border-blue-600",
  "bg-purple-300 text-black border-purple-600",
  "bg-pink-300 text-black border-pink-600",
];

const POSITION_LABELS = ["1er", "2ème", "3ème", "4ème", "5ème", "6ème", "7ème"];

export const ArriveeBanner = ({ arrivee = [], cafs = [], courseInfo = null }) => {
  if (!arrivee || arrivee.length === 0) return null;

  // Top 7 prédictions CAF (numéros de classe, triées par CAF décroissant)
  const top7Caf = cafs
    .map((caf, i) => ({ classe: i + 1, caf }))
    .filter((r) => r.caf > 0)
    .sort((a, b) => b.caf - a.caf)
    .slice(0, 7)
    .map((r) => r.classe);

  const arriveeTop = arrivee.slice(0, 7);
  const hits = arriveeTop.filter((n) => top7Caf.includes(n)).length;
  const hitRate = arriveeTop.length > 0 ? Math.round((hits / arriveeTop.length) * 100) : 0;

  // Top 3 hits (tiercé)
  const top3Caf = top7Caf.slice(0, 3);
  const top3Arr = arriveeTop.slice(0, 3);
  const tierceHits = top3Arr.filter((n) => top3Caf.includes(n)).length;

  return (
    <div className="bg-black border-4 border-black rounded mb-4 overflow-hidden shadow-lg">
      <div className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 px-4 py-2 flex items-center gap-2 border-b-2 border-black">
        <Trophy className="h-5 w-5 text-black" />
        <span className="font-extrabold text-black tracking-wide uppercase text-sm">
          Arrivée officielle
        </span>
        {courseInfo && (
          <span className="ml-auto text-xs font-bold text-black/80 truncate max-w-[60%]">
            {courseInfo}
          </span>
        )}
      </div>
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 bg-black">
        {arriveeTop.map((n, i) => (
          <div
            key={i}
            className={`relative flex flex-col items-center justify-center min-w-[56px] px-3 py-2 rounded border-2 font-extrabold ${ARRIVEE_COLORS[i]}`}
          >
            <span className="text-[10px] uppercase tracking-wider opacity-80">
              {POSITION_LABELS[i]}
            </span>
            <span className="text-2xl leading-none">{n}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded border border-white/20">
            <Target className="h-4 w-4 text-yellow-300" />
            <div className="text-xs text-white">
              <div className="font-bold">
                Tiercé CAF : <span className="text-yellow-300">{tierceHits}/3</span>
              </div>
              <div className="opacity-80">
                Top 7 : <span className="text-yellow-300 font-bold">{hits}/{arriveeTop.length}</span> ({hitRate}%)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

