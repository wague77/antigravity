"use client";

// PORTAGE FIDÈLE de src/components/Dashboard.tsx (TURFEX SOURCE)
import { useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Loader2, RefreshCw, Star, TrendingUp, Activity, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getOdds } from "@/lib/pronostics-source";

const REUNIONS = ["R1", "R2", "R3", "R4", "R5"];
const COURSES = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];

const toDDMMYYYY = (d) =>
  `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;

export const DashboardIntelligence = ({
  selectedDate,
  reunion,
  course,
  loading,
  participants,
  error,
  onDateChange,
  onReunionChange,
  onCourseChange,
  onRefresh,
}) => {
  const date = toDDMMYYYY(selectedDate);

  const top5 = participants.slice(0, 5);
  const stats = useMemo(() => {
    if (participants.length === 0) return { avgScore: 0, topOdds: 0, partants: 0 };
    return {
      avgScore: Math.round(
        participants.reduce((s, p) => s + p.score, 0) / participants.length
      ),
      topOdds: top5[0] ? getOdds(top5[0]) ?? 0 : 0,
      partants: participants.length,
    };
  }, [participants, top5]);

  const formatDate = (d) =>
    `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;

  return (
    <section
      id="dashboard-intelligence"
      className="border-t border-zinc-800/60 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black py-12 rounded-2xl mt-6 px-2"
      data-testid="dashboard-intelligence"
    >
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400">
              Tableau de bord
            </p>
            <h2 className="mt-1 text-3xl font-black md:text-4xl text-white">
              Analyse de Course <span className="text-emerald-400">en direct</span>
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Données Wague · {formatDate(date)} · {reunion} {course}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  data-testid="intelligence-date-trigger"
                  className={cn(
                    "justify-start border-amber-400/30 bg-zinc-900 text-white text-left font-normal hover:bg-zinc-800",
                    !selectedDate && "text-zinc-500"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-amber-400" />
                  {format(selectedDate, "dd MMM yyyy", { locale: fr })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && onDateChange(d)}
                  initialFocus
                  locale={fr}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Select value={reunion} onValueChange={onReunionChange}>
              <SelectTrigger
                data-testid="intelligence-reunion-select"
                className="w-28 border-amber-400/30 bg-zinc-900 text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REUNIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={course} onValueChange={onCourseChange}>
              <SelectTrigger
                data-testid="intelligence-course-select"
                className="w-28 border-amber-400/30 bg-zinc-900 text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COURSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={onRefresh}
              disabled={loading}
              data-testid="intelligence-refresh-btn"
              className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black shadow-[0_0_20px_rgba(251,191,36,0.4)] hover:opacity-90 font-bold"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Actualiser
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <StatCard
            icon={Activity}
            label="Partants"
            value={stats.partants.toString()}
            accent="gold"
          />
          <StatCard
            icon={TrendingUp}
            label="Score moyen"
            value={`${stats.avgScore}/100`}
            accent="turf"
          />
          <StatCard
            icon={Award}
            label="Cote favori IA"
            value={stats.topOdds ? Number(stats.topOdds).toFixed(2) : "—"}
            accent="gold"
          />
        </div>

        {error && (
          <div
            data-testid="intelligence-error"
            className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Top 5 prédictions */}
          <div className="lg:col-span-1">
            <div
              className="rounded-xl border border-emerald-400/30 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 p-5 shadow-[0_0_30px_rgba(34,197,94,0.2)]"
              data-testid="intelligence-top5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Prédiction <span className="text-emerald-400">TURFEX</span>
                </h3>
                <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
                  </span>
                  Live
                </span>
              </div>
              {loading && participants.length === 0 ? (
                <SkeletonRows />
              ) : (
                <ul className="space-y-2">
                  {top5.map((p) => (
                    <li
                      key={p.numPmu}
                      className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2.5 transition-colors hover:bg-black/70"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-black ${
                            p.rank === 1
                              ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-black"
                              : p.rank <= 3
                              ? "bg-emerald-400/30 text-emerald-300"
                              : "bg-zinc-700 text-zinc-300"
                          }`}
                        >
                          {p.rank}
                        </span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-800 text-xs font-black text-amber-400">
                          {p.numPmu}
                        </span>
                        <div className="min-w-0 flex flex-col">
                          <span className="truncate text-sm font-bold leading-tight text-white">{p.nom}</span>
                          <span className="truncate text-[10px] uppercase tracking-wider text-zinc-400">
                            {p.driver ?? p.entraineur ?? "—"}
                          </span>
                        </div>
                      </div>
                      <span className="ml-2 font-mono text-sm font-bold text-emerald-400">
                        {p.score.toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Full participants table */}
          <div className="lg:col-span-2">
            <div
              className="overflow-hidden rounded-xl border border-amber-400/20 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-2xl"
              data-testid="intelligence-table-wrapper"
            >
              <div className="border-b border-zinc-700/60 px-5 py-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Tous les Partants
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700/60 text-left text-[11px] uppercase text-zinc-400">
                      <th className="px-4 py-3">N°</th>
                      <th className="px-4 py-3">Cheval</th>
                      <th className="px-4 py-3">Driver</th>
                      <th className="px-4 py-3">Musique</th>
                      <th className="px-4 py-3 text-right">Cote</th>
                      <th className="px-4 py-3 text-right">Score</th>
                      <th className="px-4 py-3 text-center">Confiance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && participants.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-400" />
                          <p className="mt-2">Chargement des participants...</p>
                        </td>
                      </tr>
                    ) : participants.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                          Aucune donnée disponible.
                        </td>
                      </tr>
                    ) : (
                      participants.map((p) => {
                        const odds = getOdds(p);
                        return (
                          <tr
                            key={p.numPmu}
                            className="border-b border-zinc-800/30 transition-colors hover:bg-black/40"
                          >
                            <td className="px-4 py-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded bg-zinc-800 text-xs font-black text-white">
                                {p.numPmu}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-white">{p.nom}</td>
                            <td className="px-4 py-3 text-zinc-400">
                              {p.driver ?? p.entraineur ?? "—"}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                              {p.musique ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-zinc-200">
                              {odds ? Number(odds).toFixed(2) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-mono font-bold ${
                                  p.rank === 1
                                    ? "text-amber-400"
                                    : p.rank <= 3
                                    ? "text-emerald-400"
                                    : "text-white"
                                }`}
                              >
                                {p.score.toFixed(0)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center gap-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`h-3.5 w-3.5 ${
                                      i < p.confidence
                                        ? "fill-amber-400 text-amber-400"
                                        : "text-zinc-700"
                                    }`}
                                  />
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const StatCard = ({ icon: Icon, label, value, accent }) => (
  <div className="flex items-center justify-between rounded-xl border border-zinc-700/60 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 p-5">
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 text-3xl font-black ${
          accent === "gold" ? "text-amber-400" : "text-emerald-400"
        }`}
      >
        {value}
      </p>
    </div>
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-lg ${
        accent === "gold" ? "bg-amber-400/15" : "bg-emerald-400/15"
      }`}
    >
      <Icon className={`h-6 w-6 ${accent === "gold" ? "text-amber-400" : "text-emerald-400"}`} />
    </div>
  </div>
);

const SkeletonRows = () => (
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className="h-11 animate-pulse rounded-lg bg-black/40"
      />
    ))}
  </div>
);

export default DashboardIntelligence;

