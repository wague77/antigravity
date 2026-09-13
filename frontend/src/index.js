
import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Cache le fallback "navigateur trop ancien" dès que React commence à monter.
// Si React crashe avant ce point, le fallback reste visible (UX correcte).
const _fb = document.getElementById("turfex-legacy-fallback");
if (_fb) _fb.style.display = "none";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

