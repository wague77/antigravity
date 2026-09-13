"use client";

/**
 * Layout du dashboard Odds Detective (route group).
 * Remplace l'ancien <Layout> basé sur react-router-dom.
 * Gère : loading, redirect si non connecté, sidebar + main.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OddsAuthProvider, useOddsAuth } from "@/odds_detective/context/AuthContext";
import Sidebar from "@/odds_detective/components/Sidebar";

function DashboardShell({ children }) {
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

  if (!user) return null; // redirect in progress

  return (
    <div className="flex min-h-screen bg-[#0A0A0A] grain text-white">
      <Sidebar />
      <main className="flex-1 overflow-x-auto">{children}</main>
    </div>
  );
}

export default function OddsDetectiveDashboardLayout({ children }) {
  return (
    <OddsAuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </OddsAuthProvider>
  );
}
