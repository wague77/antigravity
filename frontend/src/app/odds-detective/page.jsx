"use client";

/**
 * Page de login Odds Detective — /odds-detective
 * Redirige vers /odds-detective/tendance si déjà authentifié.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OddsAuthProvider, useOddsAuth } from "@/odds_detective/context/AuthContext";
import { toast } from "sonner";

const AUTH_BG =
  "https://images.unsplash.com/photo-1560093473-0b58a635ca36?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1Mjh8MHwxfHNlYXJjaHwxfHxob3JzZSUyMHJhY2luZyUyMHNpbGhvdWV0dGUlMjBuaWdodHxlbnwwfHx8fDE3NzgzOTQxOTZ8MA&ixlib=rb-4.1.0&q=85";

function LoginForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { login, user, loading } = useOddsAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.replace("/odds-detective/tendance");
    }
  }, [user, loading, router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      await login(code.trim());
      toast.success("Connexion établie");
      router.push("/odds-detective/tendance");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Code utilisateur invalide");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-[#0A0A0A] grain">
      {/* Hero gauche */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src={AUTH_BG}
          alt="Turf nuit"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/70 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-between p-10">
          <div className="font-bold text-xl tracking-widest text-[#00FF66]">ODDS DÉTECTIVE</div>
          <div>
            <p className="font-mono text-xs text-[#00FF66] tracking-widest uppercase mb-3">
              // Logiciel d'analyse turf
            </p>
            <h1 className="font-bold text-5xl xl:text-6xl tracking-tight leading-[1.05]">
              Décodez le terrain.
              <br />
              <span className="text-[#00FF66]">Maîtrisez les odds.</span>
            </h1>
            <p className="text-neutral-400 mt-4 max-w-md">
              Tableau de bord temps réel, analyses heuristiques et méthodes Hyperbase / Tocard /
              Coup de poker — directement connecté à l'API WAGUE.
            </p>
          </div>
          <p className="font-mono text-[11px] text-neutral-500">© 2025 ODDS Détective Logiciel</p>
        </div>
      </div>

      {/* Formulaire droite */}
      <div className="flex flex-col items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center lg:text-left">
            <div className="font-bold text-2xl tracking-widest text-[#00FF66] mb-1 lg:hidden">
              ODDS DÉTECTIVE
            </div>
            <h2 className="text-2xl font-bold text-white">Accès sécurisé</h2>
            <p className="text-neutral-500 text-sm mt-1">Entrez votre code d'accès personnel</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
                Code d'accès
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-center tracking-[0.3em] text-lg placeholder:text-neutral-600 focus:outline-none focus:border-[#00FF66]/50 focus:bg-white/8 transition"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="w-full bg-[#00FF66] hover:bg-[#00dd55] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-colors font-mono tracking-widest text-sm"
            >
              {busy ? "CONNEXION..." : "ACCÉDER →"}
            </button>
          </form>

          <p className="text-center text-neutral-600 text-xs font-mono">
            Accès réservé aux utilisateurs autorisés
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OddsDetectiveLoginPage() {
  return (
    <OddsAuthProvider>
      <LoginForm />
    </OddsAuthProvider>
  );
}
