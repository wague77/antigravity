"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShoppingCart } from "lucide-react";
import { ChariowWidget } from "@/components/ChariowWidget";
import { APP_NAME } from "@/lib/branding";

export const BuyAccessButton = ({ variant = "icon", className = "" }) => {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === "icon" ? (
      <Button
        variant="outline"
        size="icon"
        className={`bg-white border-2 border-black hover:bg-yellow-200 ${className}`}
        title="Acheter / Renouveler un accès — 30 €"
      >
        <ShoppingCart className="h-4 w-4" />
      </Button>
    ) : (
      <Button
        className={`bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-black font-bold ${className}`}
      >
        <ShoppingCart className="h-4 w-4 mr-1" />
        Acheter / Renouveler — 30 €
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md bg-white border-2 border-black">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-row-pink" />
            Acheter un accès {APP_NAME}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-sm">
            <div className="font-bold mb-1">🐎 Accès complet à {APP_NAME}</div>
            <ul className="text-xs space-y-0.5 text-muted-foreground list-disc pl-4">
              <li>Calculateur CAF (20 classes, 3 courses)</li>
              <li>Scraping automatique PMU avec arrivée et cotes</li>
              <li>Historique des pronostics & stats de réussite</li>
              <li>Export CSV / Mode sombre / Auto-refresh</li>
            </ul>
            <div className="mt-2 text-2xl font-extrabold text-foreground">
              30 € <span className="text-xs font-normal text-muted-foreground">paiement unique</span>
            </div>
          </div>
          <div className="flex justify-center pt-2">
            <ChariowWidget />
          </div>
          <p className="text-[10px] text-muted-foreground text-center italic">
            Paiement sécurisé via Chariow • Code envoyé instantanément après paiement
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Bannière à afficher si le code expire dans moins de N jours.
 */
export const RenewBanner = ({ expiresAt }) => {
  if (!expiresAt) return null;
  try {
    const exp = new Date(expiresAt);
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 3 || diffDays < 0) return null;

    const hoursLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    const display =
      hoursLeft > 24
        ? `${Math.floor(hoursLeft / 24)} jour(s)`
        : `${hoursLeft} heure(s)`;

    return (
      <div className="bg-gradient-to-r from-yellow-300 to-orange-300 border-2 border-black rounded p-3 mb-4 flex flex-wrap items-center gap-3">
        <ShoppingCart className="h-5 w-5 text-black shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-sm">
            ⏰ Votre accès expire dans {display}
          </div>
          <div className="text-xs text-black/80">
            Renouvelez maintenant pour 30 € afin de ne pas être interrompu
          </div>
        </div>
        <BuyAccessButton variant="full" />
      </div>
    );
  } catch (_) {
    return null;
  }
};

