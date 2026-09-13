"use client";

import { useState } from "react";
import { api, isoDate } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Loader2, Play, Save, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const METHODS = [
  { v: "FAVORI", label: "Favori" },
  { v: "BASEFIXE", label: "Base Fixe" },
  { v: "TOCARD", label: "Tocard" },
  { v: "POKER", label: "Coup de Poker" },
  { v: "SUPERBASE", label: "Superbase" },
  { v: "HYPERBASE", label: "Hyperbase" },
  { v: "TREND", label: "Base Trend" },
  { v: "SPECULATIF", label: "Spéculatif" },
  { v: "TOUS", label: "Tous filtres (custom)" },
];

const DISCIPLINES = ["PLAT", "TROT_ATTELE", "TROT_MONTE", "HAIES", "STEEPLE_CHASE", "CROSS_COUNTRY"];
const SEXES = ["MALES", "FEMELLES", "HONGRES"];
const CATEGORIES = [
  "GROUPE_I", "GROUPE_II", "GROUPE_III", "LISTED",
  "HANDICAP", "REUNION_PROFESSIONNELLE", "PROVINCE",
  "INTERNATIONALE", "AUTRE",
];

// Section pliable
function Section({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#262626] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
        data-testid={`section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      >
        <span className="font-mono text-[10px] tracking-widest uppercase text-[#00FF66] flex items-center gap-2">
          {open ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
          {title}
        </span>
        <span className="font-mono text-[9px] text-neutral-500">{count}</span>
      </button>
      {open && <div className="px-4 pb-4 grid grid-cols-2 gap-2">{children}</div>}
    </div>
  );
}

// Champ générique
function FilterField({ label, value, onChange, type = "number", step, options, placeholder, testId, span = 1 }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="block font-mono text-[10px] text-neutral-500 mb-1">{label}</label>
      {options ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          data-testid={testId}
          className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-[#00FF66]"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
              {typeof o === "string" ? o : o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          step={step}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-[#00FF66]"
        />
      )}
    </div>
  );
}

export default function Analyse() {
  const today = isoDate(new Date());
  const [method, setMethod] = useState("FAVORI");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [filters, setFilters] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [filterName, setFilterName] = useState("");

  const setF = (k) => (v) => setFilters((s) => {
    const next = { ...s };
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
    return next;
  });

  const reset = () => { setFilters({}); toast.success("Filtres réinitialisés"); };

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const { data } = await api.post(`/analyse`, { method, date_start: start, date_end: end, filters });
      setResult(data);
    } catch (e) {
      toast.error("Analyse impossible");
    } finally { setBusy(false); }
  };

  const saveAsFilter = async () => {
    if (!filterName.trim()) { toast.error("Nom requis"); return; }
    try {
      await api.post("/filters", { name: filterName, method, criteria: filters });
      toast.success(`Filtre "${filterName}" enregistré`);
      setFilterName("");
    } catch { toast.error("Erreur"); }
  };

  const filterCount = Object.keys(filters).filter((k) => filters[k] !== undefined && filters[k] !== "").length;

  return (
    <div className="fade-in">
      <PageHeader overline="Analyse statistique" title="Constructeur de méthode">
        <button onClick={run} disabled={busy} data-testid="run-analyse"
          className="bg-[#00FF66] text-black font-display font-bold tracking-wider px-5 py-2 rounded-sm hover:bg-[#00e65a] flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={14}/> : <Play size={14}/>} ANALYSER
        </button>
      </PageHeader>

      <div className="p-8 grid lg:grid-cols-3 gap-5">
        {/* Sidebar gauche : tous les filtres */}
        <div className="lg:col-span-1 bg-[#121212] border border-[#262626] rounded-sm">
          <div className="px-5 py-4 border-b border-[#262626]">
            <p className="font-mono text-[11px] tracking-widest uppercase text-[#00FF66]">// Constructeur</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Méthode</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="analyse-method"
                  className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]">
                  {METHODS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Du</label>
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="analyse-start"
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#00FF66]"/>
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Au</label>
                  <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="analyse-end"
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#00FF66]"/>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-neutral-500 uppercase tracking-widest">{filterCount} filtre(s) actif(s)</span>
                <button type="button" onClick={reset} className="text-[#FF3B30] hover:underline flex items-center gap-1" data-testid="reset-filters">
                  <Trash2 size={10}/> reset
                </button>
              </div>
            </div>
          </div>

          {/* Sections de filtres */}
          <Section title="CHEVAL — IDENTITÉ" count="6 critères" defaultOpen>
            <FilterField label="Sexe" options={SEXES} value={filters.sexe} onChange={setF("sexe")} testId="filter-sexe" span={2}/>
            <FilterField label="Âge min" value={filters.age_min} onChange={setF("age_min")} placeholder="ex 3" testId="filter-age-min"/>
            <FilterField label="Âge max" value={filters.age_max} onChange={setF("age_max")} placeholder="ex 8" testId="filter-age-max"/>
            <FilterField label="Œillères" options={[{value:"AVEC",label:"Avec œillères"},{value:"SANS",label:"Sans œillères"}]} value={filters.oeilleres} onChange={setF("oeilleres")} testId="filter-oeilleres" span={2}/>
            <FilterField label="N° pair/impair" options={[{value:"PAIR",label:"Pair"},{value:"IMPAIR",label:"Impair"}]} value={filters.parite} onChange={setF("parite")} testId="filter-parite"/>
            <FilterField label="N° catégorie" options={[{value:"PETIT",label:"Petit (1-5)"},{value:"MOYEN",label:"Moyen (6-10)"},{value:"GROS",label:"Gros (>10)"}]} value={filters.num_type} onChange={setF("num_type")} testId="filter-num-type"/>
          </Section>

          <Section title="COTES — RAPPORTS" count="7 critères">
            <FilterField label="Cote min" step="0.1" value={filters.cote_min} onChange={setF("cote_min")} testId="filter-cote-min"/>
            <FilterField label="Cote max" step="0.1" value={filters.cote_max} onChange={setF("cote_max")} testId="filter-cote-max"/>
            <FilterField label="Rang favori min" value={filters.rang_fav_min} onChange={setF("rang_fav_min")} placeholder="1" testId="filter-rang-min"/>
            <FilterField label="Rang favori max" value={filters.rang_fav_max} onChange={setF("rang_fav_max")} placeholder="3" testId="filter-rang-max"/>
            <FilterField label="Ratio min" step="0.05" value={filters.ratio_min} onChange={setF("ratio_min")} placeholder="0.8" testId="filter-ratio-min"/>
            <FilterField label="Ratio max" step="0.05" value={filters.ratio_max} onChange={setF("ratio_max")} placeholder="1.2" testId="filter-ratio-max"/>
            <FilterField label="Direction" options={[{value:"BAISSE",label:"En baisse"},{value:"HAUSSE",label:"En hausse"},{value:"STABLE",label:"Stable"}]} value={filters.ratio_dir} onChange={setF("ratio_dir")} testId="filter-ratio-dir" span={2}/>
          </Section>

          <Section title="PERFORMANCES" count="7 critères">
            <FilterField label="CRV min %" value={filters.crv_min} onChange={setF("crv_min")} placeholder="20" testId="filter-crv-min"/>
            <FilterField label="CRV max %" value={filters.crv_max} onChange={setF("crv_max")} testId="filter-crv-max"/>
            <FilterField label="CRPL min %" value={filters.crpl_min} onChange={setF("crpl_min")} placeholder="40" testId="filter-crpl-min"/>
            <FilterField label="Gains min (€)" value={filters.gains_min} onChange={setF("gains_min")} placeholder="50000" testId="filter-gains-min"/>
            <FilterField label="Nb courses min" value={filters.nbcourses_min} onChange={setF("nbcourses_min")} placeholder="5" testId="filter-nbcourses-min"/>
            <FilterField label="Nb victoires min" value={filters.nbvic_min} onChange={setF("nbvic_min")} placeholder="1" testId="filter-nbvic-min"/>
            <FilterField label="" value={undefined} onChange={() => {}} testId="placeholder" />
          </Section>

          <Section title="MUSIQUE — IFP / FV" count="2 critères">
            <FilterField label="IFP max" value={filters.ifp_max} onChange={setF("ifp_max")} placeholder="3" testId="filter-ifp-max"/>
            <FilterField label="FV max" step="0.1" value={filters.fv_max} onChange={setF("fv_max")} placeholder="4.5" testId="filter-fv-max"/>
          </Section>

          <Section title="POSITION CORDE" count="2 critères">
            <FilterField label="Corde min" value={filters.corde_min} onChange={setF("corde_min")} placeholder="1" testId="filter-corde-min"/>
            <FilterField label="Corde max" value={filters.corde_max} onChange={setF("corde_max")} placeholder="6" testId="filter-corde-max"/>
          </Section>

          <Section title="COURSE — CONTEXTE" count="8 critères">
            <FilterField label="Discipline" options={DISCIPLINES} value={filters.discipline} onChange={setF("discipline")} testId="filter-discipline" span={2}/>
            <FilterField label="Catégorie" options={CATEGORIES} value={filters.categorie} onChange={setF("categorie")} testId="filter-categorie" span={2}/>
            <FilterField label="Partants min" value={filters.partants_min} onChange={setF("partants_min")} placeholder="8" testId="filter-partants-min"/>
            <FilterField label="Partants max" value={filters.partants_max} onChange={setF("partants_max")} placeholder="20" testId="filter-partants-max"/>
            <FilterField label="Distance min (m)" value={filters.distance_min} onChange={setF("distance_min")} placeholder="1600" testId="filter-distance-min"/>
            <FilterField label="Distance max (m)" value={filters.distance_max} onChange={setF("distance_max")} placeholder="3200" testId="filter-distance-max"/>
            <FilterField label="Allocation min" value={filters.allocation_min} onChange={setF("allocation_min")} placeholder="2000000" testId="filter-allocation-min"/>
            <FilterField label="Allocation max" value={filters.allocation_max} onChange={setF("allocation_max")} testId="filter-allocation-max"/>
          </Section>

          <Section title="SAUVEGARDER" count="comme filtre">
            <input value={filterName} onChange={(e) => setFilterName(e.target.value)}
              placeholder="Nom du filtre" data-testid="save-filter-name"
              className="col-span-2 bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#FFD700]"/>
            <button onClick={saveAsFilter} data-testid="save-filter-btn"
              className="col-span-2 bg-[#FFD700] text-black font-display font-bold text-xs tracking-widest px-3 py-2 rounded-sm hover:bg-[#e6c200] flex items-center justify-center gap-2">
              <Save size={12}/> SAUVEGARDER
            </button>
          </Section>
        </div>

        {/* Résultat */}
        <div className="lg:col-span-2 bg-[#121212] border border-[#262626] rounded-sm p-5" data-testid="analyse-result">
          <p className="font-mono text-[11px] tracking-widest uppercase text-[#00FF66] mb-4">// Résultat</p>
          {!result ? (
            <p className="text-neutral-500 font-mono text-sm">Configurez la méthode et lancez l'analyse pour voir les résultats.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  ["Jeux", result.nbre_jeux],
                  ["Réussis", result.reussis],
                  ["% Réussite", `${result.pct_reussite}%`],
                  ["Solde", `${result.solde >= 0 ? "+" : ""}${result.solde}€`],
                ].map(([l, v]) => (
                  <div key={l} className="bg-[#0A0A0A] border border-[#262626] rounded-sm p-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">{l}</p>
                    <p className="font-display font-bold text-2xl mt-1">{v}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-[#0A0A0A] border-y border-[#262626]">
                    <tr className="text-[10px] uppercase tracking-widest text-neutral-400">
                      <th className="text-left px-3 py-2">R/C</th>
                      <th className="text-left px-3 py-2">Hippo.</th>
                      <th className="text-left px-3 py-2">Cheval</th>
                      <th className="text-right px-3 py-2">Cote</th>
                      <th className="text-right px-3 py-2">Place</th>
                      <th className="text-center px-3 py-2">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.games.map((g, i) => (
                      <tr key={i} className="border-b border-[#1a1a1a] even:bg-white/[0.02]">
                        <td className="px-3 py-1.5 text-[#00FF66]">R{g.reunion}C{g.course}</td>
                        <td className="px-3 py-1.5">{g.hippodrome}</td>
                        <td className="px-3 py-1.5 truncate max-w-[10rem]">#{g.num} {g.cheval}</td>
                        <td className="px-3 py-1.5 text-right">{g.cote ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right">{g.place ?? "—"}</td>
                        <td className="px-3 py-1.5 text-center">
                          {g.won ? <span className="text-[#00FF66] font-bold">✓</span> : <span className="text-[#FF3B30]">✗</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

