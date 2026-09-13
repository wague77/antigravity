"use client";

import { useMemo, useState } from "react";
import { Search, Calendar, MapPin, TrendingUp, ChevronUp, ChevronDown, Moon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIAnalyzeButton } from "@/components/AIAnalyzeButton";

const fmtAlloc = (n) => {
  if (!n) return "—";
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return n.toString();
};

const restColor = (days) => {
  if (days == null) return "bg-gray-100 text-gray-500";
  if (days <= 7) return "bg-red-200 text-red-900 font-bold";
  if (days <= 14) return "bg-orange-200 text-orange-900 font-bold";
  if (days <= 30) return "bg-yellow-200 text-yellow-900";
  if (days <= 60) return "bg-green-200 text-green-900";
  return "bg-blue-200 text-blue-900";
};

const placeColor = (p) => {
  if (!p) return "bg-gray-200";
  if (p === 1) return "bg-yellow-300 font-extrabold";
  if (p === 2) return "bg-gray-300 font-bold";
  if (p === 3) return "bg-orange-300 font-bold";
  if (p <= 5) return "bg-green-200";
  return "bg-white";
};

export const DetailPartants = ({ horses = {}, arrivee = [], currentCourse = {}, weather = null }) => {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState("num"); // num | rest | cote | nom
  const [sortDesc, setSortDesc] = useState(false);

  const rows = useMemo(() => {
    const all = Object.entries(horses)
      .map(([k, h]) => ({ num: Number(k), ...h }))
      .filter((r) => r.nom);
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? all.filter(
          (r) =>
            r.nom?.toLowerCase().includes(f) ||
            r.driver?.toLowerCase().includes(f) ||
            String(r.num) === f
        )
      : all;
    const sorted = [...filtered].sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case "rest":
          va = a.restDays ?? 99999;
          vb = b.restDays ?? 99999;
          break;
        case "cote":
          va = a.cote ?? 9999;
          vb = b.cote ?? 9999;
          break;
        case "nom":
          va = a.nom || "";
          vb = b.nom || "";
          break;
        default:
          va = a.num;
          vb = b.num;
      }
      if (va < vb) return sortDesc ? 1 : -1;
      if (va > vb) return sortDesc ? -1 : 1;
      return 0;
    });
    return sorted;
  }, [horses, filter, sortKey, sortDesc]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(false); }
  };

  const sortIcon = (key) =>
    sortKey === key ? (sortDesc ? <ChevronDown className="h-3 w-3 inline" /> : <ChevronUp className="h-3 w-3 inline" />) : null;

  if (Object.keys(horses).length === 0) {
    return (
      <div className="bg-surface border-2 border-black rounded p-6 text-center text-muted-foreground italic">
        Aucun partant chargé. Lance le scraping d'une course pour voir le détail.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filtre + légende */}
      <div className="bg-surface border-2 border-black rounded p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer par cheval, driver, n°..."
            className="bg-white"
          />
        </div>
        <div className="flex items-center gap-1 text-[10px] flex-wrap">
          <span className="font-bold text-muted-foreground uppercase">Repos :</span>
          <span className="bg-red-200 px-1.5 py-0.5 rounded font-bold">≤ 7j</span>
          <span className="bg-orange-200 px-1.5 py-0.5 rounded font-bold">≤ 14j</span>
          <span className="bg-yellow-200 px-1.5 py-0.5 rounded">≤ 30j</span>
          <span className="bg-green-200 px-1.5 py-0.5 rounded">≤ 60j</span>
          <span className="bg-blue-200 px-1.5 py-0.5 rounded">+60j</span>
        </div>
      </div>

      {/* Tableau détail */}
      <div className="border-2 border-black bg-white overflow-x-auto">
        <table className="w-full border-collapse text-xs min-w-[1100px]">
          <thead>
            <tr>
              <th
                onClick={() => handleSort("num")}
                rowSpan={2}
                className="border border-black bg-classe-yellow text-classe-yellow-foreground px-2 py-1 cursor-pointer hover:bg-yellow-300"
              >
                N° {sortIcon("num")}
              </th>
              <th
                onClick={() => handleSort("nom")}
                rowSpan={2}
                className="border border-black bg-header-cyan text-header-cyan-foreground px-2 py-1 cursor-pointer hover:opacity-80 text-left"
              >
                Cheval / Driver {sortIcon("nom")}
              </th>
              <th
                onClick={() => handleSort("rest")}
                rowSpan={2}
                className="border border-black bg-pink-soft px-2 py-1 cursor-pointer hover:opacity-80"
              >
                <Moon className="h-3 w-3 inline mr-1" />
                Repos {sortIcon("rest")}
              </th>
              <th
                onClick={() => handleSort("cote")}
                rowSpan={2}
                className="border border-black bg-result-yellow text-result-yellow-foreground px-2 py-1 cursor-pointer hover:opacity-80"
              >
                <TrendingUp className="h-3 w-3 inline mr-1" />
                Cote {sortIcon("cote")}
              </th>
              <th colSpan={3} className="border border-black bg-row-pink text-white px-2 py-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                3 dernières courses
              </th>
              <th rowSpan={2} className="border border-black bg-caf-green text-caf-green-foreground px-2 py-1">
                Musique
              </th>
              <th rowSpan={2} className="border border-black bg-gradient-to-r from-violet-500 to-pink-500 text-white px-2 py-1 text-[10px] uppercase">
                🤖 IA
              </th>
            </tr>
            <tr>
              <th className="border border-black bg-pink-soft px-1 py-0.5 text-[10px] uppercase">Course n-1</th>
              <th className="border border-black bg-pink-soft px-1 py-0.5 text-[10px] uppercase">Course n-2</th>
              <th className="border border-black bg-pink-soft px-1 py-0.5 text-[10px] uppercase">Course n-3</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const arrIdx = arrivee.indexOf(r.num);
              const isWinner = arrIdx === 0;
              const inArrivee = arrIdx >= 0;
              return (
                <tr
                  key={r.num}
                  className={`hover:bg-yellow-50 transition-colors ${
                    isWinner ? "bg-yellow-100" : inArrivee ? "bg-green-50" : ""
                  }`}
                >
                  <td className="border border-black text-center font-bold px-2 py-1 bg-classe-yellow/40">
                    {r.num}
                    {arrIdx >= 0 && (
                      <sup className="text-[9px] font-bold text-row-pink ml-0.5">{arrIdx + 1}</sup>
                    )}
                  </td>
                  <td className="border border-black px-2 py-1">
                    <div className="font-bold text-sm">{r.nom}</div>
                    {r.driver && (
                      <div className="text-[10px] text-muted-foreground">🏇 {r.driver}</div>
                    )}
                    {r.age && r.sexe && (
                      <div className="text-[9px] text-blue-700">{r.sexe} {r.age} ans</div>
                    )}
                  </td>
                  <td className={`border border-black text-center px-2 py-1 ${restColor(r.restDays)}`}>
                    {r.restDays != null ? `${r.restDays} j` : "—"}
                  </td>
                  <td className="border border-black text-center font-mono font-bold px-2 py-1">
                    {r.cote != null ? r.cote.toFixed(1) : "—"}
                  </td>

                  {/* 3 dernières courses */}
                  {[0, 1, 2].map((i) => {
                    const h = r.history?.[i];
                    if (!h || !h.dateIso) {
                      return (
                        <td key={i} className="border border-black text-center text-muted-foreground italic px-1 py-1">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={i} className="border border-black px-1 py-1 text-center align-top">
                        <div className="text-[10px] font-mono font-bold">
                          {h.dateIso}
                          {h.daysAgo != null && (
                            <span className="text-muted-foreground"> ({h.daysAgo}j)</span>
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-1 my-0.5">
                          <span className={`inline-block min-w-[28px] px-1 py-0.5 rounded text-xs ${placeColor(h.place)}`}>
                            {h.place || "—"}
                            {h.partants ? <span className="text-[8px] opacity-70">/{h.partants}</span> : ""}
                          </span>
                          <span className="text-[10px] font-bold text-orange-700">
                            {fmtAlloc(h.allocation)}€
                          </span>
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate" title={`${h.hippodrome} ${h.distance}m ${h.discipline}`}>
                          <MapPin className="h-2 w-2 inline" />
                          {h.hippodrome ? h.hippodrome.slice(0, 12) : ""}
                          {h.distance ? ` ${h.distance}m` : ""}
                        </div>
                      </td>
                    );
                  })}

                  <td className="border border-black px-2 py-1 font-mono text-[10px] max-w-[120px] truncate" title={r.musique}>
                    {r.musique || "—"}
                  </td>
                  <td className="border border-black px-1 py-1 text-center">
                    <AIAnalyzeButton
                      kind="horse"
                      label="Analyser"
                      size="sm"
                      variant="outline"
                      className="bg-violet-50 border-violet-300 hover:bg-violet-100 text-violet-900 text-[10px] h-7 px-2"
                      payload={{
                        horse: {
                          numero: r.num,
                          nom: r.nom,
                          driver: r.driver,
                          entraineur: r.entraineur,
                          cote: r.cote,
                          recentResults: r.musique || (r.history || []).slice(0, 3).map((h) => `${h.place || "?"}/${h.partants || "?"}`).join(", "),
                        },
                        courseContext: {
                          libelle: currentCourse?.libelle || currentCourse?.nomPrix,
                          hippodrome: currentCourse?.hippodrome,
                          discipline: currentCourse?.discipline,
                          distance: currentCourse?.distance,
                          terrain: weather?.terrain,
                        },
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-6 italic text-muted-foreground">
                  Aucun partant ne correspond au filtre
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        Les cotes historiques (au moment de chaque course passée) ne sont pas exposées par l'API WAGUE.
        Seule la cote actuelle (Simple Gagnant) est affichée. Les jours de repos sont calculés à partir de la date du jour.
      </p>
    </div>
  );
};

