"use client";

/**
 * TurfAstroPanel — page Turf Astro intégrée comme onglet dans TURFEX.
 *
 * Reproduit identiquement Home.jsx du code source `turf_astro_source_complet.txt`,
 * encapsulée dans `.turf-astro-root` pour scoper les styles spécifiques sans
 * affecter le reste de TURFEX.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Dices, Flag, Trophy, Clock, Users, Map } from "lucide-react";
import RaceSelector from "./RaceSelector";
import ParticipantTable from "./ParticipantTable";
import NumerologyPanel from "./NumerologyPanel";
import FavoritesPanel from "./FavoritesPanel";
import {
  getProgramme, getParticipants, getNumerology,
  listFavorites, addFavorite, removeFavorite,
  fmtDate, formatTime, formatMontant, parseDateKey,
} from "./api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


export default function TurfAstroPanel() {
  const [date, setDate] = useState(new Date());
  const [reunions, setReunions] = useState([]);
  const [selectedReunion, setSelectedReunion] = useState(1);
  const [selectedCourse, setSelectedCourse] = useState(1);

  const [participants, setParticipants] = useState([]);
  const [numerology, setNumerology] = useState(null);

  const [loadingProg, setLoadingProg] = useState(false);
  const [loadingRace, setLoadingRace] = useState(false);

  const [favorites, setFavorites] = useState([]);
  // Sous-vue interne (custom — pas de Radix Tabs imbriqué pour éviter la collision
  // de RovingFocusGroup avec le Tabs parent dans Index.jsx qui faisait fermer
  // l'onglet Turf Astro à l'ouverture sur certains navigateurs).
  const [view, setView] = useState("participants");

  const dateKey = useMemo(() => fmtDate(date), [date]);

  const reunion = useMemo(
    () => reunions.find((r) => r.numOfficiel === selectedReunion),
    [reunions, selectedReunion]
  );
  const course = useMemo(
    () => reunion?.courses?.find((c) => c.numOrdre === selectedCourse),
    [reunion, selectedCourse]
  );

  // Load programme on date change
  useEffect(() => {
    let active = true;
    setLoadingProg(true);
    setReunions([]);
    setParticipants([]);
    setNumerology(null);
    getProgramme(dateKey)
      .then((data) => {
        if (!active) return;
        setReunions(data.reunions || []);
        if (data.reunions?.length) {
          setSelectedReunion(data.reunions[0].numOfficiel);
          setSelectedCourse(data.reunions[0].courses?.[0]?.numOrdre || 1);
        }
      })
      .catch((e) => {
        toast.error("Impossible de charger le programme WAGUE");
        console.error(e);
      })
      .finally(() => active && setLoadingProg(false));
    return () => { active = false; };
  }, [dateKey]);

  // Load participants + numerology
  useEffect(() => {
    if (!reunion || !course) return;
    let active = true;
    setLoadingRace(true);
    setParticipants([]);
    setNumerology(null);
    Promise.all([
      getParticipants(dateKey, selectedReunion, selectedCourse),
      getNumerology(dateKey, selectedReunion, selectedCourse),
    ])
      .then(([pData, nData]) => {
        if (!active) return;
        setParticipants(pData.participants || []);
        setNumerology(nData);
      })
      .catch((e) => {
        toast.error("Erreur lors du chargement de la course");
        console.error(e);
      })
      .finally(() => active && setLoadingRace(false));
    return () => { active = false; };
  }, [dateKey, selectedReunion, selectedCourse, reunion, course]);

  // Favorites
  const refreshFavorites = useCallback(async () => {
    try {
      const data = await listFavorites();
      setFavorites(data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { refreshFavorites(); }, [refreshFavorites]);

  const isFavorite = useCallback((numPmu) =>
    favorites.some(
      (f) => f.date === dateKey && f.reunion === selectedReunion &&
             f.course === selectedCourse && f.numPmu === numPmu
    ), [favorites, dateKey, selectedReunion, selectedCourse]);

  const onToggleFavorite = useCallback(async (p) => {
    const existing = favorites.find(
      (f) => f.date === dateKey && f.reunion === selectedReunion &&
             f.course === selectedCourse && f.numPmu === p.numPmu
    );
    try {
      if (existing) {
        await removeFavorite(existing.id);
        toast.success(`${p.nom} retiré des favoris`);
      } else {
        await addFavorite({
          date: dateKey, reunion: selectedReunion, course: selectedCourse,
          numPmu: p.numPmu, nom: p.nom, note: "",
        });
        toast.success(`${p.nom} ajouté aux favoris`);
      }
      await refreshFavorites();
    } catch (e) {
      toast.error("Erreur favoris");
      console.error(e);
    }
  }, [favorites, dateKey, selectedReunion, selectedCourse, refreshFavorites]);

  const jumpToFavorite = useCallback((f) => {
    setDate(parseDateKey(f.date));
    setSelectedReunion(f.reunion);
    setSelectedCourse(f.course);
  }, []);

  const predictionsMap = useMemo(() => {
    const map = {};
    (numerology?.predictions || []).forEach((p) => { map[p.numPmu] = p; });
    return map;
  }, [numerology]);

  const partantCount = participants.filter((p) => p.statut === "PARTANT").length;

  return (
    <div className="turf-astro-root bg-paper turf-grain min-h-[60vh] -mx-3 px-3 py-4 rounded-xl" data-testid="turf-astro-panel">
      {/* Header */}
      <header className="border-b border-stone-200/60 bg-white/60 backdrop-blur-sm rounded-t-xl">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-900 text-amber-300 flex items-center justify-center">
              <Flag className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-2xl font-bold text-emerald-950 tracking-tight leading-none">
                Turf Astro
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mt-0.5">
                Programmes WAGUE · Numérologie de course
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-stone-600">
            <Dices className="h-4 w-4 text-amber-600" />
            <span>Méthode Astro · 1925</span>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 space-y-6">
        <RaceSelector
          date={date} setDate={setDate}
          reunions={reunions}
          selectedReunion={selectedReunion} setSelectedReunion={setSelectedReunion}
          selectedCourse={selectedCourse} setSelectedCourse={setSelectedCourse}
          loading={loadingProg}
        />

        {/* Race banner */}
        {course && reunion && (
          <div className="bg-white rounded-xl border border-stone-200 card-bevel p-5 race-in" data-testid="astro-race-banner">
            <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-amber-700 font-semibold">
                  R{selectedReunion} · C{selectedCourse} · {reunion.hippodrome?.libelleLong}
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-emerald-950 mt-1 tracking-tight">
                  {course.libelle}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-900">
                  <Trophy className="h-3 w-3 mr-1" /> {course.discipline}
                </Badge>
                <Badge variant="outline" className="bg-stone-50">
                  <Map className="h-3 w-3 mr-1" />
                  {course.distance}{course.distanceUnit === "METRE" ? "m" : ""}
                </Badge>
                <Badge variant="outline" className="bg-stone-50">
                  <Clock className="h-3 w-3 mr-1" />{formatTime(course.heureDepart)}
                </Badge>
                <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-900">
                  {formatMontant(course.montantPrix)}
                </Badge>
                <Badge variant="outline" className="bg-stone-50">
                  <Users className="h-3 w-3 mr-1" /> {partantCount}/{course.nombreDeclaresPartants || "?"}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Sub-view selector (custom — évite Radix Tabs imbriqué) */}
        <div className="bg-white border border-stone-200 card-bevel rounded-md inline-flex gap-1 p-1" data-testid="astro-subview-tabs">
          {[
            { v: "participants", label: "Participants", testid: "astro-tab-participants" },
            { v: "numerology", label: "Pronostic Astro", testid: "astro-tab-numerology" },
            { v: "favorites", label: "Favoris", testid: "astro-tab-favorites", count: favorites.length },
          ].map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setView(t.v);
              }}
              data-testid={t.testid}
              className={cn(
                "px-3 py-1.5 rounded-sm text-sm font-medium transition-colors",
                view === t.v
                  ? "bg-emerald-900 text-amber-50 shadow-sm"
                  : "text-stone-700 hover:bg-stone-100"
              )}
            >
              {t.label}
              {t.count > 0 && <span className="ml-1 kbd text-xs text-amber-600">({t.count})</span>}
            </button>
          ))}
        </div>

        {view === "participants" && (
          <div className="space-y-4">
            <NumerologyPanel numerology={numerology} loading={loadingRace} />
            {loadingRace ? (
              <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
                Chargement des participants…
              </div>
            ) : (
              <ParticipantTable
                participants={participants}
                predictionsMap={predictionsMap}
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
              />
            )}
          </div>
        )}

        {view === "numerology" && (
          <div className="space-y-4">
            <NumerologyPanel numerology={numerology} loading={loadingRace} />
            {numerology && (
              <div className="bg-white rounded-xl border border-stone-200 card-bevel p-5">
                <h3 className="font-display text-lg font-semibold mb-2">Classement Astro complet</h3>
                <div className="gold-line mb-3" />
                <ol className="space-y-1.5">
                  {(numerology.predictions || []).map((p) => (
                    <li key={p.numPmu} className="flex items-center gap-3 py-1.5 border-b border-stone-100 last:border-0" data-testid={`astro-mozan-rank-${p.rank}`}>
                      <span className="kbd text-xs w-6 text-stone-500">#{p.rank}</span>
                      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-900 to-emerald-700 text-amber-50 flex items-center justify-center font-display font-bold text-sm">
                        {p.numPmu}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-semibold text-stone-900 truncate">{p.nom}</div>
                        <div className="text-[11px] text-stone-500">{p.reasons?.[0]}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-900">{p.score}</div>
                        <div className="text-[10px] text-stone-500 kbd">NV {p.nameValueTotal}→{p.nameValueReduced}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {view === "favorites" && (
          <FavoritesPanel
            favorites={favorites}
            onRemove={async (id) => {
              await removeFavorite(id);
              toast.success("Favori supprimé");
              refreshFavorites();
            }}
            onJump={jumpToFavorite}
          />
        )}

        <footer className="text-center text-xs text-stone-500 py-6">
          Données : <span className="text-emerald-900 font-medium">WAGUE</span> · Numérologie : Astro's Racing Numerology
        </footer>
      </main>
    </div>
  );
}

