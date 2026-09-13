"use client";

import { useMemo, useState } from "react";
import { analyzeHorse } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// === RADAR CHART (SVG) ===
// Affiche 6 axes : Forme, CAF, Cote (inversée), Repos, Distance, Hippodrome
const RadarChart = ({ data, size = 220, color = "#16a34a" }) => {
  const axes = ["Forme", "CAF", "Cote", "Repos", "Dist.", "Hippo"];
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) - 20;
  const n = axes.length;
  // Polygones de fond (4 niveaux)
  const levels = [0.25, 0.5, 0.75, 1.0];

  const point = (value, idx) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = radius * value;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const polygonPoints = (values) =>
    values.map((v, i) => {
      const [x, y] = point(v, i);
      return `${x},${y}`;
    }).join(" ");

  return (
    <svg width={size} height={size} className="overflow-visible">
      {levels.map((lv) => (
        <polygon
          key={lv}
          points={polygonPoints(Array(n).fill(lv))}
          fill="none"
          stroke="#d1d5db"
          strokeWidth="1"
        />
      ))}
      {axes.map((label, i) => {
        const [x, y] = point(1.0, i);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#9ca3af" strokeWidth="1" />
            <text
              x={cx + (radius + 12) * Math.cos((Math.PI * 2 * i) / n - Math.PI / 2)}
              y={cy + (radius + 12) * Math.sin((Math.PI * 2 * i) / n - Math.PI / 2)}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] font-bold fill-current"
            >
              {label}
            </text>
          </g>
        );
      })}
      <polygon
        points={polygonPoints(data)}
        fill={color}
        fillOpacity="0.3"
        stroke={color}
        strokeWidth="2"
      />
      {data.map((v, i) => {
        const [x, y] = point(v, i);
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
      })}
    </svg>
  );
};

const horseToRadar = (a) => {
  // Normalise tous les axes 0..1
  const formN = (a.formScore ?? 30) / 100;
  const cafN = a.cafRank ? Math.max(0, 1 - (a.cafRank - 1) / Math.max(1, a.totalCount || 16)) : 0.3;
  // Cote : plus basse = meilleure → inversé
  let coteN = 0.3;
  if (a.cote != null && a.cote > 0) {
    if (a.cote < 4) coteN = 1.0;
    else if (a.cote < 8) coteN = 0.85;
    else if (a.cote < 15) coteN = 0.65;
    else if (a.cote < 25) coteN = 0.4;
    else coteN = 0.2;
  }
  const repos = ({ optimal: 1.0, ok: 0.75, long: 0.6, short: 0.4, rust: 0.2 }[a.restPattern?.level] ?? 0.5);
  const dist = ({ specialist: 1.0, ok: 0.7, adapt: 0.4, off: 0.15 }[a.distanceMatch?.level] ?? 0.5);
  const hippo = ({ expert: 1.0, knows: 0.6, new: 0.5, bad: 0.25 }[a.hippodromeRecord?.level] ?? 0.5);
  return [formN, cafN, coteN, repos, dist, hippo];
};

// === HEATMAP ===
const HeatmapCell = ({ value, label }) => {
  // value 0..1 → couleur dégradée vert (1.0) → rouge (0.0)
  const hue = Math.round(value * 120); // 0=red, 120=green
  const lightness = 50 + (1 - value) * 10;
  return (
    <td
      className="border border-black text-center px-1 py-1 text-[10px] font-bold"
      style={{ backgroundColor: `hsl(${hue} 75% ${lightness}%)`, color: value > 0.55 ? "#0a0" : value < 0.3 ? "#fff" : "#000" }}
      title={label}
    >
      {label}
    </td>
  );
};

