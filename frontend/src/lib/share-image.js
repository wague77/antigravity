
// Utilitaire d'export image PNG du pronostic via Canvas API native
// Pas de dépendance externe (html2canvas non nécessaire)

const colorFor = (grade) => {
  switch (grade) {
    case "A+": return "#10b981";
    case "A": return "#34d399";
    case "B": return "#3b82f6";
    case "C": return "#facc15";
    case "D": return "#f97316";
    case "E": return "#ef4444";
    default: return "#6b7280";
  }
};

export const buildShareImage = ({ appName, tagline, courseInfo, difficulty, weather, topHorses, recos, arrivee = [] }) => {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Fond noir
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  // Bande gradient en haut
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#ec4899");
  grad.addColorStop(0.25, "#facc15");
  grad.addColorStop(0.5, "#22c55e");
  grad.addColorStop(0.75, "#06b6d4");
  grad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 12);

  // Titre TURFEX
  ctx.textAlign = "center";
  ctx.fillStyle = "#ec4899";
  ctx.font = "900 110px Impact, 'Arial Black', sans-serif";
  ctx.fillText(appName, W / 2, 150);
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 26px Arial";
  ctx.fillText(tagline, W / 2, 185);

  // Course info
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  const maxCourseWidth = W - 80;
  const words = (courseInfo || "").split("•");
  let y = 240;
  for (const w of words.slice(0, 3)) {
    const txt = w.trim();
    if (!txt) continue;
    ctx.fillText(txt, W / 2, y);
    y += 38;
  }

  // Difficulté badge
  if (difficulty) {
    ctx.fillStyle = difficulty.level === "EASY" ? "#22c55e" : difficulty.level === "MEDIUM" ? "#facc15" : "#ef4444";
    const badgeW = 380;
    const badgeH = 80;
    const bx = (W - badgeW) / 2;
    const by = y + 10;
    ctx.fillRect(bx, by, badgeW, badgeH);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 20px Arial";
    ctx.fillText("INDICE DE DIFFICULTÉ", W / 2, by + 30);
    ctx.font = "900 46px Impact, sans-serif";
    ctx.fillText(difficulty.badge, W / 2, by + 72);
    y = by + badgeH + 30;
  }

  // Météo
  if (weather) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "20px Arial";
    const wText = `${weather.weatherIcon || ""} ${weather.weatherLabel || ""} • ${weather.tempMin?.toFixed(0) ?? "?"}°/${weather.tempMax?.toFixed(0) ?? "?"}° • Terrain ${weather.terrainEstime || "?"}`;
    ctx.fillText(wText, W / 2, y);
    y += 40;
  }

  // Top horses cards
  ctx.textAlign = "left";
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 32px Arial";
  ctx.fillText("🏆 TOP CHEVAUX", 60, y + 40);
  y += 80;

  const cardH = 110;
  const cardGap = 14;
  const maxHorses = Math.min(5, topHorses.length);
  for (let i = 0; i < maxHorses; i++) {
    const h = topHorses[i];
    // Fond carte
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(60, y, W - 120, cardH);
    // Border grade
    ctx.fillStyle = colorFor(h.grade);
    ctx.fillRect(60, y, 8, cardH);
    // N°
    ctx.fillStyle = "#facc15";
    ctx.font = "900 52px Impact, sans-serif";
    ctx.fillText(`${h.num}`, 90, y + 70);

    // Check arrivee
    const arrIdx = arrivee.indexOf(h.num);
    if (arrIdx >= 0) {
      const arrColors = ["#facc15", "#d1d5db", "#fb923c", "#86efac", "#93c5fd", "#c4b5fd", "#f9a8d4"];
      ctx.fillStyle = arrColors[arrIdx] || "#94a3b8";
      ctx.beginPath();
      ctx.arc(170, y + 30, 18, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${arrIdx + 1}`, 170, y + 37);
      ctx.textAlign = "left";
    }

    // Nom
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.fillText((h.nom || "").slice(0, 22), 200, y + 40);
    // Driver
    if (h.driver) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "18px Arial";
      ctx.fillText(`🏇 ${h.driver}`.slice(0, 34), 200, y + 70);
    }
    // Cat
    if (h.category) {
      ctx.fillStyle = "#64748b";
      ctx.font = "16px Arial";
      ctx.fillText(h.category, 200, y + 95);
    }
    // Grade badge
    ctx.fillStyle = colorFor(h.grade);
    ctx.fillRect(W - 180, y + 15, 100, 50);
    ctx.fillStyle = "#0a0a0a";
    ctx.font = "900 36px Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(h.grade, W - 130, y + 52);
    ctx.textAlign = "left";
    // Cote
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arial";
    ctx.fillText(`@${h.cote?.toFixed(1) ?? "?"}`, W - 180, y + 90);

    y += cardH + cardGap;
  }

  // Jeux suggérés
  if (recos) {
    y += 20;
    ctx.fillStyle = "#ec4899";
    ctx.font = "bold 28px Arial";
    ctx.fillText("🎯 JEUX CONSEILLÉS", 60, y);
    y += 40;
    ctx.fillStyle = "#ffffff";
    ctx.font = "22px Arial";
    if (recos.tierce?.length) {
      ctx.fillText(`Tiercé : ${recos.tierce.join(" - ")}`, 60, y);
      y += 32;
    }
    if (recos.quinte?.length) {
      ctx.fillText(`Quinté+ : ${recos.quinte.join(" - ")}`, 60, y);
      y += 32;
    }
    if (recos.coupSur) {
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 22px Arial";
      ctx.fillText(`👑 Coup sûr : N°${recos.coupSur}`, 60, y);
      y += 32;
    }
    if (recos.coupTente) {
      ctx.fillStyle = "#f97316";
      ctx.font = "bold 22px Arial";
      ctx.fillText(`⚡ Coup tenté : N°${recos.coupTente}`, 60, y);
      y += 32;
    }
  }

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#475569";
  ctx.font = "16px Arial";
  ctx.fillText(`Généré le ${new Date().toLocaleString("fr-FR")} • ${appName}`, W / 2, H - 30);

  return canvas;
};

export const downloadShareImage = (opts) => {
  const canvas = buildShareImage(opts);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `turfex_pronostic_${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
};

