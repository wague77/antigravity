import { Providers } from "./Providers";
import "@/index.css";
import "../App.css"; // if needed
import "@/components/turf_astro/turf-astro.css";
import "@/components/fortune/fortune.css";
import "@/odds_detective/odds.css";
export const metadata = {
  title: "TURFEX — INTELLIGENCE PMU",
  description: "Application de pronostics turf",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
