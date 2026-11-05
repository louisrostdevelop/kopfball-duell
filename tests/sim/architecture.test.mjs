// Schichten-Regeln: wer darf wen importieren? Verhindert, dass der Kern an Browser oder Server gebunden wird.
//   content/  Spielinhalte           -> nichts außer content/
//   core/     Spiellogik, KI, Regeln -> content/, core/
//   ports/    Schnittstellen         -> nichts
//   adapters/ Browser, Netz, Speicher-> nichts aus app/, ui/, core/ (eigenständig austauschbar)
//   app/, ui/ Ablauf und Oberfläche  -> alles außer adapters/ (Adapter nur über app/services.js)
//   main.js   setzt alles zusammen   -> alles
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const JS = fileURLToPath(new URL("../../js/", import.meta.url));
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : []; });
const layer = p => { const r = relative(JS, p).split("/"); return r.length === 1 ? r[0] : r[0]; };
const ALLOWED = {
  content: ["content"],
  core: ["content", "core"],
  ports: ["ports"],
  adapters: ["adapters", "ports"],
  app: ["content", "core", "app", "ui", "ports"],
  ui: ["content", "core", "app", "ui", "ports"],
  "main.js": null,
};

for (const file of walk(JS)) {
  const from = layer(file), allowed = ALLOWED[from];
  if (allowed === null) continue;
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const specs = [...src.matchAll(/(?:^|\n)\s*import[^"'\n]*["'](\.[^"']+)["']/g)].map(m => m[1]);
  test(`${relative(JS, file)} hält sich an die Schichten`, () => {
    for (const s of specs) {
      const to = layer(normalize(join(dirname(file), s)));
      assert.ok(allowed.includes(to), `${relative(JS, file)} darf ${s} (${to}) nicht importieren`);
    }
  });
}
