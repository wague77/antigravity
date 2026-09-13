"use client";

import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FavoritesPanel({ favorites, onRemove, onJump }) {
  if (!favorites?.length) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 card-bevel p-5 text-sm text-stone-500" data-testid="astro-favorites-empty">
        Aucun favori. Cliquez sur ★ à côté d'un cheval pour l'ajouter.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 card-bevel p-5" data-testid="astro-favorites-panel">
      <div className="flex items-center gap-2 mb-3">
        <Star className="h-4 w-4 text-amber-500 fill-current" />
        <h3 className="font-display text-lg font-semibold">Mes favoris ({favorites.length})</h3>
      </div>
      <div className="gold-line mb-3" />
      <ul className="divide-y divide-stone-100">
        {favorites.map((f) => (
          <li key={f.id} className="py-2.5 flex items-center gap-3" data-testid={`astro-favorite-item-${f.id}`}>
            <button
              onClick={() => onJump(f)}
              className="flex-1 text-left hover:text-emerald-800 transition-colors"
            >
              <div className="font-display font-semibold text-stone-900">
                <span className="kbd text-xs text-stone-500 mr-2">#{f.numPmu}</span>
                {f.nom}
              </div>
              <div className="text-[11px] text-stone-500 uppercase tracking-wide">
                {f.date.slice(0,2)}/{f.date.slice(2,4)}/{f.date.slice(4,8)} · R{f.reunion} · C{f.course}
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(f.id)}
              data-testid={`astro-favorite-remove-${f.id}`}
              className="text-stone-400 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

