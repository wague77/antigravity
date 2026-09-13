"use client";

import { useEffect, useMemo } from "react";
import { Calendar as CalendarIcon, MapPin, Trophy, Clock } from "lucide-react";
import { fmtDate, formatTime } from "./api";
import { cn } from "@/lib/utils";

// Format ISO YYYY-MM-DD pour <input type="date"> (indépendant locale)
const toIsoDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const fromIsoDate = (s) => {
  // s = "YYYY-MM-DD" — créer une Date locale (pas UTC) pour éviter les décalages timezone
  const [yyyy, mm, dd] = s.split("-").map(Number);
  return new Date(yyyy, (mm || 1) - 1, dd || 1);
};

export default function RaceSelector({
  date, setDate,
  reunions, selectedReunion, setSelectedReunion,
  selectedCourse, setSelectedCourse,
  loading,
}) {
  const reunion = useMemo(
    () => reunions.find((r) => r.numOfficiel === selectedReunion),
    [reunions, selectedReunion]
  );

  useEffect(() => {
    if (reunions.length && !reunions.find((r) => r.numOfficiel === selectedReunion)) {
      setSelectedReunion(reunions[0].numOfficiel);
    }
  }, [reunions, selectedReunion, setSelectedReunion]);

  useEffect(() => {
    if (reunion && reunion.courses?.length) {
      const ok = reunion.courses.find((c) => c.numOrdre === selectedCourse);
      if (!ok) setSelectedCourse(reunion.courses[0].numOrdre);
    }
  }, [reunion, selectedCourse, setSelectedCourse]);

  const handleDateChange = (e) => {
    const value = e.target.value;
    if (!value) return;
    const d = fromIsoDate(value);
    if (isNaN(d.getTime())) return;
    setDate(d);
  };

  return (
    <div className="bg-white card-bevel rounded-xl border border-stone-200/80 p-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Date Picker — input natif, indépendant locale et sans Radix Popover */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.18em] text-stone-500" htmlFor="astro-date-input">
            Date
          </label>
          <div className="relative flex items-center min-w-[220px]">
            <CalendarIcon className="absolute left-3 h-4 w-4 text-emerald-800 pointer-events-none" />
            <input
              id="astro-date-input"
              type="date"
              data-testid="astro-date-picker-button"
              value={toIsoDate(date)}
              onChange={handleDateChange}
              className="h-11 pl-9 pr-3 w-full border border-stone-300 bg-stone-50 hover:bg-stone-100 rounded-md text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
            />
            <span className="ml-2 kbd text-[10px] text-stone-400 whitespace-nowrap">
              {fmtDate(date)}
            </span>
          </div>
        </div>

        {/* Reunions */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <label className="text-xs uppercase tracking-[0.18em] text-stone-500">Réunions ({reunions.length})</label>
          <div className="flex gap-2 overflow-x-auto scroll-x pb-1" data-testid="astro-reunions-list">
            {loading && <div className="text-sm text-stone-500 px-2">Chargement…</div>}
            {!loading && reunions.length === 0 && (
              <div className="text-sm text-stone-500 px-2">Aucune réunion pour cette date.</div>
            )}
            {reunions.map((r) => {
              const active = r.numOfficiel === selectedReunion;
              return (
                <button
                  key={r.numOfficiel}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedReunion(r.numOfficiel);
                  }}
                  data-testid={`astro-reunion-btn-R${r.numOfficiel}`}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-2 text-left border transition-all",
                    active
                      ? "border-emerald-800 bg-emerald-900 text-amber-50 shadow-sm"
                      : "border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn("font-display text-base font-bold", active && "text-amber-300")}>
                      R{r.numOfficiel}
                    </span>
                    <MapPin className="h-3 w-3 opacity-60" />
                    <span className="text-xs font-medium truncate max-w-[140px]">{r.hippodrome?.libelleCourt}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide opacity-70 mt-0.5">
                    {r.courses?.length || 0} courses
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Courses */}
      {reunion && (
        <div className="mt-4 pt-4 border-t border-stone-200">
          <label className="text-xs uppercase tracking-[0.18em] text-stone-500 mb-2 block">
            Courses — {reunion.hippodrome?.libelleLong}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2" data-testid="astro-courses-list">
            {reunion.courses?.map((c) => {
              const active = c.numOrdre === selectedCourse;
              return (
                <button
                  key={c.numOrdre}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedCourse(c.numOrdre);
                  }}
                  data-testid={`astro-course-btn-C${c.numOrdre}`}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-all",
                    active
                      ? "border-amber-500 bg-gradient-to-br from-amber-50 to-stone-50 shadow-sm"
                      : "border-stone-200 bg-white hover:border-emerald-700/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("font-display font-bold", active ? "text-emerald-900" : "text-stone-900")}>
                      C{c.numOrdre}
                    </span>
                    <span className="kbd text-xs text-stone-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{formatTime(c.heureDepart)}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-stone-700 mt-1 line-clamp-1">{c.libelle}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wide mt-0.5 flex items-center gap-1.5">
                    <Trophy className="h-2.5 w-2.5" />
                    {c.discipline} · {c.distance}{c.distanceUnit === "METRE" ? "m" : ""} · {c.nombreDeclaresPartants || "?"} part.
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

