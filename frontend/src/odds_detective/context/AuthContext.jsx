"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthCtx = createContext(null);

export const OddsAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("cd_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem("cd_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (code) => {
    const { data } = await api.post("/auth/login", { code });
    localStorage.setItem("cd_token", data.token);
    setUser({ username: data.username, expiration: data.expiration, is_admin: data.is_admin });
    return data;
  };

  const logout = () => {
    localStorage.removeItem("cd_token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useOddsAuth = () => useContext(AuthCtx);

