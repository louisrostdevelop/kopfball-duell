// Schreibt die Liste der Dateien, die der Service Worker vorab speichert, in sw.js (node tools/sw-files.mjs).
// Der Test tests/sim/sw.test.mjs prüft, dass die Liste aktuell ist.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
export function coreFiles() {
  const js = walk(join(ROOT, "js")).filter(f => f.endsWith(".js"));
  const fonts = walk(join(ROOT, "fonts")).filter(f => f.endsWith(".woff2"));
  const rest = ["vendor/peerjs.min.js", "vendor/qrcode.js", "icons/icon-192.png", "icons/wordmark.webp", "manifest.webmanifest", "css/style.css", "index.html"].map(f => join(ROOT, f));
  return ["./", ...[...rest, ...js, ...fonts].map(f => relative(ROOT, f).split("\\").join("/")).sort()];
}
export function renderList(files) {
  const lines = []; let cur = "  ";
  for (const f of files.map(x => JSON.stringify(x))) { if (cur.length + f.length > 110) { lines.push(cur.trimEnd()); cur = "  "; } cur += f + ", "; }
  lines.push(cur.replace(/, $/, ""));
  return "const CORE = [\n" + lines.join("\n") + "\n];";
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = join(ROOT, "sw.js"), s = readFileSync(p, "utf8");
  writeFileSync(p, s.replace(/const CORE = \[[\s\S]*?\];/, renderList(coreFiles())));
  console.log("sw.js aktualisiert");
}
