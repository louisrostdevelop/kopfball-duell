// Mehrsprachigkeit: beide Sprachen vollständig, keine fest eingebauten Texte in Code und HTML
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "acorn";
import { ancestor } from "acorn-walk";
import { scan } from "../../tools/i18n-scan.mjs";
const I = await import("../../js/content/i18n.js");
const C = await import("../../js/content/config.js");
const { LAYOUTS } = await import("../../js/content/layouts.js");
const ROOT = new URL("../../", import.meta.url).pathname;
const files = dir => readdirSync(join(ROOT, dir)).flatMap(f => { const p = join(dir, f); return statSync(join(ROOT, p)).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : []; });
const de = I.LANGS.de, en = I.LANGS.en;
const ph = v => (typeof v === "string" ? [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",") : "fn");

test("Deutsch und Englisch haben dieselben Schlüssel, keine leeren Texte, gleiche Platzhalter", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const [k, v] of Object.entries(de)) {
    assert.ok(typeof v === "function" || v.trim(), "leer: " + k);
    assert.equal(ph(en[k]), ph(v), "Platzhalter verschieden: " + k);
    if (typeof v === "function") assert.equal(typeof en[k], "function", k);
  }
});

test("jeder benutzte Schlüssel existiert", () => {
  const missing = [];
  for (const f of [...files("js"), "sw.js"].filter(x => !x.includes("i18n/"))) {
    const ast = parse(readFileSync(join(ROOT, f), "utf8"), { ecmaVersion: 2023, sourceType: f === "sw.js" ? "script" : "module" });
    ancestor(ast, { CallExpression(n) {
      if (!["t", "tx", "trn", "tr"].includes(n.callee.name)) return;
      const a = n.arguments[0];
      if (a && a.type === "Literal" && typeof a.value === "string" && !(a.value in de)) missing.push(`${f}: ${a.value}`);
    } });
  }
  assert.deepEqual(missing, []);
});

test("keine fest eingebauten Texte in js/ui, js/app, js/core (sonst t(\"schlüssel\") benutzen)", () => {
  const found = files("js").filter(f => /^js\/(ui|app|core)\//.test(f)).flatMap(f => scan(join(ROOT, f)).map(s => `${f}:${s.line} ${JSON.stringify(s.text).slice(0, 80)}`));
  assert.deepEqual(found, []);
});

test("index.html: alle sichtbaren Texte und Beschriftungen laufen über data-i18n", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const body = html.slice(html.indexOf("<main"), html.indexOf("<script type=\"module\""));
  // Text zwischen Tags: das öffnende Tag davor muss data-i18n tragen (oder Text ist kein Wort, z. B. Tasten, Zahlen)
  const bad = [];
  for (const m of body.matchAll(/(<[^<>]*>)([^<>]*[A-Za-zÄÖÜäöüß]{2,}[^<>]*)</g)) {
    const [, tag, text] = m;
    if (/data-i18n="[^"]+"/.test(tag) || /^\s*(Enter|Head|stars)\s*$/.test(text) || tag.startsWith("<kbd")) continue;
    bad.push(text.trim());
  }
  for (const m of body.matchAll(/<[a-zA-Z][^<>]*\b(placeholder|aria-label|title|alt)="([^"]*[a-zäöüß]{2,}[^"]*)"[^<>]*>/g)) {
    if (!new RegExp(`data-i18n-attr="[^"]*\\b${m[1]}:`).test(m[0])) bad.push(`${m[1]}="${m[2]}"`);
  }
  assert.deepEqual(bad, []);
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g), ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(m => m[1].split(";").map(p => [0, p.split(":")[1]]))].map(m => m[1]);
  assert.deepEqual(keys.filter(k => !(k in de)), []);
});

test("Spielinhalte sind in beiden Sprachen übersetzt", () => {
  for (const l of ["de", "en"]) {
    I.setLang(l);
    const texts = [...C.MODES.flatMap(m => [m.name, m.desc, ...m.tags]), ...C.ARENAS.flatMap(a => [a.name, a.desc]), ...C.BALLS.map(b => b.name),
      ...Object.values(C.SUPERS).flatMap(s => [s.name, s.desc]), ...C.ACHIEVEMENTS.flatMap(a => [a.name, a.desc]), ...C.DIFFS.map(d => d.name),
      ...C.RULE_OPTS.flatMap(r => [r.name, ...r.opts.map(o => o[1])]), ...C.RULE_PRESETS.flatMap(p => [p.name, p.desc]), ...Object.values(C.RARITY),
      ...Object.values(LAYOUTS).flat().flatMap(x => [x.name, x.desc]), ...Object.values(C.POWERUPS).map(p => p.name), ...C.MODS.map(m => m.name)];
    const keyLike = texts.filter(x => typeof x !== "string" || /^[a-z]+\.[\w.]+$/.test(x));
    assert.deepEqual(keyLike, [], l + ": fehlende Übersetzungen");
  }
  I.setLang("en"); assert.equal(C.MODES.find(m => m.id === "quick").name, "Quick Match");
  I.setLang("de"); assert.equal(C.MODES.find(m => m.id === "quick").name, "Schnelles Spiel");
});

test("Sprache vom Gerät: Deutsch für de-*, sonst Englisch", () => {
  assert.equal(I.detectLang(["de-AT"]), "de"); assert.equal(I.detectLang(["fr-FR", "en-GB"]), "en"); assert.equal(I.detectLang(["ja"]), "en");
});
