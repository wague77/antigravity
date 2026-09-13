"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Download, X, Smartphone, Monitor, Share, Plus, Apple, Chrome } from "lucide-react";
import { isStandalone, requestNotificationPermission, registerServiceWorker, detectPlatform } from "@/lib/pwa";
import { toast } from "sonner";

const DISMISS_KEY_INSTALL = "turfex.installDismissedAt";
const DISMISS_KEY_NOTIF = "turfex.notifDismissedAt";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function wasDismissedRecently(key) {
  try {
    const ts = Number(localStorage.getItem(key) || 0);
    return ts && Date.now() - ts < DISMISS_DURATION_MS;
  } catch (_) {
    return false;
  }
}

function dismissFor(key) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch (_) {}
}

/**
 * Bouton + modal d'installation PWA cross-platform.
 *
 * Comportement :
 *   - Sur Android Chrome / Edge / Desktop Chrome → bouton "Installer" qui déclenche
 *     le prompt natif (via beforeinstallprompt)
 *   - Sur iOS Safari / Firefox / autres → bouton qui ouvre une modal avec
 *     instructions pas-à-pas pour ajouter à l'écran d'accueil
 *   - Caché si l'app tourne déjà en mode standalone (déjà installée)
 *   - Le bouton flottant peut être masqué pour 7 jours via la croix
 */
