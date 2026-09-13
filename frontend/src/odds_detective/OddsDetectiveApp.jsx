"use client";

/**
 * OddsDetectiveApp — racine de l'app intégrée Odds Detective.
 *
 * Routes (sous-routes de TURFEX) :
 *   /odds-detective                  → Login (auth indépendante)
 *   /odds-detective/tendance         → Tendance du jour
 *   /odds-detective/tableau-de-bord  → Tableau de bord par réunion
 *   /odds-detective/programme        → Programme par course
 *   /odds-detective/analyse          → Analyse statistique
 *   /odds-detective/filtres          → Filtres et jeux
 *   /odds-detective/actualiser       → Resynchronisation manuelle
 *   /odds-detective/admin            → Administration (admin uniquement)
 *
 * Auth : token séparé en localStorage `cd_token`. Codes de démo : DETECTIVE2025,
 * JEANCLAUDE, DEMO. Admin par défaut : ADMIN2025 (seedé côté backend).
 */
import { Routes, Route, Navigate } from "react-router-dom";
import { OddsAuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Tendance from "./pages/Tendance";
import TableauDeBord from "./pages/TableauDeBord";
import Programme from "./pages/Programme";
import Analyse from "./pages/Analyse";
import Filtres from "./pages/Filtres";
import Actualiser from "./pages/Actualiser";
import Admin from "./pages/Admin";


export default function OddsDetectiveApp() {
  return (
    <div className="odds-root">
      <OddsAuthProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/tendance" element={<Tendance />} />
            <Route path="/tableau-de-bord" element={<TableauDeBord />} />
            <Route path="/programme" element={<Programme />} />
            <Route path="/analyse" element={<Analyse />} />
            <Route path="/filtres" element={<Filtres />} />
            <Route path="/actualiser" element={<Actualiser />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<Navigate to="/odds-detective" replace />} />
        </Routes>
      </OddsAuthProvider>
    </div>
  );
}

