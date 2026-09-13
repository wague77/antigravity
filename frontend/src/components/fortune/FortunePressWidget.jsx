"use client";

/**
 * FortunePressWidget — affiche les pronostics presse parsés côté backend (/api/fortune/press).
 *
 * Approche : le widget externe original utilise document.write() qui silently fail quand
 * il est injecté dynamiquement (after page load). On parse donc le HTML côté backend et
 * on rend nous-même le tableau.
 */
import React from "react";
import axios from "axios";
import { Loader2, Trophy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FORTUNE_API } from "./api";
import { cn } from "@/lib/utils";

export default function FortunePressWidget() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${FORTUNE_API}/press`, { timeout: 20000 });
      setData(data);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="border border-slate-200 bg-white" data-testid="fortune-press-widget">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
        <span className="font-cabinet text-sm font-bold tracking-wide uppercase">
          Pronostics Presse
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-ibm-mono text-muted-foreground">via WAGUE</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-7 w-7 p-0"
            data-testid="fortune-press-refresh"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {data?.title && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-gold" />
          <span className="font-cabinet text-xs font-bold uppercase tracking-wide">{data.title}</span>
        </div>
      )}

      {data?.synthese && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
          <div className="text-[10px] font-ibm-mono uppercase tracking-[0.2em] text-amber-700 font-bold mb-1">
            Synthèse presse (par points)
          </div>
          <div className="font-cabinet text-xl font-extrabold text-turf tracking-wide">
            {data.synthese}
          </div>
        </div>
      )}

      <div className="max-h-[420px] overflow-auto scrollbar-thin">
        {loading && !data && (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-turf" />
            Chargement des pronostics presse…
          </div>
        )}

        {error && !data && (
          <div className="p-4 text-xs text-rose-600 italic">
            Pronostics presse indisponibles ({error}).
          </div>
        )}

        {data && data.rows?.length > 0 && (
          <div className="scrollbar-x-visible">
            <table className="w-full text-xs min-w-[420px]">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
                <tr>
                  {(data.headers || []).map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-2 py-1.5 font-bold",
                        i === 0 ? "text-left" : "text-center font-ibm-mono"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, r) => (
                  <tr key={r} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn(
                          "px-2 py-1",
                          c === 0
                            ? "text-left font-cabinet font-semibold whitespace-nowrap"
                            : "text-center font-ibm-mono"
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.rows?.length === 0 && !error && (
          <div className="p-4 text-xs text-muted-foreground italic">Aucun pronostic disponible.</div>
        )}
      </div>
    </div>
  );
}

