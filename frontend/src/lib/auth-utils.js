"use client";

// Hook utilitaire pour gérer un compte à rebours (en secondes)
import { useEffect, useRef, useState } from "react";

export const useCountdown = (initialSeconds = 0) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (seconds <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => (s <= 1 ? 0 : s - 1));
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [seconds]);

  const start = (s) => setSeconds(Math.max(0, Math.floor(s)));
  const stop = () => setSeconds(0);

  return { seconds, start, stop };
};

export const formatDuration = (s) => {
  if (s <= 0) return "";
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m${sec.toString().padStart(2, "0")}`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
};

// Parse l'erreur axios pour extraire le verrou rate limit
export const parseAuthError = (err) => {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  // detail peut être string ou object {error, retryAfter, scope, remaining}
  if (typeof detail === "object" && detail !== null) {
    return {
      status,
      message: detail.error || "Erreur",
      retryAfter: Number(detail.retryAfter || 0),
      remaining: detail.remaining != null ? Number(detail.remaining) : null,
      scope: detail.scope,
    };
  }
  return {
    status,
    message: detail || err?.message || "Erreur",
    retryAfter: 0,
    remaining: null,
  };
};

