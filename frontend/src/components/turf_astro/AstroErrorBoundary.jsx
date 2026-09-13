"use client";

/**
 * Boundary d'erreur dédiée à Turf Astro — si un composant interne lève une
 * exception (ex: PMU API renvoie une donnée inattendue dans un browser locale
 * spécifique), on affiche un message lisible au lieu d'une page blanche.
 */
import { Component } from "react";
import { AlertTriangle } from "lucide-react";

export default class AstroErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Erreur inconnue" };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[TurfAstro] crash:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 m-4 text-center" data-testid="astro-error-boundary">
          <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto mb-2" />
          <div className="font-display text-lg font-bold text-amber-900">Turf Astro · erreur d'affichage</div>
          <div className="text-sm text-amber-800 mt-1">{this.state.message}</div>
          <button
            type="button"
            onClick={this.reset}
            className="mt-4 px-4 py-2 bg-emerald-900 text-amber-50 rounded-md font-bold text-sm hover:bg-emerald-800"
          >
            Recharger le panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

