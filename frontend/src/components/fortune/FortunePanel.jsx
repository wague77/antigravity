"use client";

/**
 * FortunePanel — onglet "Le Pari de la Fortune" (méthode WAGUE) intégré dans TURFEX.
 *
 * Reproduit l'application standalone source à l'identique :
 * - Sidebar : sélecteur de date + listing réunions / courses
 * - Header de course : libellé + bouton "Lancer l'analyse WAGUE"
 * - Sous-vues : Course & Presse · Modules d'Analyse · Tickets · Money Mgmt
 *
 * Encapsulé dans `.fortune-root` pour scoper les styles. Aucun composant Radix
 * imbriqué (Popover, Tabs) — uniquement état React + boutons natifs — pour
 * éviter la collision avec le Tabs parent de TURFEX.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Calculator, Ticket, Wallet, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ddmmyyyy, fetchFortuneProgramme, fetchFortuneParticipants, fortuneAnalyze,
} from "./api";
import FortuneParticipantsTable from "./FortuneParticipantsTable";
import FortunePressWidget from "./FortunePressWidget";
import FortuneGroupsGrid from "./FortuneGroupsGrid";
import FortuneTicketsPanel from "./FortuneTicketsPanel";
import FortuneMoneyManagement from "./FortuneMoneyManagement";


const toIsoDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const fromIsoDate = (s) => {
  const [yyyy, mm, dd] = s.split("-").map(Number);
  return new Date(yyyy, (mm || 1) - 1, dd || 1);
};

export default function FortunePanel() {
  const [date, setDate] = React.useState(new Date());
  const [reunions, setReunions] = React.useState([]);
  const [selection, setSelection] = React.useState(null);
  const [loadingProg, setLoadingProg] = React.useState(false);

  const [horses, setHorses] = React.useState([]);
  const [loadingRace, setLoadingRace] = React.useState(false);
  const [groups, setGroups] = React.useState(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [tab, setTab] = React.useState("course");

  // Charge le programme à chaque changement de date
  React.useEffect(() => {
    let cancel = false;
    setLoadingProg(true);
    fetchFortuneProgramme(ddmmyyyy(date))
      .then((d) => {
        if (cancel) return;
        const list = d?.reunions || [];
        setReunions(list);
        if (list.length) {
          const r = list[0];
          const c = r.courses?.[0];
          setSelection({ R: r.numOfficiel, C: c?.numOrdre || 1, reunion: r, course: c });
        } else {
          setSelection(null);
        }
      })
      .catch((e) => {
        toast.error("Impossible de charger le programme");
        console.error(e);
      })
      .finally(() => !cancel && setLoadingProg(false));
    return () => { cancel = true; };
  }, [date]);

  // Charge participants à chaque changement de selection
  React.useEffect(() => {
    if (!selection) { setHorses([]); setGroups(null); return; }
    setLoadingRace(true);
    setGroups(null);
    fetchFortuneParticipants(ddmmyyyy(date), selection.R, selection.C)
      .then((d) => {
        const mapped = (d.participants || []).map((p) => ({
          numPmu: p.numPmu, nom: p.nom, driver: p.driver, entraineur: p.entraineur,
          age: p.age, sexe: p.sexe, musique: p.musique,
          nombreCourses: p.nombreCourses, nombreVictoires: p.nombreVictoires,
          coteDirecte: p.coteDirecte, coteReference: p.coteReference,
          favoris: p.favoris, ls: p.lsAuto || 0, status: p.statusAuto || "NW",
          pressScore: p.favoris ? 5 : 0,
        }));
        setHorses(mapped);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingRace(false));
  }, [date, selection]);

  const runAnalyze = async () => {
    if (!horses.length) return;
    setAnalyzing(true);
    try {
      const data = await fortuneAnalyze(horses.map((h) => ({
        numPmu: h.numPmu, nom: h.nom, ls: h.ls, status: h.status, pressScore: h.pressScore,
      })));
      setGroups(data.groups);
      setTab("analyse");
      toast.success("Analyse WAGUE générée");
    } catch (e) {
      toast.error("Erreur d'analyse");
    } finally {
      setAnalyzing(false);
    }
  };

  const c = selection?.course;
  const r = selection?.reunion;

  return (
    <div className="fortune-root grid-bg -mx-3 px-3 py-4 rounded-xl bg-slate-50 min-h-[60vh]" data-testid="fortune-panel">
      <div className="flex flex-col lg:flex-row gap-4">

        {/* Sidebar */}
        <aside className="lg:w-72 shrink-0 border border-slate-200 bg-white flex flex-col rounded">
          <div className="p-4 border-b border-slate-200">
            <div className="font-cabinet text-xl font-extrabold tracking-tight leading-none">Le Pari</div>
            <div className="font-cabinet text-xl font-extrabold tracking-tight text-turf leading-none">de la Fortune</div>
            <div className="mt-1 text-[10px] font-ibm-mono uppercase tracking-[0.2em] text-muted-foreground">
              Système WAGUE
            </div>
          </div>

          <div className="p-4 border-b border-slate-200 space-y-2">
            <div className="text-[10px] font-ibm-sans font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Date du programme
            </div>
            <div className="relative flex items-center">
              <CalendarDays className="absolute left-3 w-3.5 h-3.5 text-turf pointer-events-none" />
              <input
                type="date"
                value={toIsoDate(date)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const d = fromIsoDate(e.target.value);
                  if (!isNaN(d.getTime())) setDate(d);
                }}
                className="w-full pl-9 pr-3 h-9 text-xs font-ibm-mono border border-slate-300 rounded bg-white"
                data-testid="fortune-date-input"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin max-h-[60vh]">
            {loadingProg && (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
            {!loadingProg && reunions.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">Aucune réunion ce jour.</div>
            )}
            {!loadingProg && reunions.map((r) => (
              <div key={r.numOfficiel} className="border-b border-slate-100" data-testid={`fortune-reunion-R${r.numOfficiel}`}>
                <div className="px-4 pt-3 pb-1">
                  <div className="font-cabinet text-sm font-bold">R{r.numOfficiel} · {r.hippodrome}</div>
                  <div className="text-[10px] font-ibm-mono text-muted-foreground uppercase">
                    {r.pays} · {r.nature}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 p-2">
                  {r.courses.map((c2) => {
                    const active = selection?.R === r.numOfficiel && selection?.C === c2.numOrdre;
                    return (
                      <button
                        key={c2.numOrdre}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelection({ R: r.numOfficiel, C: c2.numOrdre, reunion: r, course: c2 });
                        }}
                        data-testid={`fortune-course-R${r.numOfficiel}C${c2.numOrdre}`}
                        className={cn(
                          "px-2 py-1.5 text-[11px] font-ibm-mono border transition-colors duration-150",
                          active
                            ? "bg-turf border-turf"
                            : "bg-white border-slate-200 hover:bg-slate-100 text-slate-700"
                        )}
                      >
                        C{c2.numOrdre}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {loadingProg && (
            <div className="p-2 border-t border-slate-200 text-[10px] font-ibm-mono text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> chargement…
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {!selection ? (
            <div className="border border-slate-200 bg-white grid-bg p-12 text-center rounded">
              <div className="font-cabinet text-3xl font-extrabold tracking-tight">Le Pari de la Fortune</div>
              <div className="mt-3 text-sm text-muted-foreground">
                Sélectionnez une date et une course dans la barre latérale pour démarrer votre analyse WAGUE.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-slate-200 bg-white rounded">
                <div className="px-6 py-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-ibm-sans font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {date.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} · R{selection.R} C{selection.C}
                    </div>
                    <h1 className="font-cabinet text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                      {c?.libelle || `Course ${selection.C}`}
                    </h1>
                    <div className="text-sm text-muted-foreground mt-1">
                      {r?.hippodrome} · {c?.discipline} · {c?.distance}m · {c?.nombrePartants} partants
                    </div>
                  </div>
                  <Button
                    onClick={runAnalyze}
                    disabled={!horses.length || analyzing}
                    className="bg-turf hover:bg-turf-dark h-10 px-6"
                    data-testid="fortune-btn-analyze"
                  >
                    <Activity className="w-4 h-4 mr-2" />
                    {analyzing ? "Analyse en cours…" : "Lancer l'analyse WAGUE"}
                  </Button>
                </div>
              </div>

              {/* Sub-view tabs */}
              <div className="bg-white border border-slate-200 inline-flex p-0 h-auto">
                {[
                  { v: "course", label: "Course & Presse", Icon: Activity, testid: "fortune-tab-course" },
                  { v: "analyse", label: "Modules d'Analyse", Icon: Calculator, testid: "fortune-tab-analyse" },
                  { v: "tickets", label: "Tickets", Icon: Ticket, testid: "fortune-tab-tickets" },
                  { v: "money", label: "Money Mgmt", Icon: Wallet, testid: "fortune-tab-money" },
                ].map((t, i, arr) => {
                  const Icon = t.Icon;
                  return (
                    <button
                      key={t.v}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTab(t.v); }}
                      data-testid={t.testid}
                      className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors flex items-center",
                        i < arr.length - 1 && "border-r border-slate-200",
                        tab === t.v ? "bg-turf" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5 mr-1.5" /> {t.label}
                    </button>
                  );
                })}
              </div>

              {tab === "course" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    {loadingRace ? (
                      <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : (
                      <FortuneParticipantsTable horses={horses} setHorses={setHorses} />
                    )}
                  </div>
                  <div className="lg:col-span-1">
                    <FortunePressWidget />
                  </div>
                </div>
              )}

              {tab === "analyse" && (
                !groups ? (
                  <div className="border border-slate-200 bg-white p-12 text-center">
                    <div className="text-sm text-muted-foreground">
                      Lancez l'analyse depuis l'en-tête de la course pour générer les groupes CSPE / SETD / LTYPEB / CPTQ.
                    </div>
                  </div>
                ) : (
                  <FortuneGroupsGrid groups={groups} />
                )
              )}

              {tab === "tickets" && <FortuneTicketsPanel horses={horses} groups={groups} />}
              {tab === "money" && <FortuneMoneyManagement />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

