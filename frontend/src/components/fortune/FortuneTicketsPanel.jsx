"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fortuneGenTierce, fortuneGenCouple } from "./api";
import { toast } from "sonner";
import { Ticket, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const TICKET_TYPES = [
  { v: "T01", label: "T01 · 1 base + 2 associés (3 combos)" },
  { v: "T02", label: "T02 · 1 base + 3 associés (6 combos)" },
  { v: "T03", label: "T03 · 2 bases + 1 associé" },
  { v: "T04", label: "T04 · 1 base + variable (full pool)" },
  { v: "T05", label: "T05 · Champ réduit" },
  { v: "T06", label: "T06 · Combinatoire totale" },
];

function HorseSelector({ label, horses, value, onChange, testId }) {
  const toggle = (n) => {
    onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  };
  return (
    <div>
      <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid={testId}>
        {horses.map((h) => {
          const sel = value.includes(h.numPmu);
          return (
            <button
              key={h.numPmu}
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(h.numPmu); }}
              className={cn(
                "w-9 h-9 border font-cabinet text-sm font-bold transition-colors",
                sel ? "bg-turf border-turf" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              )}
              data-testid={`${testId}-h${h.numPmu}`}
            >
              {h.numPmu}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FortuneTicketsPanel({ horses, groups }) {
  const [tab, setTab] = React.useState("tierce");
  const [bases, setBases] = React.useState([]);
  const [assoc, setAssoc] = React.useState([]);
  const [ttype, setTType] = React.useState("T01");
  const [stake, setStake] = React.useState(1);
  const [tResult, setTResult] = React.useState(null);
  const [groupA, setGroupA] = React.useState([]);
  const [groupB, setGroupB] = React.useState([]);
  const [ordered, setOrdered] = React.useState(false);
  const [cStake, setCStake] = React.useState(1);
  const [cResult, setCResult] = React.useState(null);

  const prefillFromCPTQ = () => {
    const cptq = groups?.CPTQ || [];
    setBases(cptq.slice(0, 1));
    setAssoc(cptq.slice(1, 4));
    toast.success("Pré-rempli depuis la synthèse CPTQ");
  };

  const prefillCouple = () => {
    const lgpw = groups?.LGPW || [];
    const pefa = groups?.PEFA || [];
    setGroupA(lgpw.length ? lgpw.slice(0, 3) : (groups?.CPTQ || []).slice(0, 2));
    setGroupB(pefa.length ? pefa.slice(0, 3) : (groups?.CPTQ || []).slice(2, 5));
    toast.success("Couplé pré-rempli (LGPW × PEFA)");
  };

  const buildT = async () => {
    if (!bases.length) { toast.error("Sélectionnez au moins 1 base"); return; }
    try {
      const res = await fortuneGenTierce({ bases, associated: assoc, ticket_type: ttype, stake_per_combo: stake });
      setTResult(res);
      toast.success(`${res.count} combinaisons générées`);
    } catch (e) {
      toast.error("Erreur génération ticket");
    }
  };

  const buildC = async () => {
    if (!groupA.length || !groupB.length) { toast.error("Remplissez les deux groupes"); return; }
    try {
      const res = await fortuneGenCouple({ group_a: groupA, group_b: groupB, ordered, stake_per_combo: cStake });
      setCResult(res);
      toast.success(`${res.count} couplés générés`);
    } catch (e) {
      toast.error("Erreur génération couplé");
    }
  };

  return (
    <div className="border border-slate-200 bg-white">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2">
        <Ticket className="w-4 h-4 text-turf" />
        <span className="font-cabinet text-sm font-bold tracking-wide uppercase">Générateur de tickets</span>
      </div>
      <div className="p-4">
        <div className="bg-slate-100 inline-flex p-0.5 mb-4">
          {[
            { v: "tierce", label: "Tiercé dans l'Ordre" },
            { v: "couple", label: "Couplé" },
          ].map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTab(t.v); }}
              data-testid={`fortune-tab-${t.v}`}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.v ? "bg-turf shadow-sm" : "text-slate-700 hover:bg-slate-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "tierce" && (
          <div className="space-y-4">
            <div className="flex justify-between items-end gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground max-w-md">
                Sélectionnez votre/vos base(s) et chevaux associés, puis le type de ticket.
              </div>
              <Button variant="outline" size="sm" onClick={prefillFromCPTQ} data-testid="fortune-btn-prefill-cptq">
                Pré-remplir depuis CPTQ
              </Button>
            </div>
            <HorseSelector label="Bases (1ère position prioritaire)" horses={horses} value={bases} onChange={setBases} testId="fortune-select-bases" />
            <HorseSelector label="Chevaux associés" horses={horses} value={assoc} onChange={setAssoc} testId="fortune-select-assoc" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Type de ticket</Label>
                <select
                  value={ttype}
                  onChange={(e) => setTType(e.target.value)}
                  className="h-9 mt-1.5 w-full border border-slate-300 bg-white px-2 text-sm"
                  data-testid="fortune-select-ticket-type"
                >
                  {TICKET_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Mise / combinaison (€)</Label>
                <Input type="number" min="0.5" step="0.5" value={stake}
                  onChange={(e) => setStake(parseFloat(e.target.value) || 1)}
                  className="h-9 mt-1.5 font-ibm-mono" data-testid="fortune-stake-input" />
              </div>
              <div className="flex items-end">
                <Button onClick={buildT} className="w-full bg-turf hover:bg-turf-dark h-9" data-testid="fortune-btn-build-tierce">
                  Générer le ticket
                </Button>
              </div>
            </div>

            {tResult && (
              <div className="ticket-paper border-2 border-dashed border-gold p-4" data-testid="fortune-tierce-result">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-cabinet text-lg font-extrabold uppercase">Ticket {tResult.ticket_type}</div>
                    <div className="text-[10px] font-ibm-mono uppercase tracking-[0.2em] text-muted-foreground">
                      Tiercé dans l'Ordre
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-cabinet text-2xl font-extrabold text-turf">{tResult.cost.toFixed(2)} €</div>
                    <div className="text-[10px] font-ibm-mono uppercase">{tResult.count} combinaisons</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-72 overflow-auto scrollbar-thin">
                  {tResult.combinations.map((combo, i) => (
                    <div key={i} className="bg-white border border-amber-300 px-2 py-1.5 font-ibm-mono text-xs flex justify-between">
                      <span className="text-muted-foreground">#{i + 1}</span>
                      <span className="font-bold">{combo.join(" - ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "couple" && (
          <div className="space-y-4">
            <div className="flex justify-between items-end gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground max-w-md">
                Croisez deux groupes pour générer des couplés (ex. LGPW × PEFA).
              </div>
              <Button variant="outline" size="sm" onClick={prefillCouple} data-testid="fortune-btn-prefill-couple">
                Pré-remplir LGPW × PEFA
              </Button>
            </div>
            <HorseSelector label="Groupe A" horses={horses} value={groupA} onChange={setGroupA} testId="fortune-select-groupa" />
            <HorseSelector label="Groupe B" horses={horses} value={groupB} onChange={setGroupB} testId="fortune-select-groupb" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Type</Label>
                <select
                  value={ordered ? "ordre" : "place"}
                  onChange={(e) => setOrdered(e.target.value === "ordre")}
                  className="h-9 mt-1.5 w-full border border-slate-300 bg-white px-2 text-sm"
                  data-testid="fortune-select-couple-type"
                >
                  <option value="place">Couplé Placé/Gagnant</option>
                  <option value="ordre">Couplé Ordre</option>
                </select>
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Mise / combinaison (€)</Label>
                <Input type="number" min="0.5" step="0.5" value={cStake}
                  onChange={(e) => setCStake(parseFloat(e.target.value) || 1)}
                  className="h-9 mt-1.5 font-ibm-mono" data-testid="fortune-couple-stake-input" />
              </div>
              <div className="flex items-end">
                <Button onClick={buildC} className="w-full bg-turf hover:bg-turf-dark h-9" data-testid="fortune-btn-build-couple">
                  Générer les couplés
                </Button>
              </div>
            </div>
            {cResult && (
              <div className="ticket-paper border-2 border-dashed border-gold p-4" data-testid="fortune-couple-result">
                <div className="flex items-center justify-between mb-3">
                  <Receipt className="w-5 h-5 text-turf" />
                  <div className="text-right">
                    <div className="font-cabinet text-2xl font-extrabold text-turf">{cResult.cost.toFixed(2)} €</div>
                    <div className="text-[10px] font-ibm-mono uppercase">{cResult.count} couplés</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-64 overflow-auto scrollbar-thin">
                  {cResult.combinations.map((combo, i) => (
                    <div key={i} className="bg-white border border-amber-300 px-2 py-1.5 font-ibm-mono text-xs text-center font-bold">
                      {combo.join(ordered ? " ▸ " : " - ")}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

