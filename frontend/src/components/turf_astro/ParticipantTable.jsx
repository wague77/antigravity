"use client";

import { useState } from "react";
import { Star, ChevronDown, ChevronUp, Award, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const Trend = ({ direct, reference }) => {
  if (direct == null || reference == null) return <Minus className="h-3 w-3 text-stone-400" />;
  if (direct < reference) return <TrendingDown className="h-3 w-3 text-emerald-700" />;
  if (direct > reference) return <TrendingUp className="h-3 w-3 text-rose-600" />;
  return <Minus className="h-3 w-3 text-stone-400" />;
};

export default function ParticipantTable({ participants, predictionsMap, isFavorite, onToggleFavorite }) {
  const [expanded, setExpanded] = useState({});
  const partants = participants.filter((p) => p.statut === "PARTANT");

  if (!partants.length) {
    return <div className="text-sm text-stone-500 p-6 text-center">Aucun participant.</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 card-bevel overflow-hidden" data-testid="astro-participants-table">
      <div className="scrollbar-x-visible">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-emerald-900 text-amber-50 text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3 text-left">N°</th>
              <th className="p-3 text-left">Cheval</th>
              <th className="p-3 text-left hidden md:table-cell">Driver / Jockey</th>
              <th className="p-3 text-left hidden lg:table-cell">Entraîneur</th>
              <th className="p-3 text-center hidden md:table-cell">Âge / Sexe</th>
              <th className="p-3 text-center">Cote</th>
              <th className="p-3 text-center">Astro</th>
              <th className="p-3 text-center">★</th>
              <th className="p-3 text-center w-8"></th>
            </tr>
          </thead>
          <tbody className="race-in-stagger">
            {partants.map((p) => {
              const num = p.numPmu;
              const pred = predictionsMap?.[num];
              const cote = p.dernierRapportDirect?.rapport;
              const coteRef = p.dernierRapportReference?.rapport;
              const fav = isFavorite(num);
              const isOpen = !!expanded[num];

              return (
                <Row key={num}
                  p={p} pred={pred} cote={cote} coteRef={coteRef}
                  isOpen={isOpen} fav={fav}
                  onToggle={() => setExpanded((s) => ({ ...s, [num]: !s[num] }))}
                  onFav={() => onToggleFavorite(p)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ p, pred, cote, coteRef, isOpen, fav, onToggle, onFav }) {
  const num = p.numPmu;
  const scoreColor =
    pred?.score >= 80 ? "bg-emerald-900 text-amber-50" :
    pred?.score >= 60 ? "bg-amber-500 text-emerald-950" :
    pred?.score >= 30 ? "bg-stone-200 text-stone-700" :
    "bg-stone-100 text-stone-500";

  return (
    <>
      <tr className="border-t border-stone-100 hover:bg-stone-50/60 transition-colors" data-testid={`astro-participant-row-${num}`}>
        <td className="p-3 align-middle">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-900 to-emerald-700 text-amber-50 flex items-center justify-center font-display font-bold race-pill">
              {num}
            </div>
            {pred?.rank === 1 && <Award className="h-4 w-4 text-amber-500" />}
          </div>
        </td>
        <td className="p-3 align-middle">
          <div className="flex items-center gap-3">
            {p.urlCasaque && (
              <img src={p.urlCasaque} alt="" className="w-8 h-8 casaque-shadow rounded" loading="lazy" />
            )}
            <div>
              <div className="font-display font-semibold text-stone-900">{p.nom}</div>
              <div className="text-xs text-stone-500 kbd">
                {p.musique || "—"}
              </div>
            </div>
          </div>
        </td>
        <td className="p-3 align-middle hidden md:table-cell">
          <div className="text-stone-800 font-medium">{p.driver || p.jockey || "—"}</div>
          {p.driverChange && <span className="text-[10px] text-rose-600 uppercase">changement</span>}
        </td>
        <td className="p-3 align-middle hidden lg:table-cell text-stone-600">{p.entraineur || "—"}</td>
        <td className="p-3 align-middle text-center hidden md:table-cell">
          <span className="text-stone-700">{p.age || "?"}</span>
          <span className="text-stone-400 mx-1">·</span>
          <span className="text-stone-500 text-xs">{(p.sexe || "").charAt(0)}</span>
        </td>
        <td className="p-3 align-middle text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-display font-semibold text-stone-900 race-pill">
              {cote != null ? cote.toFixed(1) : "—"}
            </span>
            <Trend direct={cote} reference={coteRef} />
          </div>
        </td>
        <td className="p-3 align-middle text-center">
          {pred ? (
            <div className="inline-flex flex-col items-center">
              <span className={cn("inline-flex items-center justify-center min-w-[36px] px-2 py-1 rounded-md text-xs font-bold", scoreColor)}>
                {pred.score}
              </span>
              <span className="text-[10px] text-stone-500 mt-0.5">#{pred.rank}</span>
            </div>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </td>
        <td className="p-3 align-middle text-center">
          <button
            onClick={onFav}
            data-testid={`astro-fav-toggle-${num}`}
            className={cn("p-1.5 rounded-md transition-colors",
              fav ? "text-amber-500 hover:bg-amber-50" : "text-stone-300 hover:text-amber-500 hover:bg-amber-50")}
          >
            <Star className={cn("h-4 w-4", fav && "fill-current")} />
          </button>
        </td>
        <td className="p-2 align-middle text-center">
          <button
            onClick={onToggle}
            data-testid={`astro-expand-row-${num}`}
            className="p-1.5 rounded-md text-stone-500 hover:bg-stone-100"
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-stone-50/70 border-t border-stone-100">
          <td colSpan={9} className="p-4">
            <Detail p={p} pred={pred} />
          </td>
        </tr>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-sm font-medium text-stone-900 mt-0.5">{value}</div>
    </div>
  );
}

function Detail({ p, pred }) {
  const g = p.gainsParticipant || {};
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      <Stat label="Race" value={p.race || "—"} />
      <Stat label="Robe" value={p.robe?.libelleLong || "—"} />
      <Stat label="Place corde" value={p.placeCorde ?? "—"} />
      <Stat label="Œillères" value={(p.oeilleres || "").replace(/_/g, " ").toLowerCase() || "—"} />
      <Stat label="Poids" value={p.handicapPoids ? `${(p.handicapPoids / 10).toFixed(1)} kg` : "—"} />
      <Stat label="Hand. valeur" value={p.handicapValeur ?? "—"} />
      <Stat label="Courses" value={p.nombreCourses ?? "—"} />
      <Stat label="Victoires" value={p.nombreVictoires ?? "—"} />
      <Stat label="Places" value={p.nombrePlaces ?? "—"} />
      <Stat label="Gains carrière" value={g.gainsCarriere != null ? `${(g.gainsCarriere / 100).toLocaleString("fr-FR")} €` : "—"} />
      <Stat label="Gains année" value={g.gainsAnneeEnCours != null ? `${(g.gainsAnneeEnCours / 100).toLocaleString("fr-FR")} €` : "—"} />
      <Stat label="Père / Mère" value={`${p.nomPere || "?"} / ${p.nomMere || "?"}`} />
      <Stat label="Propriétaire" value={p.proprietaire || "—"} />
      <Stat label="Éleveur" value={p.eleveur || "—"} />
      <Stat label="Pays entr." value={p.paysEntrainement || "—"} />
      <Stat label="Allure" value={p.allure || "—"} />
      {pred && (
        <div className="col-span-2 sm:col-span-3 lg:col-span-6 mt-1 pt-3 border-t border-stone-200">
          <div className="text-[10px] uppercase tracking-wider text-emerald-900 font-bold mb-1">Analyse Astro</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-700">
            <span>Name Value : <b className="kbd">{pred.nameValueTotal}</b> → <b className="kbd">{pred.nameValueReduced}</b></span>
            <span>Initial Digit : <b className="kbd">{pred.initialDigit}</b></span>
            <span>Score : <b>{pred.score}</b></span>
          </div>
          <ul className="mt-1 list-disc list-inside text-xs text-stone-600">
            {(pred.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

