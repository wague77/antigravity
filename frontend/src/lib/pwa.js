
// Helpers pour la PWA et les notifications locales

let swRegistration = null;
let _reloadTriggered = false;

export const registerServiceWorker = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    swRegistration = await navigator.serviceWorker.register("/service-worker.js");

    // Écoute les messages du SW (ex: nouvelle version active → reload auto)
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_UPDATED" && !_reloadTriggered) {
        _reloadTriggered = true;
        // Petit délai pour que les utilisateurs voient le toast éventuel
        // Ne reload qu'au prochain idle pour ne pas couper une action
        if (typeof window !== "undefined") {
          if ("requestIdleCallback" in window) {
            window.requestIdleCallback(() => window.location.reload(), { timeout: 2000 });
          } else {
            setTimeout(() => window.location.reload(), 1500);
          }
        }
      }
    });

    // Force le check du SW à chaque chargement de la page (détection rapide nouvelle version)
    swRegistration.update?.();

    // Vérifie périodiquement (toutes les 60s) s'il y a une nouvelle version
    setInterval(() => {
      swRegistration?.update?.();
    }, 60_000);

    // Si un SW est déjà en attente (waiting) → demande-lui de prendre le contrôle
    if (swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    swRegistration.addEventListener("updatefound", () => {
      const newSw = swRegistration.installing;
      if (!newSw) return;
      newSw.addEventListener("statechange", () => {
        if (newSw.state === "installed" && navigator.serviceWorker.controller) {
          // Une nouvelle version est prête → l'activer immédiatement
          newSw.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    return swRegistration;
  } catch (err) {
    console.warn("[TURFEX] SW registration failed", err);
    return null;
  }
};

export const requestNotificationPermission = async () => {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch (_) {
    return "denied";
  }
};

export const sendLocalNotification = async ({ title, body, tag, data }) => {
  if (typeof Notification === "undefined") return false;
  const perm = await requestNotificationPermission();
  if (perm !== "granted") return false;

  if (swRegistration && swRegistration.active) {
    swRegistration.active.postMessage({
      type: "SHOW_NOTIFICATION",
      payload: { title, body, tag, data },
    });
    return true;
  }
  // Fallback sans SW (Notification API directe)
  try {
    new Notification(title, { body, tag });
    return true;
  } catch (_) {
    return false;
  }
};

export const isInstallable = () => {
  return typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches === false;
};

export const isStandalone = () => {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true)
  );
};

export const detectPlatform = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unknown";
  const ua = (navigator.userAgent || "").toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  const isFirefox = /firefox/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome|chromium|edg/.test(ua);
  const isEdge = /edg\//.test(ua);
  const isChrome = /chrome|chromium/.test(ua) && !isEdge;
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  if (isFirefox) return "firefox-desktop";
  if (isSafari) return "safari-desktop";
  if (isEdge) return "edge-desktop";
  if (isChrome) return "chrome-desktop";
  return "desktop";
};

