
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import Historique from "./pages/Historique";
import Admin from "./pages/Admin";
import Stats from "./pages/Stats";
import Paris from "./pages/Paris";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import OddsDetectiveApp from "./odds_detective/OddsDetectiveApp";
import { PasswordGate } from "./components/PasswordGate";
import { PWAInstaller } from "./components/PWAInstaller";
import { SettingsProvider } from "./contexts/SettingsContext";
import "./App.css";

const Gated = ({ children }) => <PasswordGate>{children}</PasswordGate>;

const App = () => (
  <SettingsProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/odds-detective/*" element={<OddsDetectiveApp />} />
          <Route path="/" element={<Gated><Index /></Gated>} />
          <Route path="/historique" element={<Gated><Historique /></Gated>} />
          <Route path="/stats" element={<Gated><Stats /></Gated>} />
          <Route path="/paris" element={<Gated><Paris /></Gated>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <PWAInstaller />
      </BrowserRouter>
    </TooltipProvider>
  </SettingsProvider>
);

export default App;

