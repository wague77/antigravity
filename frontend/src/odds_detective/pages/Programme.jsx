"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, isoDate, formatGains } from "../lib/api";
import PageHeader from "../components/PageHeader";
import DateReunionPicker from "../components/DateReunionPicker";
import { Loader2, Trophy, Award, Medal } from "lucide-react";

const SEL_TAGS = [
  { key: "favori", label: "FAV", cls: "tag-favori" },
  { key: "base_fixe", label: "BFX", cls: "tag-base-fixe" },
  { key: "base_trend", label: "BTR", cls: "tag-base-fixe" },
  { key: "tocard", label: "TOC", cls: "tag-tocard" },
  { key: "coup_poker", label: "POK", cls: "tag-poker" },
  { key: "superbase", label: "SBA", cls: "tag-superbase" },
  { key: "hyperbase", label: "HBA", cls: "tag-hyperbase" },
];

export default function Programme() {
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get("date") || isoDate(new Date()));
  const [reunion, setReunion] = useState(Number(params.get("r")) || 1);
  const [course, setCourse] = useState(Number(params.get("c")) || 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/programme/${date}/R${reunion}/C${course}/participants`);
      setData(d);
    } catch (e) { setData(null); } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date, reunion, course]);

  const tagFor = (numPmu) => {
    const out = [];
    for (const t of SEL_TAGS) {
      if (data?.selections?.[t.key]?.numPmu === numPmu) out.push(t);
    }
    return out;
  };

  return (
    <div className="fade-in">
      <PageHeader overline="Programme par course" title={`R${reunion} · C${course}`}>
        <DateReunionPicker date={date} setDate={setDate} reunion={reunion} setReunion={setReunion} course={course} setCourse={setCourse} showCourse />
      </PageHeader>

      <div className="p-8">
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400 font-mono text-sm"><Loader2 className="animate-spin" size={16}/> Chargement...</div>
        ) : !data ? (
          <p className="text-neutral-500 font-mono text-sm">Aucune donnée. La course est peut-être introuvable.</p>
        ) : (
          <>
            {/* Bannière arrivée officielle */}
            {data.arriveeDefinitive && data.arrivee?.length > 0 && (
              <div className="mb-4 bg-gradient-to-r from-[#FFD700]/15 via-[#FFD700]/5 to-transparent border border-[#FFD700]/40 rounded-sm p-4" data-testid="arrivee-banner">
                <p className="font-mono text-[11px] tracking-widest uppercase text-[#FFD700] mb-2 flex items-center gap-2">
                  <Trophy size={13}/> // Arrivée officielle
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {data.arrivee.slice(0, 8).map((a) => {
                    const cls =
                      a.position === 1 ? "bg-[#FFD700] text-black font-bold" :
                      a.position === 2 ? "bg-[#C0C0C0]/90 text-black font-semibold" :
                      a.position === 3 ? "bg-[#CD7F32]/90 text-black font-semibold" :
                      "bg-[#262626] text-neutral-200";
                    return (
                      <div key={a.numPmu} className="flex items-center gap-1.5">
                        <span className={`${cls} font-mono text-xs px-2 py-1 rounded-sm`}>
                          {a.position}.
                        </span>
                        <span className="font-mono text-xs text-neutral-100">#{a.numPmu}</span>
                        <span className="text-xs text-neutral-300 truncate max-w-[120px]">{a.nom}</span>
                        {a.cote != null && (
                          <span className="text-[10px] text-[#FFD700] font-mono">{a.cote}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-[#121212] border border-[#262626] rounded-sm overflow-x-auto" data-testid="programme-table">
              <table className="w-full text-xs font-mono min-w-[1100px]">
                <thead className="bg-[#0A0A0A] border-b border-[#262626] sticky top-0">
                  <tr className="text-[10px] uppercase tracking-widest text-neutral-400">
                    <th className="text-left px-3 py-2">N</th>
                    <th className="text-left px-3 py-2">Cheval</th>
                    <th className="text-left px-3 py-2">Driver</th>
                    <th className="text-right px-3 py-2">Cote1</th>
                    <th className="text-right px-3 py-2">Cote2</th>
                    <th className="text-right px-3 py-2">Ratio</th>
                    <th className="text-right px-3 py-2">RangFav</th>
                    <th className="text-right px-3 py-2">CRV%</th>
                    <th className="text-right px-3 py-2">CRPL%</th>
                    <th className="text-right px-3 py-2">IFP</th>
                    <th className="text-right px-3 py-2">FV</th>
                    <th className="text-right px-3 py-2">Gains</th>
                    {data.arriveeDefinitive && <th className="text-center px-3 py-2 text-[#FFD700]">Arr.</th>}
                    <th className="text-left px-3 py-2">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {data.participants.map((p) => {
                    const tags = tagFor(p.numPmu);
                    const arr = p.ordreArrivee;
                    const rowCls =
                      arr === 1 ? "bg-[#FFD700]/10" :
                      arr === 2 ? "bg-[#C0C0C0]/[0.07]" :
                      arr === 3 ? "bg-[#CD7F32]/[0.07]" :
                      "even:bg-white/[0.02]";
                    return (
                      <tr key={p.numPmu} className={`border-b border-[#1a1a1a] ${rowCls}`} data-testid={`programme-row-${p.numPmu}`}>
                        <td className="px-3 py-1.5 text-[#00FF66] font-bold">{p.numPmu}</td>
                        <td className="px-3 py-1.5 text-neutral-100 max-w-[10rem] truncate flex items-center gap-1">
                          {arr === 1 && <Trophy size={11} className="text-[#FFD700] inline"/>}
                          {arr === 2 && <Medal size={11} className="text-[#C0C0C0] inline"/>}
                          {arr === 3 && <Award size={11} className="text-[#CD7F32] inline"/>}
                          {p.nom}
                        </td>
                        <td className="px-3 py-1.5 text-neutral-400 truncate max-w-[8rem]">{p.driver || "—"}</td>
                        <td className="px-3 py-1.5 text-right">{p.cote1 ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right text-[#FFD700]">{p.cote2 ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-right ${p.ratio && p.ratio < 1 ? "text-[#00FF66]" : p.ratio && p.ratio > 1 ? "text-[#FF3B30]" : "text-neutral-400"}`}>{p.ratio ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right">{p.rang_cote2 ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right">{p.crv}</td>
                        <td className="px-3 py-1.5 text-right">{p.crpl}</td>
                        <td className="px-3 py-1.5 text-right">{p.ifp}</td>
                        <td className="px-3 py-1.5 text-right">{p.fv}</td>
                        <td className="px-3 py-1.5 text-right">{formatGains(p.gains)}</td>
                        {data.arriveeDefinitive && (
                          <td className="px-3 py-1.5 text-center">
                            {arr ? (
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-sm font-bold text-[11px] ${
                                arr === 1 ? "bg-[#FFD700] text-black" :
                                arr === 2 ? "bg-[#C0C0C0] text-black" :
                                arr === 3 ? "bg-[#CD7F32] text-black" :
                                "bg-[#262626] text-neutral-300"
                              }`}>{arr}</span>
                            ) : <span className="text-neutral-600">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {tags.map((t) => (
                              <span key={t.key} className={`border ${t.cls} rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-widest`}>{t.label}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {SEL_TAGS.map((t) => {
                const sel = data.selections?.[t.key];
                if (!sel) return null;
                return (
                  <div key={t.key} className={`border ${t.cls} rounded-sm p-3`}>
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-80">{t.label} · {t.label === "FAV" ? "Favori" : t.label === "TOC" ? "Tocard" : t.label === "POK" ? "Coup de poker" : t.label === "SBA" ? "Superbase" : t.label === "HBA" ? "Hyperbase" : t.label === "BTR" ? "Base Trend" : "Base Fixe"}</p>
                    <p className="font-display font-bold text-sm mt-1">#{sel.numPmu} {sel.nom}</p>
                    <p className="font-mono text-[10px] text-neutral-400 mt-1">Cote {sel.cote2 ?? "—"} · CRV {sel.crv ?? 0}%</p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

