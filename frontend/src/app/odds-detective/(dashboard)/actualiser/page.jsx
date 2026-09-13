"use client";

import { useEffect, useState } from "react";
import { api, isoDate } from "@/odds_detective/lib/api";
import PageHeader from "@/odds_detective/components/PageHeader";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";

export default function Actualiser() {
  const [date, setDate] = useState(isoDate(new Date()));
  const [reunion, setReunion] = useState(1);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  const refresh = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/tableau-de-bord/${date}/R${reunion}`);
      setLast({ at: new Date().toLocaleTimeString("fr-FR"), n: data.courses?.length || 0, hippo: data.hippodrome });
      toast.success(`${data.courses?.length || 0} courses analysées · ${data.hippodrome}`);
    } catch (e) {
      toast.error("Échec de l'actualisation");
    } finally { setBusy(false); }
  };

  useEffect(() => { /* idle */ }, []);

  return (
    <div className="fade-in">
      <PageHeader overline="Actualiser" title="Synchronisation des données" />
      <div className="p-8 max-w-3xl">
        <div className="bg-[#121212] border border-[#262626] rounded-sm p-6">
          <p className="font-mono text-[11px] tracking-widest uppercase text-[#00FF66] mb-4">// Re-fetcher les courses</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="refresh-date"
                className="bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]"/>
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-widest text-neutral-500 uppercase mb-1">Réunion</label>
              <select value={reunion} onChange={(e) => setReunion(Number(e.target.value))} data-testid="refresh-reunion"
                className="bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => <option key={r} value={r}>{`R${r}`}</option>)}
              </select>
            </div>
            <button onClick={refresh} disabled={busy} data-testid="refresh-btn"
              className="bg-[#00FF66] text-black font-display font-bold tracking-wider px-5 py-2 rounded-sm hover:bg-[#00e65a] flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>}
              ACTUALISER
            </button>
          </div>
          {last && (
            <p className="mt-5 font-mono text-xs text-neutral-400">
              Dernière synchro à <span className="text-[#00FF66]">{last.at}</span> · {last.n} courses · {last.hippo}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