export const PWAInstaller = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [floatingVisible, setFloatingVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState("unknown");

  useEffect(() => {
    registerServiceWorker();
    setPlatform(detectPlatform());

    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // bouton flottant visible si pas dismiss récent
      if (!wasDismissedRecently(DISMISS_KEY_INSTALL)) {
        setFloatingVisible(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setInstalled(true);
      setFloatingVisible(false);
      setModalOpen(false);
      toast.success("TURFEX installé sur ton appareil 🎉");
    };
    window.addEventListener("appinstalled", installedHandler);

    // Affiche le bouton flottant même sans beforeinstallprompt (iOS, Firefox)
    // après 4s, si pas dismiss récent
    const t = setTimeout(() => {
      if (!isStandalone() && !wasDismissedRecently(DISMISS_KEY_INSTALL)) {
        setFloatingVisible(true);
      }
    }, 4000);

    // Notifications prompt après 8s
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      const t2 = setTimeout(() => {
        if (!wasDismissedRecently(DISMISS_KEY_NOTIF)) setShowNotif(true);
      }, 8000);
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
        window.removeEventListener("beforeinstallprompt", handler);
        window.removeEventListener("appinstalled", installedHandler);
      };
    }
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    // Cas 1 : prompt natif disponible (Chrome/Edge desktop+Android)
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          toast.success("TURFEX installé 🎉");
          setInstalled(true);
        }
        setDeferredPrompt(null);
        setFloatingVisible(false);
      } catch (_) {
        setModalOpen(true);
      }
      return;
    }
    // Cas 2 : pas de prompt natif → ouvre la modal d'instructions
    setModalOpen(true);
  };

  const handleDismissFloating = () => {
    dismissFor(DISMISS_KEY_INSTALL);
    setFloatingVisible(false);
  };

  const handleEnableNotif = async () => {
    const perm = await requestNotificationPermission();
    if (perm === "granted") toast.success("Notifications activées");
    else toast.error("Notifications refusées");
    setShowNotif(false);
  };

  if (installed) return null;

  const showFloatBtn = floatingVisible || !!deferredPrompt;

  return (
    <>
      {showFloatBtn && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-black text-white border-2 border-yellow-400 rounded-lg shadow-2xl pl-1 pr-1 py-1"
          data-testid="pwa-install-floating"
        >
          <Button
            onClick={handleInstallClick}
            size="sm"
            className="bg-yellow-400 text-black hover:bg-yellow-500 font-bold border-0"
            data-testid="pwa-install-btn"
            title="Installer TURFEX comme une app"
          >
            <Download className="h-4 w-4 mr-1" />
            Installer l'app
          </Button>
          <button
            onClick={handleDismissFloating}
            className="text-white/60 hover:text-white px-2"
            aria-label="Masquer pour 7 jours"
            data-testid="pwa-install-dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showNotif && (
        <div
          className="fixed bottom-20 right-4 z-50 max-w-sm bg-gradient-to-r from-pink-500 to-violet-500 text-white border-2 border-black rounded-lg p-3 shadow-2xl"
          data-testid="pwa-notif-prompt"
        >
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-sm">Activer les notifications</div>
              <div className="text-xs opacity-90">Reçois les arrivées de courses & alertes coup sûr</div>
              <div className="mt-2 flex gap-2">
                <Button onClick={handleEnableNotif} size="sm" className="bg-white text-black hover:bg-yellow-100 font-bold h-7">
                  Activer
                </Button>
                <Button
                  onClick={() => {
                    dismissFor(DISMISS_KEY_NOTIF);
                    setShowNotif(false);
                  }}
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/10 h-7"
                >
                  Non merci
                </Button>
              </div>
            </div>
            <button
              onClick={() => {
                dismissFor(DISMISS_KEY_NOTIF);
                setShowNotif(false);
              }}
              className="text-white/70 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <PWAInstallModal platform={platform} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
};

/**
 * Modal avec instructions pas-à-pas selon la plateforme détectée.
 */
function PWAInstallModal({ platform, onClose }) {
  const guide = getPlatformGuide(platform);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="pwa-install-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-white border-2 border-black rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-pink-500 via-yellow-400 to-cyan-400 p-4 border-b-2 border-black flex items-center gap-3">
          {guide.icon}
          <div className="flex-1">
            <div className="font-bold text-black text-lg">Installer TURFEX</div>
            <div className="text-xs text-black/80">{guide.subtitle}</div>
          </div>
          <button
            onClick={onClose}
            className="text-black/60 hover:text-black"
            data-testid="pwa-modal-close"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-700">{guide.intro}</p>
          <ol className="space-y-3">
            {guide.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-black text-white font-bold text-sm flex items-center justify-center">
                  {idx + 1}
                </div>
                <div className="flex-1 text-sm text-gray-800 leading-relaxed">
                  {step}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 p-3 bg-yellow-50 border-2 border-yellow-300 rounded text-xs text-yellow-900">
            ✨ <b>Avantage installation</b> : icône sur ton écran d'accueil, plein écran sans barre de navigateur, accès offline aux dernières données et notifications push possibles.
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <Button
            onClick={onClose}
            size="sm"
            className="bg-black text-white hover:bg-gray-800 font-bold"
            data-testid="pwa-modal-ok"
          >
            Compris
          </Button>
        </div>
      </div>
    </div>
  );
}

function getPlatformGuide(platform) {
  switch (platform) {
    case "ios":
      return {
        icon: <Apple className="h-6 w-6 text-black" />,
        subtitle: "iPhone / iPad — Safari",
        intro: "iOS ne propose pas de bouton d'installation natif, mais l'app peut être ajoutée à l'écran d'accueil en 3 clics :",
        steps: [
          <>Touche le bouton <b>Partager</b> <Share className="inline h-4 w-4 mx-0.5" /> en bas de Safari (carré avec flèche vers le haut).</>,
          <>Fais défiler et touche <b>« Sur l'écran d'accueil »</b> <Plus className="inline h-4 w-4 mx-0.5 bg-gray-200 rounded" />.</>,
          <>Confirme en touchant <b>Ajouter</b> en haut à droite. L'icône TURFEX apparaît sur ton écran d'accueil.</>,
        ],
      };
    case "android":
      return {
        icon: <Smartphone className="h-6 w-6 text-black" />,
        subtitle: "Android — Chrome / Samsung Internet",
        intro: "Si le bouton « Installer » ne s'affiche pas automatiquement :",
        steps: [
          <>Ouvre le menu (les <b>3 points ⋮</b> en haut à droite du navigateur).</>,
          <>Touche <b>« Ajouter à l'écran d'accueil »</b> ou <b>« Installer l'application »</b>.</>,
          <>Confirme. TURFEX s'installe comme une app native, avec son icône.</>,
        ],
      };
    case "safari-desktop":
      return {
        icon: <Apple className="h-6 w-6 text-black" />,
        subtitle: "macOS — Safari",
        intro: "Sur Safari Mac, utilise la fonction « Ajouter au Dock » :",
        steps: [
          <>Dans la barre de menu Safari, clique sur <b>Fichier</b> → <b>« Ajouter au Dock »</b>.</>,
          <>(macOS Sonoma+) Confirme le nom et clique <b>Ajouter</b>.</>,
          <>L'icône TURFEX apparaît dans ton Dock — clique-la pour ouvrir l'app dans une fenêtre dédiée.</>,
        ],
      };
    case "firefox-desktop":
      return {
        icon: <Monitor className="h-6 w-6 text-black" />,
        subtitle: "Firefox Desktop",
        intro: "Firefox ne supporte pas l'installation PWA native sur desktop. Tu peux :",
        steps: [
          <>Créer un raccourci : ouvre le menu <b>≡</b> → <b>« Plus d'outils »</b> → <b>« Personnaliser… »</b>.</>,
          <>Ou utilise <b>Chrome / Edge / Brave</b> à la place — ils proposent un vrai bouton « Installer » dans la barre d'adresse.</>,
          <>Sur mobile Android, Firefox propose <b>≡ → « Installer »</b> (recommandé).</>,
        ],
      };
    case "chrome-desktop":
    case "edge-desktop":
    default:
      return {
        icon: <Chrome className="h-6 w-6 text-black" />,
        subtitle: "Chrome / Edge / Brave Desktop",
        intro: "Sur Chrome/Edge, l'installation se fait via la barre d'adresse :",
        steps: [
          <>Repère l'icône <Download className="inline h-4 w-4" /> ou <b>« Installer TURFEX »</b> dans la barre d'adresse (à droite, près de l'étoile favoris).</>,
          <>Clique-la et confirme avec <b>Installer</b>.</>,
          <>Pas de bouton ? Ouvre le menu <b>⋮</b> → <b>« Installer TURFEX… »</b>.</>,
        ],
      };
  }
}

export default PWAInstaller;

