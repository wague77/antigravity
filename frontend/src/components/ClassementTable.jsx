
import { useSettings } from "@/contexts/SettingsContext";

const ARRIVEE_COLORS = [
  "bg-yellow-300 text-black",   // 1er - or
  "bg-gray-300 text-black",     // 2e - argent
  "bg-orange-400 text-black",   // 3e - bronze
  "bg-green-300 text-black",    // 4e
  "bg-blue-300 text-black",     // 5e
  "bg-purple-300 text-black",   // 6e
  "bg-pink-300 text-black",     // 7e
];

export const ClassementTable = ({ rows, arrivee = [], horses = {} }) => {
  const { settings } = useSettings();
  const sorted = [...rows]
    .map((r) => ({ ...r }))
    .sort((a, b) => b.caf - a.caf)
    .slice(0, 20);

  return (
    <div className="border-2 border-black inline-block bg-surface">
      <div className="bg-row-pink text-white text-center font-bold py-1 px-4 border-b-2 border-black">
        Tri Décroissant
      </div>
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-result-yellow text-row-pink px-3 py-1">RANG</th>
            <th className="border border-black bg-header-cyan text-row-pink px-3 py-1">Valeur CAF</th>
            <th className="border border-black bg-result-yellow text-row-pink px-3 py-1">N°</th>
            {settings.showCote && (
              <th className="border border-black bg-header-cyan text-row-pink px-2 py-1 text-xs">Cote</th>
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 20 }).map((_, i) => {
            const r = sorted[i];
            const hasValue = r && r.caf > 0;
            const arrIdx = hasValue ? arrivee.indexOf(r.classe) : -1;
            const winnerColor = arrIdx >= 0 && arrIdx < ARRIVEE_COLORS.length ? ARRIVEE_COLORS[arrIdx] : "";
            const isQuinte = settings.highlightTop5 && hasValue && i < 5;
            const horse = hasValue ? horses[r.classe] : null;
            const tooltip = horse
              ? `${horse.nom || "?"}${horse.driver ? " — " + horse.driver : ""}${horse.musique ? " — " + horse.musique : ""}`
              : "";
            return (
              <tr key={i} className="hover:brightness-110 transition-all">
                <td
                  className={`border border-black text-center font-bold px-3 py-0.5 ${
                    isQuinte ? "bg-yellow-400 text-black" : "bg-result-yellow text-row-pink"
                  }`}
                >
                  {i + 1}
                </td>
                <td
                  className={`border border-black text-center px-3 py-0.5 min-w-24 transition-colors ${
                    winnerColor || (isQuinte ? "bg-yellow-200" : "bg-header-cyan")
                  }`}
                >
                  {hasValue ? r.caf : ""}
                </td>
                <td
                  title={tooltip}
                  className={`border border-black text-center font-bold px-3 py-0.5 min-w-12 cursor-help transition-colors ${
                    winnerColor || (isQuinte ? "bg-yellow-300" : "bg-result-yellow")
                  }`}
                >
                  {hasValue ? (
                    <span className="inline-flex items-center gap-1">
                      {r.classe}
                      {arrIdx >= 0 && <sup className="text-[10px] font-bold">{arrIdx + 1}</sup>}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                {settings.showCote && (
                  <td className="border border-black text-center bg-white text-blue-700 font-mono text-xs px-2 py-0.5 min-w-14">
                    {hasValue && horse?.cote != null ? horse.cote.toFixed(1) : ""}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {arrivee.length > 0 && (
        <div className="border-t-2 border-black bg-surface text-xs px-2 py-1">
          <span className="font-bold">Arrivée :</span>{" "}
          {arrivee.map((n, i) => (
            <span
              key={i}
              className={`inline-block px-1.5 mx-0.5 rounded font-bold ${ARRIVEE_COLORS[i] || ""}`}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

