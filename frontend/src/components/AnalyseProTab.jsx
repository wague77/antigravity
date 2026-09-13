"use client";

import { useMemo, useState } from "react";
import { analyzeHorse } from "@/lib/analytics";
import { Search, ArrowUpDown, Trophy, Target } from "lucide-react";
import { Input } from "@/components/ui/input";

export const AnalyseProTab = ({ horses = {}, cafs = [], currentCourse = {}, arrivee = [] }) => {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [sortDesc, setSortDesc] = useState(true);

  // Construit le tableau enrichi
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
      return { ...r, cafRank, ...a };
    });
  }, [horses, cafs, currentCourse]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let list = f
      ? analyzed.filter(
          (a) =>
            a.nom?.toLowerCase().includes(f) ||
            a.driver?.toLowerCase().includes(f) ||
            String(a.num) === f ||
            (a.category?.label || "").toLowerCase().includes(f)
        )
      : [...analyzed];
    list.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case "num": va = a.num; vb = b.num; break;
        case "form": va = a.formScore ?? -1; vb = b.formScore ?? -1; break;
        case "cote": va = a.cote ?? 9999; vb = b.cote ?? 9999; break;
        case "caf": va = a.cafRank ?? 9999; vb = b.cafRank ?? 9999; break;
        default: va = a.grade?.score ?? 0; vb = b.grade?.score ?? 0;
      }
      if (va < vb) return sortDesc ? 1 : -1;
      if (va > vb) return sortDesc ? -1 : 1;
      return 0;
    });
    return list;
  }, [analyzed, filter, sortKey, sortDesc]);

  // Stats globales
  const counts = useMemo(() => {
    const out = {
      favoriSolide: 0,
      outsiderValue: 0,
      tocardSurprise: 0,
      coupSur: 0,
      valueBets: 0,
    };
    analyzed.forEach((a) => {
      if (a.category?.type === "fav-solid") out.favoriSolide++;
      if (a.category?.type === "outsider-value") out.outsiderValue++;
      if (a.category?.type === "tocard-surprise") out.tocardSurprise++;
      if (a.grade?.grade === "A+") out.coupSur++;
      if (a.valueBet?.flag === "huge" || a.valueBet?.flag === "value") out.valueBets++;
    });
    return out;
  }, [analyzed]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

  if (analyzed.length === 0) {
    return (
      <div className="bg-surface border-2 border-black rounded p-6 text-center text-muted-foreground italic">
        Lance le scraping d'une course pour activer l'analyse pro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats résumé */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-emerald-300 border-2 border-black rounded p-2 text-center">
          <div className="text-[10px] uppercase font-bold">A+ (Coup sûr)</div>
          <div className="text-2xl font-extrabold">{counts.coupSur}</div>
        </div>
        <div className="bg-green-300 border-2 border-black rounded p-2 text-center">
          <div className="text-[10px] uppercase font-bold">Favoris solides</div>
          <div className="text-2xl font-extrabold">{counts.favoriSolide}</div>
        </div>
        <div className="bg-blue-300 border-2 border-black rounded p-2 text-center">
          <div className="text-[10px] uppercase font-bold">🔥 Outsiders value</div>
          <div className="text-2xl font-extrabold">{counts.outsiderValue}</div>
        </div>
        <div className="bg-red-300 border-2 border-black rounded p-2 text-center">
          <div className="text-[10px] uppercase font-bold">⭐ Tocards surprise</div>
          <div className="text-2xl font-extrabold">{counts.tocardSurprise}</div>
        </div>
        <div className="bg-pink-300 border-2 border-black rounded p-2 text-center">
          <div className="text-[10px] uppercase font-bold">Value bets</div>
          <div className="text-2xl font-extrabold">{counts.valueBets}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer (nom, driver, n°, catégorie...)"
          className="bg-white max-w-md"
        />
      </div>

      <div className="border-2 border-black bg-white scrollbar-x-visible">
        <table className="w-full border-collapse text-xs min-w-[1300px]">
          <thead>
            <tr className="bg-black text-white">
              <th onClick={() => handleSort("num")} className="border border-black px-2 py-1 cursor-pointer hover:bg-white/10">
                N° <ArrowUpDown className="h-3 w-3 inline" />
              </th>
              <th className="border border-black px-2 py-1 text-left">Cheval</th>
              <th onClick={() => handleSort("score")} className="border border-black px-2 py-1 cursor-pointer hover:bg-white/10">
                Note <ArrowUpDown className="h-3 w-3 inline" />
              </th>
              <th className="border border-black px-2 py-1">Catégorie</th>
              <th onClick={() => handleSort("form")} className="border border-black px-2 py-1 cursor-pointer hover:bg-white/10">
                Forme <ArrowUpDown className="h-3 w-3 inline" />
              </th>
              <th onClick={() => handleSort("caf")} className="border border-black px-2 py-1 cursor-pointer hover:bg-white/10">
                Rang CAF <ArrowUpDown className="h-3 w-3 inline" />
              </th>
              <th onClick={() => handleSort("cote")} className="border border-black px-2 py-1 cursor-pointer hover:bg-white/10">
                Cote <ArrowUpDown className="h-3 w-3 inline" />
              </th>
              <th className="border border-black px-2 py-1">Tendance</th>
              <th className="border border-black px-2 py-1">Value</th>
              <th className="border border-black px-2 py-1">Distance</th>
              <th className="border border-black px-2 py-1">Hippodrome</th>
              <th className="border border-black px-2 py-1">Corde</th>
              <th className="border border-black px-2 py-1">Repos</th>
              <th className="border border-black px-2 py-1">Driver</th>
              <th className="border border-black px-2 py-1">Classe</th>
              <th className="border border-black px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const arrIdx = arrivee.indexOf(a.num);
              return (
                <tr key={a.num} className={`hover:bg-yellow-50 ${arrIdx === 0 ? "bg-yellow-100" : arrIdx > 0 ? "bg-green-50" : ""}`}>
                  <td className="border border-black text-center font-bold bg-classe-yellow/40 px-2 py-1">
                    {a.num}
                    {arrIdx >= 0 && <sup className="text-[9px] text-row-pink ml-0.5 font-bold">{arrIdx + 1}</sup>}
                  </td>
                  <td className="border border-black px-2 py-1">
                    <div className="font-bold">{a.nom}</div>
                    {a.driver && <div className="text-[10px] opacity-70">🏇 {a.driver}</div>}
                  </td>
                  <td className="border border-black text-center px-1 py-1">
                    <div className={`inline-block px-2 py-1 rounded font-extrabold text-base ${a.grade.color}`}>
                      {a.grade.grade}
                    </div>
                    <div className="text-[9px] text-muted-foreground">{a.grade.score}/100</div>
                  </td>
                  <td className="border border-black px-1 py-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${a.category.color}`}>
                      {a.category.icon} {a.category.label}
                    </span>
                  </td>
                  <td className="border border-black text-center px-1 py-1">
                    {a.formScore != null ? (
                      <div className="flex flex-col items-center">
                        <div className="font-bold">{a.formScore}</div>
                        <div className="w-12 h-1.5 bg-gray-200 rounded overflow-hidden">
                          <div className={`h-full ${a.formScore >= 70 ? "bg-green-500" : a.formScore >= 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${a.formScore}%` }} />
                        </div>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="border border-black text-center font-bold px-1 py-1">
                    {a.cafRank ? `#${a.cafRank}` : "—"}
                  </td>
                  <td className="border border-black text-center font-mono font-bold px-1 py-1">
                    {a.cote != null ? a.cote.toFixed(1) : "—"}
                  </td>
                  <td className={`border border-black text-center px-1 py-1 font-bold ${a.coteTrend?.color || ""}`}>
                    {a.coteTrend?.label || "—"}
                  </td>
                  <td className="border border-black text-center px-1 py-1">
                    {a.valueBet ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] ${a.valueBet.color}`}>
                        {a.valueBet.label}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="border border-black px-1 py-1">
                    {a.distanceMatch ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${a.distanceMatch.color}`}>
                        {a.distanceMatch.label}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="border border-black px-1 py-1">
                    {a.hippodromeRecord ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${a.hippodromeRecord.color}`}>
                        {a.hippodromeRecord.label}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="border border-black px-1 py-1">
                    {a.cordeAdvantage ? (
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${a.cordeAdvantage.color}`}
                        title={`Numéro PMU ${a.num} · Corde ${currentCourse?.corde || "?"}`}
                        data-testid={`corde-cell-${a.num}`}
                      >
                        {a.cordeAdvantage.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">—</span>
                    )}
                  </td>
                  <td className="border border-black px-1 py-1 text-center">
                    {a.restPattern ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${a.restPattern.color}`}>
                        {a.restDays}j {a.restPattern.label}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="border border-black px-1 py-1">
                    {a.driverContinuity ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${a.driverContinuity.color}`}>
                        {a.driverContinuity.label}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="border border-black px-1 py-1">
                    {a.classEvolution ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${a.classEvolution.color}`}>
                        {a.classEvolution.label}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="border border-black px-2 py-1 font-bold text-[11px]">
                    {a.category.action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

