
import { useMemo } from "react";
import { computeDriverStats } from "@/lib/analytics";
import { Flame, Trophy, TrendingUp } from "lucide-react";

const HEAT_BG = {
  fire: "bg-red-500 text-white",
  warm: "bg-orange-300 text-orange-900",
  cold: "bg-gray-200 text-gray-700",
};

export const StatsDriverPanel = ({ horses = {} }) => {
  const drivers = useMemo(() => computeDriverStats(horses, "driver").slice(0, 12), [horses]);

  if (!drivers.length) {
    return null;
  }

  return (
    <div className="bg-surface border-2 border-black rounded overflow-hidden mb-4">
      <div className="bg-black text-white px-3 py-2 font-bold flex items-center gap-2 text-sm">
        <Trophy className="h-4 w-4 text-yellow-300" />
        Stats des drivers (sur les 3 dernières courses des partants)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-row-pink text-white">
              <th className="border border-black px-2 py-1 text-left">Driver / Jockey</th>
              <th className="border border-black px-2 py-1">Montes</th>
              <th className="border border-black px-2 py-1">Victoires</th>
              <th className="border border-black px-2 py-1">Top 3</th>
              <th className="border border-black px-2 py-1">% Gagne</th>
              <th className="border border-black px-2 py-1">% Place</th>
              <th className="border border-black px-2 py-1">Forme</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.name} className="hover:bg-yellow-50">
                <td className="border border-black px-2 py-1 font-bold">🏇 {d.name}</td>
                <td className="border border-black px-2 py-1 text-center">{d.rides}</td>
                <td className="border border-black px-2 py-1 text-center font-bold text-green-700">{d.top1}</td>
                <td className="border border-black px-2 py-1 text-center font-bold text-blue-700">{d.top3}</td>
                <td className="border border-black px-2 py-1 text-center font-mono">{d.winRate}%</td>
                <td className="border border-black px-2 py-1 text-center font-mono font-bold">{d.placeRate}%</td>
                <td className="border border-black px-2 py-1 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${HEAT_BG[d.heat]}`}>
                    {d.heat === "fire" && <Flame className="h-3 w-3" />}
                    {d.heat === "warm" && <TrendingUp className="h-3 w-3" />}
                    {d.heat === "fire" ? "EN FEU" : d.heat === "warm" ? "En forme" : "Discret"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-t border-black/10">
        Stats calculées à partir de l'historique scrapé des partants. Plus l'échantillon est grand, plus c'est fiable.
      </div>
    </div>
  );
};

