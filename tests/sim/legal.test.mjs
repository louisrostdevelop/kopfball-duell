// Rechtsseiten: aus tools/gen-legal.mjs erzeugt und aktuell (sonst: npm run legal), Fassungen je Sprache, Käufe passen zum Schalter
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const LEGAL_MOD = await import("../../tools/gen-legal.mjs");
const { legalPages, LEGAL } = LEGAL_MOD;

test("Rechtsseiten sind aktuell (npm run legal)", () => {
  for (const [f, html] of Object.entries(legalPages())) assert.equal(readFileSync(new URL("../../legal/" + f, import.meta.url), "utf8"), html, f + " veraltet: npm run legal");
});
test("Rechtsseiten: deutsch und englisch, Anbieter, Käufe nur mit Schalter", () => {
  const off = legalPages({ payments: false }), on = legalPages({ payments: true });
  for (const html of Object.values(off)) {
    assert.match(html, /data-l="de"/); assert.match(html, /data-l="en"/);
    assert.ok(html.includes(LEGAL.address[1]) || !html.includes("Anbieter"), "Anschrift");
    assert.doesNotMatch(html, /ec\.europa\.eu\/consumers\/odr/, "EU-Streitschlichtungsplattform gibt es nicht mehr");
  }
  assert.doesNotMatch(off["privacy.html"] + off["terms.html"], /Stripe/, "ohne Käufe kein Stripe");
  assert.match(on["privacy.html"], /Stripe/); assert.match(on["terms.html"], /Widerruf/);
  assert.match(legalPages({ L: { ...LEGAL, email: "" } })["imprint.html"], /class="ph"/, "fehlende E-Mail ist markiert");
  assert.doesNotMatch(legalPages({ L: { ...LEGAL, email: "support@example.org" } })["imprint.html"], /class="ph"/, "mit E-Mail keine Platzhalter mehr");
});

const sections = html => Object.fromEntries([...html.matchAll(/<section data-l="(\w+)" lang="\w+">([\s\S]*?)<\/section>/g)].map(m => [m[1], m[2]]));
test("Fassungen: Impressum de/en, Datenschutz und Nutzungsbedingungen de/en/es/uk mit denselben Abschnitten wie Deutsch", () => {
  const { LEGAL_LANGS } = LEGAL_MOD;
  for (const opts of [{ payments: false, captcha: false }, { payments: true, captcha: true }]) {
    for (const [f, html] of Object.entries(legalPages(opts))) {
      const s = sections(html), key = f.replace(".html", "");
      assert.deepEqual(Object.keys(s), LEGAL_LANGS[key], f);
      const shape = x => ["<h2>", "<li>", "<p>", '<p class="box">', "<b>", "<ul>", "mailto:"].map(t => x.split(t).length - 1);
      for (const l of LEGAL_LANGS[key]) {
        assert.deepEqual(shape(s[l]), shape(s.de), `${f} ${l}: Abschnitte wie Deutsch`);
        assert.doesNotMatch(s[l], /undefined/, `${f} ${l}`);
        // Übersetzungen nennen Deutsch als maßgeblich und verlinken die deutsche Fassung
        if (key !== "imprint") assert.equal(s[l].includes('<a href="?lang=de" lang="de">'), l !== "de", `${f} ${l}: Hinweis auf die deutsche Fassung`);
      }
    }
  }
});
test("Datenschutz: Hinweise für Chile, Kolumbien, Mexiko in jeder Sprache", () => {
  const s = sections(legalPages()["privacy.html"]);
  for (const [l, x] of Object.entries(s)) for (const k of ["21.719", "Agencia de Protección de Datos Personales", "1581", "Autorización", "Superintendencia de Industria y Comercio", "LFPDPPP", "ARCO", "Secretaría Anticorrupción y Buen Gobierno"]) assert.ok(x.toLowerCase().includes(k.toLowerCase()), `${l}: ${k}`);
});
test("Rechtsseiten wählen die Sprache: ?lang=, sonst Spielsprache, sonst Browser; ohne eigene Fassung Englisch", async () => {
  const vm = await import("node:vm");
  const pages = legalPages();
  const show = (f, { search = "", save = null, langs = ["en-US"] } = {}) => {
    const root = { setAttribute(k, v) { this[k] = v; } }, doc = { documentElement: root, title: "", addEventListener() {} };
    const js = pages[f].match(/<script>([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(js, { location: { search }, URLSearchParams, JSON, String, navigator: { languages: langs }, document: doc,
      localStorage: { getItem: () => (save ? JSON.stringify({ lang: save }) : null) } });
    assert.equal(root.lang, root["data-show"]);
    return [root.lang, doc.title];
  };
  assert.deepEqual(show("privacy.html", { search: "?lang=es" }), ["es", "Política de privacidad – Headstars"]);
  assert.equal(show("terms.html", { search: "?lang=uk", langs: ["de-DE"] })[0], "uk");
  assert.equal(show("privacy.html", { search: "?lang=pt", langs: ["de-DE"] })[0], "en", "Spielsprache ohne Fassung: Englisch");
  assert.equal(show("imprint.html", { search: "?lang=es" })[0], "en", "Impressum nur de/en");
  assert.equal(show("imprint.html", { search: "?lang=de" })[0], "de");
  assert.equal(show("terms.html", { save: "uk", langs: ["en-US"] })[0], "uk", "Spielsprache aus dem Spielstand");
  assert.equal(show("terms.html", { save: "ru", langs: ["de-DE"] })[0], "en");
  assert.equal(show("privacy.html", { save: "auto", langs: ["es-MX", "en"] })[0], "es", "Automatisch: Browser");
  assert.equal(show("privacy.html", { langs: ["fr-FR"] })[0], "en");
});
