"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, isoDate, formatHeure } from "@/odds_detective/lib/api";
import PageHeader from "@/odds_detective/components/PageHeader";
import DateReunionPicker from "@/odds_detective/components/DateReunionPicker";
import { Loader2 } from "lucide-react";

const SEL_TAGS = [
  { key: "favori", label: "Favori", cls: "tag-favori" },
  { key: "base_fixe", label: "Base Fixe", cls: "tag-base-fixe" },
  { key: "base_trend", label: "Base Trend", cls: "tag-base-fixe" },
  { key: "tocard", label: "Tocard", cls: "tag-tocard" },
  { key: "coup_poker", label: "Coup de poker", cls: "tag-poker" },
  { key: "superbase", label: "Superbase", cls: "tag-superbase" },
  { key: "hyperbase", label: "Hyperbase", cls: "tag-hyperbase" },
  { key: "speculatif", label: "Spéculatif", cls: "tag-poker" },
];

export default function TableauDeBord() {
  const params = useSearchParams();
  const [date, setDate] = useState(params.get("date") || isoDate(new Date()));
  const [reunion, setReunion] = useState(Number(params.get("r")) || 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/tableau-de-bord/${date}/R${reunion}`);
      setData(d);
    } catch (e) { setData(null); } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date, reunion]);

  return (
    <div className="fade-in">
      <PageHeader overline="Tableau de bord" title={data?.hippodrome || "Réunion"}>
        <DateReunionPicker date={date} setDate={setDate} reunion={reunion} setReunion={setReunion} />
      </PageHeader>

      <div className="p-8">
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400 font-mono text-sm">
            <Loader2 className="animate-spin" size={16}/> Analyse des courses...
          </div>
        ) : !data || data.courses.length === 0 ? (
          <p className="text-neutral-500 font-mono text-sm">Aucune donnée disponible.</p>
        ) : (
          <div className="grid xl:grid-cols-2 gap-5" data-testid="tableau-grid">
            {data.courses.map((c) => (
              <div key={c.course} className="bg-[#121212] border border-[#262626] rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-[#262626] flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] text-[#00FF66] tracking-widest">R{data.reunion}C{c.course} · {formatHeure(c.heureDepart)}</p>
                    <p className="font-display font-bold text-base mt-0.5">{c.libelle}</p>
                  </div>
                  <div className="text-right font-mono text-[11px] text-neutral-400">
                    <p>{c.discipline}</p>
                    <p>{c.distance}m</p>
                  </div>
                </div>

                <table className="w-full text-xs font-mono">
                  <thead className="bg-[#0A0A0A] border-b border-[#262626]">
                    <tr className="text-[10px] uppercase tracking-widest text-neutral-400">
                      <th className="text-left px-3 py-1.5">N</th>
                      <th className="text-left px-3 py-1.5">Cheval</th>
                      <th className="text-right px-3 py-1.5">Odds1</th>
                      <th className="text-right px-3 py-1.5">Odds2</th>
                      <th className="text-right px-3 py-1.5">Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.top.map((p) => (
                      <tr key={p.numPmu} className="border-b border-[#1a1a1a] even:bg-white/[0.02]">
                        <td className="px-3 py-1.5 text-[#00FF66] font-bold">{p.numPmu}</td>
                        <td className="px-3 py-1.5 text-neutral-100 truncate max-w-[10rem]">{p.nom}</td>
                        <td className="px-3 py-1.5 text-right">{p.cote1 ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right text-[#FFD700]">{p.cote2 ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-right ${p.ratio && p.ratio < 1 ? "text-[#00FF66]" : p.ratio && p.ratio > 1 ? "text-[#FF3B30]" : "text-neutral-400"}`}>
                          {p.ratio ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-3 bg-[#0A0A0A] border-t border-[#262626]">
                  {SEL_TAGS.map((t) => {
                    const sel = c.selections?.[t.key];
                    if (!sel) return null;
                    return (
                      <div key={t.key} className={`border ${t.cls} rounded-sm px-2 py-1.5`}>
                        <p className="font-mono text-[9px] uppercase tracking-widest opacity-80">{t.label}</p>
                        <p className="font-mono text-xs font-semibold truncate">#{sel.numPmu} {sel.nom}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

