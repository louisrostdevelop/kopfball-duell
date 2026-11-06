// Rechtsseiten: aus tools/gen-legal.mjs erzeugt und aktuell (sonst: npm run legal), beide Sprachen, Käufe passen zum Schalter
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { legalPages, LEGAL } = await import("../../tools/gen-legal.mjs");

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
