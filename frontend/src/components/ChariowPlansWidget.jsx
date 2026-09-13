"use client";

/**
 * ChariowPlansWidget — 3 plans tarifaires TURFEX redirigeant vers Chariow.
 *
 * Au clic sur une carte, ouvre le checkout Chariow correspondant dans un nouvel onglet.
 * Aucune donnée client n'est collectée côté TURFEX : Chariow s'occupe de tout (paiement
 * + envoi du code par email après réception).
 *
 * Les 3 URLs sont fournies par le backend via `chariowUrls` dans /api/payment/providers
 * (configurables depuis l'admin sans redéploiement).
 */
import { ArrowRight, ShieldCheck } from "lucide-react";

const PLANS = [
  {
    key: "1m",
    label: "1 mois",
    price: 30,
    oldPrice: null,
    monthly: 30.0,
    badge: null,
    accent: "from-zinc-500 to-zinc-700",
    border: "border-zinc-400",
  },
  {
    key: "3m",
    label: "3 mois",
    price: 80,
    oldPrice: 90,
    monthly: 26.67,
    badge: "Économie 10 €",
    accent: "from-amber-400 to-orange-500",
    border: "border-amber-400",
    popular: true,
  },
  {
    key: "1y",
    label: "1 an",
    price: 260,
    oldPrice: 360,
    monthly: 21.67,
    badge: "Économie 100 €",
    accent: "from-emerald-400 to-cyan-500",
    border: "border-emerald-400",
    bestValue: true,
  },
];

export const ChariowPlansWidget = ({ urls = {} }) => {
  const handleClick = (planKey) => {
    const url = urls?.[planKey];
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full" data-testid="chariow-plans-widget">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {PLANS.map((p) => {
          const url = urls?.[p.key];
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handleClick(p.key)}
              disabled={!url}
              data-testid={`chariow-plan-${p.key}`}
              className={`group relative text-left bg-card/95 backdrop-blur-sm border-2 ${p.border} rounded-xl p-3 hover:scale-[1.03] hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                p.popular ? "ring-2 ring-amber-400/50" : ""
              } ${p.bestValue ? "ring-2 ring-emerald-400/50" : ""}`}
            >
              {p.badge && (
                <div
                  className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-gradient-to-r ${p.accent} text-white shadow-md whitespace-nowrap`}
                >
                  {p.badge}
                </div>
              )}
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                {p.label}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-foreground tracking-tight">{p.price} €</span>
                {p.oldPrice && (
                  <span className="text-[11px] text-muted-foreground line-through font-semibold">
                    {p.oldPrice} €
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">soit {p.monthly.toFixed(2)} €/mois</div>
              <div
                className={`mt-2 inline-flex items-center gap-1 text-[10px] font-bold bg-gradient-to-r ${p.accent} bg-clip-text text-transparent group-hover:gap-2 transition-all`}
              >
                Choisir <ArrowRight className="h-3 w-3 text-foreground/60" />
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-3 italic flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3 w-3 text-yellow-500" />
        Paiement sécurisé via Chariow • Code envoyé par email après paiement
      </p>
    </div>
  );
};

export default ChariowPlansWidget;

