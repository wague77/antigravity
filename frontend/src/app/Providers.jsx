"use client";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { PasswordGate } from "@/components/PasswordGate";
import { PWAInstaller } from "@/components/PWAInstaller";
import { usePathname } from "next/navigation";

export function Providers({ children }) {
  const pathname = usePathname();
  const isOddsDetective = pathname?.startsWith("/odds-detective");
  const isPaymentSuccess = pathname === "/payment-success";
  const isAdmin = pathname === "/admin";

  // Ces routes n'ont pas besoin du PasswordGate global
  const requiresGated = !isOddsDetective && !isPaymentSuccess && !isAdmin;

  return (
    <SettingsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {requiresGated ? <PasswordGate>{children}</PasswordGate> : children}
        <PWAInstaller />
      </TooltipProvider>
    </SettingsProvider>
  );
}
