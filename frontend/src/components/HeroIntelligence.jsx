"use client";

// PORTAGE FIDÈLE de src/components/Hero.tsx (TURFEX SOURCE)
import { Trophy, Target, Brain, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Target, title: "PRONOSTICS", subtitle: "ULTRA PRÉCIS" },
  { icon: Trophy, title: "ANALYSES", subtitle: "POUSSÉES" },
  { icon: Brain, title: "INTELLIGENCE", subtitle: "ARTIFICIELLE" },
  { icon: ShieldCheck, title: "SÉCURISÉ", subtitle: "100% EN LIGNE" },
];

export const HeroIntelligence = ({ onLaunch, topPredictions = [], loading = false }) => {
  return (
    <section className="relative overflow-hidden rounded-2xl border-2 border-amber-500/30" data-testid="hero-intelligence">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/turfex-hero-bg.png"
          alt="Course de chevaux au coucher du soleil"
          className="h-full w-full object-cover opacity-60"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/70" />
      </div>

      <div className="container relative mx-auto px-4 py-12 md:py-16 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          {/* Left: badges + title */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rotate-[-4deg] bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2 shadow-lg">
                <p className="text-xs font-black tracking-wider text-white">GAGNEZ PLUS !</p>
                <p className="text-[10px] font-bold tracking-[0.2em] text-white/90">
                  ANALYSE · PRÉDICTION · PERFORMANCE
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-black/70 px-4 py-2 backdrop-blur">
                <Trophy className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Logiciel N°1 des Parieurs
                </span>
              </div>
            </div>

            <h1 className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-6xl lg:text-7xl">
              <span className="block text-white">TURFEX</span>
              <span className="block text-amber-400">INTELLIGENCE</span>
            </h1>

            <div className="inline-block rotate-[-2deg] bg-gradient-to-r from-rose-600 to-red-600 px-6 py-3 shadow-lg">
              <p className="text-2xl font-black uppercase text-white md:text-3xl">
                Wague + <span className="text-amber-400">Turf</span>Genius
              </p>
            </div>

            <p className="max-w-lg text-base text-zinc-300 md:text-lg">
              Analyses en temps réel des courses Wague, pronostics IA, scores de confiance et détection
              automatique des favoris. Toutes les données. Toute la puissance.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={onLaunch}
                data-testid="hero-launch-btn"
                className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black shadow-[0_0_30px_rgba(251,191,36,0.5)] hover:opacity-90 font-bold"
              >
                Lancer l'analyse
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={onLaunch}
                className="border-amber-400/50 text-amber-400 hover:bg-amber-400/10 font-bold bg-transparent"
              >
                Voir les courses
              </Button>
            </div>
          </div>

          {/* Right: floating stat cards */}
          <div className="relative hidden lg:block">
            <div className="absolute -left-6 top-6 w-72 rotate-[-3deg] rounded-xl border border-amber-400/30 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 p-5 shadow-2xl backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Gains potentiels
              </p>
              <p className="mt-1 text-4xl font-black text-emerald-400">+27,85%</p>
              <p className="mt-1 text-xs text-zinc-400">sur les 30 derniers jours</p>
            </div>
            <div className="ml-auto mt-32 w-80 rotate-[2deg] rounded-xl border border-emerald-400/30 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 p-5 shadow-[0_0_30px_rgba(34,197,94,0.3)] backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Prédiction TURFEX
                </p>
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  LIVE
                </span>
              </div>
              {loading && topPredictions.length === 0 ? (
                <div className="mt-3 flex h-28 items-center justify-center rounded-lg bg-black/40 text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {topPredictions.map((p) => (
                    <li
                      key={p.numPmu}
                      className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-xs font-black text-black">
                          {p.numPmu}
                        </span>
                        <span className="truncate font-bold text-white">{p.nom}</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400">{p.score.toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <div className="mt-16 grid grid-cols-2 gap-3 md:grid-cols-4">
          {features.map(({ icon: Icon, title, subtitle }) => (
            <div
              key={title}
              className="flex items-center gap-3 rounded-lg border border-amber-400/20 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 px-4 py-3 backdrop-blur"
            >
              <Icon className="h-7 w-7 shrink-0 text-amber-400" />
              <div className="leading-tight">
                <p className="text-sm font-black text-white">{title}</p>
                <p className="text-xs font-bold text-emerald-400">{subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroIntelligence;

