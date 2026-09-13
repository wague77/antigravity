
// Utilitaire pour télécharger un fichier texte
export const downloadTextFile = (filename, content) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Génère le contenu texte pour un lot de codes fraîchement créés
// Format brut : un code par ligne, rien d'autre
export const buildBatchText = (codes) => {
  return codes.map((c) => c.code).join("\n") + "\n";
};

// Génère le contenu texte de TOUS les codes (export global)
// Format brut : un code par ligne
export const buildAllCodesText = (items) => {
  return items.map((it) => it.code).join("\n") + "\n";
};

const datestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
};

export const downloadBatch = (codes) => {
  const filename = `wague-codes_${codes.length}_${datestamp()}.txt`;
  downloadTextFile(filename, buildBatchText(codes));
};

export const downloadAllCodes = (items) => {
  const filename = `wague-codes_export-complet_${datestamp()}.txt`;
  downloadTextFile(filename, buildAllCodesText(items));
};

