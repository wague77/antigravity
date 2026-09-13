
import { Sparkles, Crown, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NumerologyPanel({ numerology, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 card-bevel p-5">
        <div className="text-sm text-stone-500">Calcul numérologique en cours…</div>
      </div>
    );
  }
  if (!numerology) {
    return null;
  }

  const top = (numerology.predictions || []).slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-emerald-950 to-emerald-900 text-amber-50 rounded-xl card-bevel p-5 race-in" data-testid="astro-numerology-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h3 className="font-display text-lg font-semibold tracking-tight">Pronostic Astro</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-amber-100/80">
          <span className="flex items-center gap-1">
            <Sigma className="h-3 w-3" /> D.V. <b className="kbd ml-1">{numerology.dayValue}</b>
          </span>
          <span>F.N.H. <b className="kbd ml-1">{numerology.fullNumberHorses}</b></span>
        </div>
      </div>
      <div className="gold-line mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top.map((p, idx) => (
          <div key={p.numPmu}
            data-testid={`astro-mozan-top-${idx + 1}`}
            className={cn(
              "rounded-lg p-3 border",
              idx === 0
                ? "bg-amber-400/10 border-amber-400/40"
                : "bg-white/5 border-white/10"
            )}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {idx === 0 && <Crown className="h-4 w-4 text-amber-400" />}
                <span className="font-display text-2xl font-bold race-pill">#{p.numPmu}</span>
              </div>
              <span className={cn("text-xs px-2 py-0.5 rounded-md font-bold",
                idx === 0 ? "bg-amber-400 text-emerald-950" : "bg-white/10 text-amber-100")}>
                {p.score}
              </span>
            </div>
            <div className="font-display font-semibold mt-1 truncate">{p.nom}</div>
            <div className="text-[11px] text-amber-100/70 mt-1 line-clamp-2">
              {p.reasons?.[0] || ""}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-amber-100/60 mt-3 italic">
        Méthode inspirée de "Astro's Racing Numerology" — à utiliser à titre indicatif uniquement.
      </p>
    </div>
  );
}

