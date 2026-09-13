"use client";

import { useEffect, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

const LABELS = ["1ère course", "2ème course", "3ème course"];

const fmt = (n) => {
  if (!isFinite(n) || isNaN(n)) return "";
  return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
};

export const ClasseTable = ({ index, courses, onChange, onCaf, horseInfo, isTop5, isWinner }) => {
  const { settings } = useSettings();
  const COEFS = settings.coefs;
  const DIV = settings.divisor || 6;

  const { results, totals, totalSum, caf, missing, hasAnyData } = useMemo(() => {
    const missing = courses.map((c) => {
      const errs = [];
      if (!c.allocation || c.allocation <= 0) errs.push("allocation");
      if (!c.partants || c.partants <= 0) errs.push("partants");
      return errs;
    });
    const results = courses.map((c, i) => {
      if (c.valeur <= 0) return 0;
      if (missing[i].length > 0) return 0;
      const place = c.place > 0 ? c.place : 9;
      return (c.allocation / 1000) * (c.partants / place) + Math.max(0, c.partants - place);
    });
    const totals = results.map((r, i) => r * (COEFS[i] ?? 1));
    const totalSum = totals.reduce((a, b) => a + b, 0);
    const caf = Math.round(totalSum / (DIV || 1));
    const hasAnyData = courses.some((c) => c.valeur > 0 || c.allocation > 0 || c.partants > 0 || c.place > 0);
    return { results, totals, totalSum, caf, missing, hasAnyData };
  }, [courses, COEFS, DIV]);

  useEffect(() => {
    onCaf(caf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caf]);

  const errorMessages = missing
    .map((errs, i) => (errs.length > 0 && hasAnyData ? `${LABELS[i]}: ${errs.join(", ")} manquant(s)` : null))
    .filter(Boolean);

  const containerCls = [
    "border-2 border-black bg-surface transition-shadow",
    isTop5 ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-background" : "",
    isWinner ? "ring-4 ring-pink-500 ring-offset-2 ring-offset-background" : "",
  ].join(" ");

  return (
    <div className={containerCls} title={horseInfo?.tooltip || ""}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-black bg-classe-yellow text-classe-yellow-foreground font-bold w-20 py-1">
              <div className="flex flex-col items-center leading-tight">
                <span>{index}</span>
                {horseInfo?.cote != null && (
                  <span className="text-[9px] font-normal text-blue-700">
                    @{horseInfo.cote.toFixed(1)}
                  </span>
                )}
              </div>
            </th>
            <th className="border border-black bg-header-cyan text-header-cyan-foreground py-1">Allocation</th>
            <th className="border border-black bg-header-cyan text-header-cyan-foreground py-1">Valeur</th>
            <th className="border border-black bg-header-cyan text-header-cyan-foreground py-1">Place</th>
            <th className="border border-black bg-header-cyan text-header-cyan-foreground py-1">Partants</th>
            <th className="border border-black bg-pink-soft py-1">Résultat</th>
            <th className="border border-black bg-header-cyan text-header-cyan-foreground py-1" colSpan={2}>
              Totale
            </th>
            <th className="border border-black bg-row-pink w-10 py-1"></th>
            <th className="border border-black bg-caf-green text-caf-green-foreground w-20 py-1">CAF</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c, i) => (
            <tr key={i} className="hover:bg-yellow-100/40 transition-colors">
              <td className="border border-black bg-surface px-2 py-0.5 text-xs">{LABELS[i]}</td>
              {["allocation", "valeur", "place", "partants"].map((field) => (
                <td key={field} className="border border-black bg-surface p-0">
                  <input
                    type="number"
                    value={c[field] || ""}
                    onChange={(e) => onChange(i, field, Number(e.target.value))}
                    className="w-full bg-transparent text-center outline-none px-1 py-0.5 focus:bg-result-yellow transition-colors"
                  />
                </td>
              ))}
              <td className="border border-black bg-result-yellow text-result-yellow-foreground text-center font-bold px-1">
                {fmt(results[i])}
              </td>
              <td className="border border-black bg-surface text-center w-8 text-xs">{COEFS[i]}</td>
              <td className="border border-black bg-surface text-center px-1">{fmt(totals[i])}</td>
              <td className="border border-black bg-surface"></td>
              <td className="border border-black bg-surface"></td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} className="border border-black bg-[hsl(0,0%,75%)] h-3"></td>
            <td className="border border-black bg-total-orange text-total-orange-foreground text-center font-bold">
              {fmt(totalSum)}
            </td>
            <td className="border border-black bg-surface text-center w-8 text-xs">{DIV}</td>
            <td className="border border-black bg-surface"></td>
            <td className="border border-black bg-surface"></td>
            <td className="border border-black bg-caf-green text-caf-green-foreground text-center font-bold">
              {caf || ""}
            </td>
          </tr>
        </tbody>
      </table>
      {horseInfo?.nom && (
        <div className="bg-black/80 text-white text-xs px-2 py-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="font-bold text-yellow-300">{horseInfo.nom}</span>
          {horseInfo.driver && <span>🏇 {horseInfo.driver}</span>}
          {horseInfo.entraineur && <span className="opacity-80">Ent. {horseInfo.entraineur}</span>}
          {horseInfo.musique && (
            <span className="opacity-80 font-mono text-[10px]">Musique : {horseInfo.musique}</span>
          )}
        </div>
      )}
      {errorMessages.length > 0 && (
        <div className="bg-destructive/10 border-t border-destructive text-destructive text-xs px-2 py-1 flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <div>{errorMessages.join(" • ")}</div>
        </div>
      )}
    </div>
  );
};

