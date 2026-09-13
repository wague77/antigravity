"use client";

import { useState } from "react";
import { Settings as SettingsIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettings } from "@/contexts/SettingsContext";

export const SettingsPanel = () => {
  const { settings, update, reset } = useSettings();
  const [open, setOpen] = useState(false);

  const setCoef = (idx, val) => {
    const next = [...settings.coefs];
    next[idx] = Number(val) || 0;
    update({ coefs: next });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="bg-white border-2 border-black hover:bg-yellow-200"
          title="Paramètres"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-white border-2 border-black" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base">Paramètres CAF</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="h-7 px-2 text-xs"
              title="Réinitialiser"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide">
              Coefficients (course 1 / 2 / 3)
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Input
                  key={i}
                  type="number"
                  step="0.5"
                  value={settings.coefs[i]}
                  onChange={(e) => setCoef(i, e.target.value)}
                  className="text-center font-bold"
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide">Diviseur</Label>
            <Input
              type="number"
              value={settings.divisor}
              onChange={(e) => update({ divisor: Number(e.target.value) || 1 })}
              className="text-center font-bold"
            />
            <p className="text-[10px] text-muted-foreground">
              CAF = (Σ Total) / diviseur. Par défaut : 6 (= 3+2+1).
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <Label className="text-xs font-bold">Mode sombre</Label>
            <Switch
              checked={settings.darkMode}
              onCheckedChange={(v) => update({ darkMode: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold">Cotes PMU</Label>
            <Switch
              checked={settings.showCote}
              onCheckedChange={(v) => update({ showCote: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold">Surligner Top 5 (Quinté+)</Label>
            <Switch
              checked={settings.highlightTop5}
              onCheckedChange={(v) => update({ highlightTop5: v })}
            />
          </div>

          <div className="space-y-1 border-t pt-3">
            <Label className="text-xs font-bold uppercase tracking-wide">
              💰 Bankroll (en €)
            </Label>
            <Input
              type="number"
              min="0"
              value={settings.bankroll}
              onChange={(e) => update({ bankroll: Number(e.target.value) || 0 })}
              className="text-center font-bold"
            />
            <p className="text-[10px] text-muted-foreground">
              Sert au calcul de mise Kelly dans l'onglet Stratégie.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold">Fraction Kelly (prudence)</Label>
            <Input
              type="number"
              min="0.05"
              max="1"
              step="0.05"
              value={settings.kellyFraction}
              onChange={(e) => update({ kellyFraction: Number(e.target.value) || 0.25 })}
              className="text-center"
            />
            <p className="text-[10px] text-muted-foreground">
              0.25 = Kelly fractionnaire 1/4 (recommandé). 1 = Kelly complet (risqué).
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <Label className="text-xs font-bold">Auto-refresh arrivée</Label>
              <p className="text-[10px] text-muted-foreground">Vérifie toutes les N secondes</p>
            </div>
            <Switch
              checked={settings.autoRefresh}
              onCheckedChange={(v) => update({ autoRefresh: v })}
            />
          </div>
          {settings.autoRefresh && (
            <div className="space-y-1">
              <Label className="text-xs">Intervalle (secondes)</Label>
              <Input
                type="number"
                min="10"
                max="300"
                value={settings.refreshInterval}
                onChange={(e) => update({ refreshInterval: Number(e.target.value) || 30 })}
                className="text-center"
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

