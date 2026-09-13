
import { cn } from "@/lib/utils";

const DESCRIPTIONS = {
  CSPE: "Couplé Synthèse Presse Élite",
  SETD: "Système Éliminatoire Turf-Dernière",
  LTYPEA: "Liste Type A — élite combinée",
  LTYPEB: "Liste Type B — focus LS",
  LGPW: "Liste Globale Press-Winners",
  PEFA: "PEFA — exclusifs presse",
  LSPW: "LSPW — Winners de LTYPEB",
  LSPW2: "Règle d'Or (1 WW + 1 NW)",
  TDNW: "TD NW — Non-Winners SETD",
  LSFA: "LSFA — Winners SETD",
  CPTQ: "CPTQ — Synthèse finale",
};

function Chip({ n, highlight }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-7 h-7 font-cabinet text-xs font-bold border",
      highlight ? "bg-gold border-gold" : "bg-white text-slate-800 border-slate-300"
    )}>
      {n}
    </span>
  );
}

export default function FortuneGroupsGrid({ groups }) {
  if (!groups) return null;
  const order = ["CPTQ", "CSPE", "SETD", "LTYPEA", "LTYPEB", "LGPW", "PEFA", "LSPW", "LSPW2", "TDNW", "LSFA"];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="fortune-groups-grid">
      {order.map((key) => {
        const list = groups[key] || [];
        const isCPTQ = key === "CPTQ";
        return (
          <div key={key} className={cn(
            "border bg-white p-4",
            isCPTQ ? "border-turf border-2 lg:col-span-3" : "border-slate-200"
          )} data-testid={`fortune-group-${key}`}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-cabinet text-base font-bold tracking-tight">
                {key}
                {isCPTQ && <span className="ml-2 text-[10px] font-ibm-mono uppercase text-turf">synthèse finale</span>}
              </div>
              <div className="text-[10px] font-ibm-sans uppercase tracking-wider text-muted-foreground">
                {DESCRIPTIONS[key]}
              </div>
            </div>
            {list.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">∅ vide</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {list.map((n, i) => <Chip key={`${key}-${n}-${i}`} n={n} highlight={isCPTQ && i < 3} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

