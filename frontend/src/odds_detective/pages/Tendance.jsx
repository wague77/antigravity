"use client";

import { useEffect, useState } from "react";
import { api, isoDate, formatHeure } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { Loader2, MapPin, Trophy, Search } from "lucide-react";
import { useRouter } from "next/navigation";

const disciplineColor = {
  PLAT: "text-[#00E5FF]",
  TROT_ATTELE: "text-[#FFD700]",
  TROT_MONTE: "text-[#FF8A00]",
  HAIES: "text-[#00FF66]",
  STEEPLE_CHASE: "text-[#FF3B30]",
};

export default function Tendance() {
  const [date, setDate] = useState(isoDate(new Date()));
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const nav = useRouter();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/tendance/${date}`);
      setRaces(data.races || []);
    } catch (e) { setRaces([]); } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  return (
    <div className="fade-in">
      <PageHeader overline="Tendance du jour" title="Programme courses">
        <div>
          <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="tendance-date"
            className="bg-[#121212] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]"/>
        </div>
        <button onClick={load} data-testid="tendance-search-btn"
          className="bg-[#00FF66] text-black font-display font-bold tracking-wider px-5 py-2 rounded-sm hover:bg-[#00e65a] flex items-center gap-2">
          <Search size={14} /> CHERCHER
        </button>
      </PageHeader>

      <div className="p-8">
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400 font-mono text-sm">
            <Loader2 className="animate-spin" size={16} /> Chargement des courses...
          </div>
        ) : races.length === 0 ? (
          <p className="text-neutral-500 font-mono text-sm">Aucune course disponible pour cette date.</p>
        ) : (
          <div className="bg-[#121212] border border-[#262626] rounded-sm overflow-hidden" data-testid="tendance-table">
            <table className="w-full text-sm">
              <thead className="bg-[#0A0A0A] border-b border-[#262626]">
                <tr className="text-[11px] uppercase tracking-widest text-neutral-400">
                  <th className="text-left px-3 py-2.5 font-medium">R/C</th>
                  <th className="text-left px-3 py-2.5 font-medium">Heure</th>
                  <th className="text-left px-3 py-2.5 font-medium">Hippodrome</th>
                  <th className="text-left px-3 py-2.5 font-medium">Course</th>
                  <th className="text-left px-3 py-2.5 font-medium">Discipline</th>
                  <th className="text-right px-3 py-2.5 font-medium">Dist.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Alloc.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Part.</th>
                  <th className="text-center px-3 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {races.map((r, i) => (
                  <tr key={i} onClick={() => nav(`/odds-detective/programme?date=${date}&r=${r.reunion}&c=${r.course}`)}
                    className="border-b border-[#1a1a1a] hover:bg-white/[0.03] cursor-pointer transition-colors even:bg-white/[0.015]"
                    data-testid={`tendance-row-${i}`}>
                    <td className="px-3 py-2 text-[#00FF66]">R{r.reunion}C{r.course}</td>
                    <td className="px-3 py-2">{formatHeure(r.heureDepart)}</td>
                    <td className="px-3 py-2 flex items-center gap-1.5"><MapPin size={11} className="text-neutral-500"/>{r.hippodrome}</td>
                    <td className="px-3 py-2 font-sans text-neutral-200 truncate max-w-xs">{r.libelle}</td>
                    <td className={`px-3 py-2 text-[11px] ${disciplineColor[r.discipline] || "text-neutral-300"}`}>{r.discipline}</td>
                    <td className="px-3 py-2 text-right text-neutral-300">{r.distance}m</td>
                    <td className="px-3 py-2 text-right text-neutral-300">{((r.montantPrix || 0) / 100).toLocaleString("fr-FR")}€</td>
                    <td className="px-3 py-2 text-right text-neutral-300">{r.nombrePartants}</td>
                    <td className="px-3 py-2 text-center">
                      {r.arriveeDefinitive
                        ? <span className="inline-flex items-center gap-1 text-[10px] text-[#FFD700] uppercase tracking-widest"><Trophy size={10}/>Terminée</span>
                        : <span className="text-[10px] text-[#00FF66] uppercase tracking-widest">À venir</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

