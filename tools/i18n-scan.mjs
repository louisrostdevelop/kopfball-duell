// Findet fest eingebaute Texte für die Oberfläche in JS-Dateien (String- und Template-Literale).
// Genutzt von tests/sim/i18n.test.mjs. Aufruf zum Nachsehen: node tools/i18n-scan.mjs js/ui/screens/shop.js
import { parse } from "acorn";
import { ancestor } from "acorn-walk";
import { readFileSync } from "node:fs";
export function isUiText(raw) {
  if (/^[a-z][\w]*(\.[\w{}]+)+$/.test(raw) || /^[a-z][\w.]*\.$/.test(raw)) return false;   // Schlüssel (shop.buy, "err.")
  if (/px |Lilita One|Nunito|Impact|sans-serif/.test(raw)) return false;            // Schriften
  // Text, den ein Mensch liest: nach Entfernen von HTML-Tags, Entities und Platzhaltern bleibt etwas mit
  // Großbuchstabe, Umlaut oder Satzzeichen nach einem Wort. Reine Kleinbuchstaben-Wörter (CSS-Klassen,
  // Schlüssel, Ereignisnamen) zählen nicht.
  const s = String(raw).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\{\}/g, " ").trim();
  if (!/[A-Za-zÄÖÜäöüß]{2}/.test(s)) return false;
  if (/^(Arrow|Key|Digit|Escape|Enter|Tab|Space|Backspace|Shift|Numpad|Lilita One|Nunito)/.test(s)) return false;
  if (/\d+px|rgba?\(|var\(--|#[0-9a-f]{3,6}\b|^\s*[a-z-]+\s*:/.test(s)) return false;   // CSS
  if (/^https?:|\.(js|png|svg|json|css)$/.test(s)) return false;
  if (/^[[.#][a-zA-Z]|^button|:not\(/.test(s)) return false;                     // CSS-Selektoren
  if (/^[A-Z_]+$/.test(s)) return false;                                           // KONSTANTEN
  if (/^[a-z][a-zA-Z0-9]*$/.test(s)) return false;                                 // camelCase-IDs
  return /[A-ZÄÖÜ]|[äöüß€]|[a-z][!?…:.]/.test(s);
}
export function scan(file) {
  const src = readFileSync(file, "utf8");
  // Zeilen mit dem Kommentar "i18n-ok" sind ausgenommen (Eigennamen, Entwickler-Fehlermeldungen)
  const okLines = new Set(src.split("\n").map((l, i) => (l.includes("i18n-ok") ? i + 1 : 0)).filter(Boolean));
  const ast = parse(src, { ecmaVersion: 2023, sourceType: "module", locations: true });
  const out = [];
  ancestor(ast, {
    Literal(n, anc) {
      if (typeof n.value !== "string" || !isUiText(n.value)) return;
      const p = anc[anc.length - 2];
      if (p && (p.type === "ImportDeclaration" || p.type === "ExportNamedDeclaration" || p.type === "ExportAllDeclaration")) return;
      if (p && p.type === "Property" && p.key === n) return;
      if (p && p.type === "CallExpression" && p.callee.name === "t") return;
      if (okLines.has(n.loc.start.line)) return;
      out.push({ line: n.loc.start.line, kind: "str", text: n.value, start: n.start, end: n.end });
    },
    TemplateLiteral(n) {
      const txt = n.quasis.map(q => q.value.cooked).join("{}");
      if (!isUiText(txt) || okLines.has(n.loc.start.line)) return;
      out.push({ line: n.loc.start.line, kind: "tpl", text: txt, start: n.start, end: n.end });
    },
  });
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) for (const f of process.argv.slice(2)) for (const s of scan(f)) console.log(`${f}:${s.line} ${s.kind} ${JSON.stringify(s.text).slice(0, 140)}`);
