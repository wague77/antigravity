"use client";

/**
 * Layout OD pour les pages authentifiées.
 * Utilisé comme composant wrapper directement — le vrai layout Next.js
 * se trouve dans src/app/odds-detective/(dashboard)/layout.jsx.
 * Ce fichier est conservé pour la compatibilité si certains composants l'importent.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOddsAuth } from "@/odds_detective/context/AuthContext";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  const { user, loading } = useOddsAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/odds-detective");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <p className="font-mono text-[#00FF66] text-sm tracking-widest">CHARGEMENT...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[#0A0A0A] grain text-white">
      <Sidebar />
      <main className="flex-1 overflow-x-auto">{children}</main>
    </div>
  );
}
