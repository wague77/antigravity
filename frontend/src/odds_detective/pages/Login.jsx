"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOddsAuth } from "../context/AuthContext";
import { toast } from "sonner";
import Logo from "../components/Logo";

const AUTH_BG = "https://images.unsplash.com/photo-1560093473-0b58a635ca36?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1Mjh8MHwxfHNlYXJjaHwxfHxob3JzZSUyMHJhY2luZyUyMHNpbGhvdWV0dGUlMjBuaWdodHxlbnwwfHx8fDE3NzgzOTQxOTZ8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useOddsAuth();
  const nav = useRouter();

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      await login(code.trim());
      toast.success("Connexion établie");
      nav("/odds-detective/tendance");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Code utilisateur invalide");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-[#0A0A0A] grain">
      <div className="relative hidden lg:block overflow-hidden">
        <img src={AUTH_BG} alt="Turf nuit" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/70 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-between p-10">
          <Logo size={44} variant="hero" />
          <div>
            <p className="font-mono text-xs text-[#00FF66] tracking-widest uppercase mb-3">// Logiciel d'analyse turf</p>
            <h1 className="font-display font-bold text-5xl xl:text-6xl tracking-tight leading-[1.05]">
              Décodez le terrain.<br/>
              <span className="text-[#00FF66]">Maîtrisez les odds.</span>
            </h1>
            <p className="text-neutral-400 mt-4 max-w-md">
              Tableau de bord temps réel, analyses heuristiques et méthodes Hyperbase / Tocard / Coup de poker — directement connecté à l'API WAGUE.
            </p>
          </div>
          <p className="font-mono text-[11px] text-neutral-500">© 2025 ODDS Détective Logiciel</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-md bg-[#121212] border border-[#262626] rounded-sm p-8 fade-in" data-testid="login-form">
          <p className="font-mono text-[11px] text-[#00FF66] tracking-widest uppercase mb-2">// Authentification</p>
          <h2 className="font-display font-bold text-3xl mb-1">Bienvenue</h2>
          <p className="text-neutral-400 text-sm mb-8">SVP entrez un code utilisateur valide.</p>

          <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-2 font-mono">Code utilisateur</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="DETECTIVE2025"
            data-testid="login-code-input"
            className="w-full bg-[#0A0A0A] border border-[#262626] rounded-sm px-4 py-3 font-mono text-base focus:outline-none focus:border-[#00FF66] focus:ring-1 focus:ring-[#00FF66] transition-colors"
            autoFocus
          />

          <button type="submit" disabled={busy} data-testid="login-submit-button"
            className="mt-6 w-full bg-[#00FF66] text-black font-display font-bold tracking-wider py-3 rounded-sm hover:bg-[#00e65a] transition-colors disabled:opacity-50">
            {busy ? "VÉRIFICATION..." : "OK"}
          </button>

          <div className="mt-8 pt-6 border-t border-[#262626]">
            <p className="text-[11px] text-neutral-500 font-mono">
              Accès restreint — code utilisateur valide requis. Contactez l'administrateur si besoin.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

