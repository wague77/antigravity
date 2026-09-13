"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fortuneAddBankroll, fortuneGetBankroll, fortuneDelBankroll } from "./api";
import { toast } from "sonner";
import { Trash2, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function FortuneMoneyManagement() {
  const [entries, setEntries] = React.useState([]);
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [label, setLabel] = React.useState("");
  const [stake, setStake] = React.useState(0);
  const [payout, setPayout] = React.useState(0);

  const refresh = () => fortuneGetBankroll().then((d) => setEntries(d.entries || []));
  React.useEffect(() => { refresh(); }, []);

  const add = async () => {
    if (!label) { toast.error("Ajoutez un libellé"); return; }
    await fortuneAddBankroll({ date, label, stake: Number(stake), payout: Number(payout) });
    setLabel(""); setStake(0); setPayout(0);
    refresh();
    toast.success("Pari enregistré");
  };

  const remove = async (id) => {
    await fortuneDelBankroll(id);
    refresh();
  };

  let cum = 0;
  const chartData = entries.map((e) => {
    cum += (Number(e.payout) - Number(e.stake));
    return { date: e.date, label: e.label, balance: Number(cum.toFixed(2)) };
  });
  const totals = entries.reduce((a, e) => ({
    stake: a.stake + Number(e.stake),
    payout: a.payout + Number(e.payout),
  }), { stake: 0, payout: 0 });
  const profit = totals.payout - totals.stake;
  const roi = totals.stake > 0 ? (profit / totals.stake) * 100 : 0;
  const winRate = entries.length ? (entries.filter((e) => Number(e.payout) > Number(e.stake)).length / entries.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-ibm-sans uppercase tracking-[0.2em] text-muted-foreground">Mises totales</div>
          <div className="font-cabinet text-2xl font-extrabold mt-1">{totals.stake.toFixed(2)} €</div>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-ibm-sans uppercase tracking-[0.2em] text-muted-foreground">Gains totaux</div>
          <div className="font-cabinet text-2xl font-extrabold mt-1 text-turf">{totals.payout.toFixed(2)} €</div>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-ibm-sans uppercase tracking-[0.2em] text-muted-foreground">Profit · ROI</div>
          <div className={`font-cabinet text-2xl font-extrabold mt-1 ${profit >= 0 ? "text-turf" : "text-destructive"}`}>
            {profit >= 0 ? "+" : ""}{profit.toFixed(2)} € · {roi.toFixed(1)}%
          </div>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-ibm-sans uppercase tracking-[0.2em] text-muted-foreground">Taux de réussite</div>
          <div className="font-cabinet text-2xl font-extrabold mt-1">{winRate.toFixed(1)}%</div>
        </div>
      </div>

      <div className="border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-turf" />
          <span className="font-cabinet text-sm font-bold tracking-wide uppercase">Bankroll · Courbe cumulée</span>
        </div>
        <div className="p-4">
          {chartData.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground italic">Aucun pari enregistré pour l'instant.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 0, fontSize: 12 }} />
                <Line type="monotone" dataKey="balance" stroke="#0F4C3A" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="border border-slate-200 bg-white p-4">
        <div className="font-cabinet text-sm font-bold uppercase tracking-wide mb-3">Ajouter un pari</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 mt-1 font-ibm-mono" data-testid="fortune-bk-date" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Libellé</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Vincennes R1C3 T01" className="h-9 mt-1" data-testid="fortune-bk-label" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mise (€)</Label>
            <Input type="number" min="0" step="0.5" value={stake} onChange={(e) => setStake(e.target.value)} className="h-9 mt-1 font-ibm-mono" data-testid="fortune-bk-stake" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Gain (€)</Label>
            <Input type="number" min="0" step="0.5" value={payout} onChange={(e) => setPayout(e.target.value)} className="h-9 mt-1 font-ibm-mono" data-testid="fortune-bk-payout" />
          </div>
        </div>
        <Button onClick={add} className="mt-4 bg-turf hover:bg-turf-dark" data-testid="fortune-bk-add">Enregistrer</Button>
      </div>

      <div className="border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-200">
          <span className="font-cabinet text-sm font-bold tracking-wide uppercase">Historique</span>
        </div>
        <div className="scrollbar-x-visible">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Libellé</th>
                <th className="text-right px-3 py-2 font-ibm-mono">Mise</th>
                <th className="text-right px-3 py-2 font-ibm-mono">Gain</th>
                <th className="text-right px-3 py-2 font-ibm-mono">P/L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground italic">∅</td></tr>
              )}
              {entries.map((e) => {
                const pl = Number(e.payout) - Number(e.stake);
                return (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-ibm-mono text-xs">{e.date}</td>
                    <td className="px-3 py-2">{e.label}</td>
                    <td className="px-3 py-2 text-right font-ibm-mono">{Number(e.stake).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-ibm-mono">{Number(e.payout).toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-ibm-mono font-bold ${pl >= 0 ? "text-turf" : "text-destructive"}`}>
                      <span className="inline-flex items-center gap-1">
                        {pl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {pl >= 0 ? "+" : ""}{pl.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive" data-testid={`fortune-bk-del-${e.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

