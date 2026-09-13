"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import PageHeader from "../components/PageHeader";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function Filtres() {
  const [filters, setFilters] = useState([]);
  const [name, setName] = useState("");
  const [method, setMethod] = useState("FAVORI");
  const [criteria, setCriteria] = useState("{}");

  const load = () => api.get("/filters").then((r) => setFilters(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    let parsed = {};
    try { parsed = criteria ? JSON.parse(criteria) : {}; } catch { toast.error("JSON invalide"); return; }
    if (!name.trim()) { toast.error("Nom requis"); return; }
    try {
      await api.post("/filters", { name, method, criteria: parsed });
      toast.success("Filtre enregistré");
      setName(""); setCriteria("{}");
      load();
    } catch (e) { toast.error("Erreur de sauvegarde"); }
  };

  const remove = async (id) => {
    await api.delete(`/filters/${id}`);
    load();
  };

  return (
    <div className="fade-in">
      <PageHeader overline="Filtres et jeux" title="Mes filtres sauvegardés" />
      <div className="p-8 grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 bg-[#121212] border border-[#262626] rounded-sm p-5">
          <p className="font-mono text-[11px] tracking-widest uppercase text-[#00FF66] mb-4">// Nouveau filtre</p>
          <div className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du filtre" data-testid="filtre-name"
              className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]"/>
            <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="filtre-method"
              className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#00FF66]">
              <option>FAVORI</option><option>BASEFIXE</option><option>TOCARD</option>
              <option>POKER</option><option>SUPERBASE</option><option>HYPERBASE</option>
              <option>TREND</option><option>SPECULATIF</option><option>TOUS</option>
            </select>
            <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={6}
              placeholder='{"cote_min": 2, "cote_max": 8}' data-testid="filtre-criteria"
              className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#00FF66]"/>
            <button onClick={create} data-testid="filtre-create"
              className="w-full bg-[#00FF66] text-black font-display font-bold tracking-wider px-4 py-2 rounded-sm hover:bg-[#00e65a] flex items-center justify-center gap-2">
              <Plus size={14}/> ENREGISTRER
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#121212] border border-[#262626] rounded-sm" data-testid="filtres-list">
          <div className="px-4 py-3 border-b border-[#262626]">
            <p className="font-mono text-[11px] tracking-widest uppercase text-[#00FF66]">// {filters.length} filtre(s) enregistré(s)</p>
          </div>
          {filters.length === 0 ? (
            <p className="p-5 text-neutral-500 font-mono text-sm">Aucun filtre. Créez votre premier filtre à gauche.</p>
          ) : (
            <table className="w-full text-sm font-mono">
              <thead className="bg-[#0A0A0A] border-b border-[#262626]">
                <tr className="text-[10px] uppercase tracking-widest text-neutral-400">
                  <th className="text-left px-3 py-2">Nom</th>
                  <th className="text-left px-3 py-2">Méthode</th>
                  <th className="text-left px-3 py-2">Critères</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filters.map((f) => (
                  <tr key={f.id} className="border-b border-[#1a1a1a] even:bg-white/[0.02]">
                    <td className="px-3 py-2 text-[#00FF66]">{f.name}</td>
                    <td className="px-3 py-2">{f.method}</td>
                    <td className="px-3 py-2 text-neutral-400 truncate max-w-md text-[11px]">{JSON.stringify(f.criteria)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remove(f.id)} className="text-[#FF3B30] hover:bg-[#FF3B30]/10 p-1 rounded-sm">
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

