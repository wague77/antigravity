"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export default function FortuneParticipantsTable({ horses, setHorses }) {
  const update = (numPmu, patch) => {
    setHorses((prev) => prev.map((h) => (h.numPmu === numPmu ? { ...h, ...patch } : h)));
  };

  return (
    <div className="border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
        <span className="font-cabinet text-sm font-bold tracking-wide uppercase">Partants</span>
        <span className="text-[10px] font-ibm-mono text-muted-foreground">
          {horses.length} chevaux · LS auto depuis musique
        </span>
      </div>
      <div className="scrollbar-x-visible">
        <table className="w-full text-sm min-w-[900px]" data-testid="fortune-participants-table">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2">N°</th>
              <th className="text-left px-3 py-2">Cheval</th>
              <th className="text-left px-3 py-2">Driver / Entraîneur</th>
              <th className="text-left px-3 py-2 font-ibm-mono">Musique</th>
              <th className="text-right px-3 py-2 font-ibm-mono">Cote</th>
              <th className="text-right px-3 py-2 font-ibm-mono">V/C</th>
              <th className="text-center px-3 py-2">LS</th>
              <th className="text-center px-3 py-2">Statut</th>
              <th className="text-center px-3 py-2">Presse</th>
            </tr>
          </thead>
          <tbody>
            {horses.map((h) => (
              <tr key={h.numPmu} className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-150" data-testid={`fortune-participant-row-${h.numPmu}`}>
                <td className="px-3 py-2">
                  <div className="w-7 h-7 flex items-center justify-center bg-turf font-cabinet font-bold text-sm">
                    {h.numPmu}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-cabinet font-semibold leading-tight flex items-center gap-1.5">
                    {h.nom}
                    {h.favoris && <Star className="w-3 h-3 text-gold fill-gold" />}
                  </div>
                  <div className="text-[10px] font-ibm-mono text-muted-foreground">
                    {h.age} ans · {h.sexe}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>{h.driver || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{h.entraineur || "—"}</div>
                </td>
                <td className="px-3 py-2 font-ibm-mono text-xs tracking-tight">{h.musique || "—"}</td>
                <td className="px-3 py-2 text-right font-ibm-mono">
                  <span className={cn(h.favoris && "text-turf font-bold")}>
                    {h.coteDirecte ?? h.coteReference ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-ibm-mono text-xs text-muted-foreground">
                  {h.nombreVictoires ?? 0}/{h.nombreCourses ?? 0}
                </td>
                <td className="px-3 py-2 text-center">
                  <Input
                    type="number" min="0" max="20" step="0.1"
                    value={h.ls}
                    onChange={(e) => update(h.numPmu, { ls: parseFloat(e.target.value) || 0 })}
                    className="h-7 w-16 text-center font-ibm-mono text-xs px-1"
                    data-testid={`fortune-ls-input-${h.numPmu}`}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="inline-flex border border-slate-300 overflow-hidden">
                    {["NW", "WW"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); update(h.numPmu, { status: s }); }}
                        data-testid={`fortune-status-${s}-${h.numPmu}`}
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-bold font-ibm-mono transition-colors",
                          h.status === s
                            ? s === "WW" ? "bg-turf" : "bg-slate-700 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <Input
                    type="number" min="0" max="20"
                    value={h.pressScore}
                    onChange={(e) => update(h.numPmu, { pressScore: parseInt(e.target.value) || 0 })}
                    className="h-7 w-14 text-center font-ibm-mono text-xs px-1"
                    data-testid={`fortune-press-input-${h.numPmu}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-3 text-[10px] font-ibm-mono text-muted-foreground items-center">
        <Badge variant="outline" className="border-turf text-turf">WW</Badge> Winner-Winner
        <Badge variant="outline" className="border-slate-700 text-slate-700">NW</Badge> Non-Winner
        <span>· LS = Logical System (0-20). Modifiable.</span>
      </div>
    </div>
  );
}

