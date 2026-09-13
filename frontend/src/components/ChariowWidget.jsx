"use client";

import { useEffect, useRef } from "react";

const CSS_HREF = "https://js.chariowcdn.com/v1/widget.min.css";
const SCRIPT_SRC = "https://js.chariowcdn.com/v1/widget.min.js";

/**
 * Composant React enveloppant le widget de paiement Chariow.
 * Recharge le script à chaque montage pour forcer la (ré)-initialisation
 * du widget — utile lorsqu'il est rendu dans un dialog modal qui apparaît
 * après le chargement initial de la page.
 */
export const ChariowWidget = ({
  productId = "prd_dh34ze",
  storeDomain = "ygsftwvy.mychariow.shop",
  style = "tap",
  borderStyle = "rounded",
  ctaWidth = "xs",
  backgroundColor = "#FFFFFF",
  ctaAnimation = "none",
  locale = "fr",
  primaryColor = "#ffcc00",
  className = "",
}) => {
  const containerRef = useRef(null);

  useEffect(() => {
    // 1) CSS (une seule fois)
    if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }

    // 2) Tente d'utiliser l'API globale si disponible
    const tryInit = () => {
      const w = window;
      if (w.Chariow) {
        try {
          if (typeof w.Chariow.init === "function") return w.Chariow.init();
          if (typeof w.Chariow.render === "function") return w.Chariow.render();
          if (typeof w.Chariow.refresh === "function") return w.Chariow.refresh();
        } catch (_) {}
      }
      return false;
    };

    // 3) Si déjà initialisé (script déjà chargé), force la ré-injection du script
    //    pour que le widget Chariow rescanne le DOM et trouve notre nouveau div.
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      // Retire l'ancien et ré-ajoute pour relancer le bootstrap
      existing.parentNode?.removeChild(existing);
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      // petit délai pour laisser le widget faire son scan
      setTimeout(tryInit, 50);
    };
    document.head.appendChild(script);

    return () => {
      // Pas de teardown agressif : on laisse le script en place pour les
      // prochaines utilisations.
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="chariow-widget"
      data-product-id={productId}
      data-store-domain={storeDomain}
      data-style={style}
      data-border-style={borderStyle}
      data-cta-width={ctaWidth}
      data-background-color={backgroundColor}
      data-cta-animation={ctaAnimation}
      data-locale={locale}
      data-primary-color={primaryColor}
      className={className}
    />
  );
};