// === COMPARATEUR DE 2-3 CHEVAUX ===
const Comparator = ({ analyzed }) => {
  const [selected, setSelected] = useState([]);
  const toggle = (num) => {
    setSelected((s) => {
      if (s.includes(num)) return s.filter((x) => x !== num);
      if (s.length >= 3) return [...s.slice(1), num];
      return [...s, num];
    });
  };
  const items = analyzed.filter((a) => selected.includes(a.num));
  const colors = ["#dc2626", "#2563eb", "#16a34a"];

  return (
    <div className="space-y-3">
      <div className="bg-surface border-2 border-black rounded p-3">
        <div className="text-xs font-bold mb-2">Sélectionne 2 ou 3 chevaux à comparer :</div>
        <div className="flex flex-wrap gap-2">
          {analyzed.map((a) => (
            <label key={a.num} className={`inline-flex items-center gap-1 text-xs border-2 border-black px-2 py-1 rounded cursor-pointer hover:bg-yellow-100 ${selected.includes(a.num) ? "bg-yellow-300" : "bg-white"}`}>
              <Checkbox
                checked={selected.includes(a.num)}
                onCheckedChange={() => toggle(a.num)}
              />
              <span className="font-bold">{a.num}</span>
              <span className="truncate max-w-[140px]">{a.nom}</span>
            </label>
          ))}
        </div>
      </div>

      {items.length >= 1 && (
        <div className="grid md:grid-cols-3 gap-3">
          {items.map((a, idx) => {
            const data = horseToRadar(a);
            return (
              <div key={a.num} className="bg-white border-2 border-black rounded p-3 text-center">
                <div className="font-extrabold text-base mb-1">N°{a.num} — {a.nom}</div>
                <div className="flex justify-center mb-2">
                  <RadarChart data={data} color={colors[idx]} />
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div><strong>Note:</strong> <span className={`px-1 rounded ${a.grade.color}`}>{a.grade.grade}</span> ({a.grade.score})</div>
                  <div><strong>Cote:</strong> {a.cote?.toFixed(1) ?? "—"}</div>
                  <div><strong>Forme:</strong> {a.formScore ?? "—"}</div>
                  <div><strong>Repos:</strong> {a.restDays}j</div>
                  <div className="col-span-2"><strong>Cat:</strong> {a.category.icon} {a.category.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const VisualisationsTab = ({ horses = {}, cafs = [], currentCourse = {} }) => {
  const analyzed = useMemo(() => {
    const allCafs = cafs.map((c, i) => ({ classe: i + 1, caf: c }));
    const sortedByCaf = [...allCafs].sort((a, b) => b.caf - a.caf);
    const cafRankMap = {};
    sortedByCaf.forEach((it, idx) => {
      if (it.caf > 0) cafRankMap[it.classe] = idx + 1;
    });
    const totalCount = sortedByCaf.filter((x) => x.caf > 0).length;
    return Object.entries(horses)
      .map(([k, h]) => ({ num: Number(k), ...h, caf: cafs[Number(k) - 1] }))
      .filter((r) => r.nom)
      .map((r) => {
        const cafRank = cafRankMap[r.num];
        return { ...r, cafRank, totalCount, ...analyzeHorse(r, { cafRank, totalCount, currentCourse }) };
      })
      .sort((a, b) => b.grade.score - a.grade.score);
  }, [horses, cafs, currentCourse]);

  const [view, setView] = useState("heatmap");

  if (analyzed.length === 0) {
    return (
      <div className="bg-surface border-2 border-black rounded p-6 text-center text-muted-foreground italic">
        Lance le scraping d'une course pour activer les visualisations.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          { v: "heatmap", l: "🔥 Heatmap" },
          { v: "radars", l: "🎯 Radars" },
          { v: "compare", l: "⚔ Comparateur" },
          { v: "evolution", l: "📈 Évolution forme" },
        ].map((t) => (
          <Button
            key={t.v}
            onClick={() => setView(t.v)}
            variant={view === t.v ? "default" : "outline"}
            className={view === t.v ? "bg-row-pink text-white" : "bg-white border-2 border-black"}
            size="sm"
          >
            {t.l}
          </Button>
        ))}
      </div>

      {view === "heatmap" && (
        <div className="border-2 border-black bg-white overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[700px]">
            <thead>
              <tr className="bg-black text-white">
                <th className="border border-black px-2 py-1">N°</th>
                <th className="border border-black px-2 py-1 text-left">Cheval</th>
                <th className="border border-black px-2 py-1">Forme</th>
                <th className="border border-black px-2 py-1">CAF</th>
                <th className="border border-black px-2 py-1">Cote</th>
                <th className="border border-black px-2 py-1">Repos</th>
                <th className="border border-black px-2 py-1">Distance</th>
                <th className="border border-black px-2 py-1">Hippo</th>
                <th className="border border-black px-2 py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              {analyzed.map((a) => {
                const data = horseToRadar(a);
                return (
                  <tr key={a.num}>
                    <td className="border border-black text-center bg-classe-yellow/40 font-bold px-2 py-1">{a.num}</td>
                    <td className="border border-black px-2 py-1 font-bold whitespace-nowrap">{a.nom}</td>
                    <HeatmapCell value={data[0]} label={a.formScore != null ? a.formScore : "—"} />
                    <HeatmapCell value={data[1]} label={a.cafRank ? `#${a.cafRank}` : "—"} />
                    <HeatmapCell value={data[2]} label={a.cote != null ? a.cote.toFixed(1) : "—"} />
                    <HeatmapCell value={data[3]} label={a.restDays != null ? `${a.restDays}j` : "—"} />
                    <HeatmapCell value={data[4]} label={a.distanceMatch?.label?.slice(0, 4) || "—"} />
                    <HeatmapCell value={data[5]} label={a.hippodromeRecord?.label?.slice(0, 8) || "—"} />
                    <td className={`border border-black text-center font-extrabold px-2 py-1 ${a.grade.color}`}>{a.grade.grade}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "radars" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {analyzed.slice(0, 12).map((a, idx) => {
            const data = horseToRadar(a);
            const color = a.grade.grade.startsWith("A") ? "#16a34a" : a.grade.grade === "B" ? "#2563eb" : "#dc2626";
            return (
              <div key={a.num} className="bg-white border-2 border-black rounded p-2 text-center">
                <div className="font-bold text-sm mb-1">
                  N°{a.num} — {a.nom?.slice(0, 14)}
                  <span className={`ml-1 px-1.5 rounded ${a.grade.color} text-[11px]`}>{a.grade.grade}</span>
                </div>
                <RadarChart data={data} size={180} color={color} />
              </div>
            );
          })}
        </div>
      )}

      {view === "compare" && <Comparator analyzed={analyzed} />}

      {view === "evolution" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analyzed.slice(0, 12).map((a) => {
            const places = (a.history || []).slice(0, 5).map((h) => h.place || 0);
            const max = 16; // partants moyen
            return (
              <div key={a.num} className="bg-white border-2 border-black rounded p-3">
                <div className="font-bold text-sm mb-1 flex items-center gap-2">
                  <span className="bg-classe-yellow px-2 py-0.5 rounded font-mono">{a.num}</span>
                  {a.nom}
                  <span className={`ml-auto px-1.5 rounded text-xs ${a.grade.color}`}>{a.grade.grade}</span>
                </div>
                <svg width="100%" height="60" viewBox="0 0 200 60" preserveAspectRatio="none">
                  {/* Ligne 0 */}
                  <line x1="0" y1="55" x2="200" y2="55" stroke="#d1d5db" />
                  <line x1="0" y1="5" x2="200" y2="5" stroke="#d1d5db" strokeDasharray="2 2" />
                  {places.map((p, i) => {
                    if (!p) return null;
                    const x = 20 + (i * 40);
                    const y = 5 + (p / max) * 50;
                    const next = places[i + 1];
                    return (
                      <g key={i}>
                        {next != null && next > 0 && (
                          <line
                            x1={x}
                            y1={y}
                            x2={x + 40}
                            y2={5 + (next / max) * 50}
                            stroke={p < next ? "#16a34a" : "#dc2626"}
                            strokeWidth="2"
                          />
                        )}
                        <circle cx={x} cy={y} r="4" fill={p === 1 ? "#facc15" : p <= 3 ? "#22c55e" : "#3b82f6"} />
                        <text x={x} y={y - 6} textAnchor="middle" className="text-[10px] font-bold">{p}</text>
                      </g>
                    );
                  })}
                </svg>
                <div className="text-[10px] text-muted-foreground text-center">
                  De droite (n-3) à gauche (n-1) → recent
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

