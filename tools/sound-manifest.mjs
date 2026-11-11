// Schreibt audio/sfx/manifest.json aus den Dateien in audio/sfx (node tools/sound-manifest.mjs).
// Dateiname = Sound-Name, wie das Spiel ihn abspielt; Varianten mit _1, _2 … (kick_1.ogg, kick_2.ogg), jede als .ogg und .m4a.
// (Unterstrich, weil manche Namen selbst auf Ziffern enden: gfx-67)
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../audio/sfx/", import.meta.url));
/** { name: [Dateien ohne Endung] } und Warnungen (fehlt .ogg oder .m4a) */
export function buildManifest(list) {
  const base = new Map();
  for (const f of list) { const m = f.match(/^(.+)\.(ogg|m4a)$/); if (m) base.set(m[1], [...(base.get(m[1]) || []), m[2]]); }
  const out = {}, warn = [];
  for (const [b, exts] of [...base].sort(([p], [q]) => p.localeCompare(q))) {
    if (exts.length < 2) warn.push(`${b}: nur .${exts[0]}, es fehlt .${exts[0] === "ogg" ? "m4a" : "ogg"}`);
    const name = b.replace(/_\d+$/, "");
    (out[name] = out[name] || []).push(b);
  }
  return { manifest: out, warn };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { manifest, warn } = buildManifest(readdirSync(DIR));
  writeFileSync(DIR + "manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  warn.forEach(w => console.warn("Achtung: " + w));
  console.log(`manifest.json: ${Object.keys(manifest).length} Sounds`);
}
