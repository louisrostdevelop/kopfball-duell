// Infoseiten für Suchmaschinen: aus tools/gen-seo.mjs erzeugt und aktuell (sonst: npm run seo), hreflang gegenseitig,
// keine fremden Spielnamen in Titel/Überschrift/URL, Startseite mit canonical und Structured Data ohne Bewertungen
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
const { seoFiles, PAGES, SITE, fileOf, mediaOf } = await import("../../tools/gen-seo.mjs");
const read = f => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const files = seoFiles();
const tag = (html, re) => (html.match(re) || [])[1] || "";
const FOREIGN = /head\s*soccer|head\s*ball|football\s*heads|big\s*head|sports\s*heads/i;

test("Infoseiten, sitemap.xml und robots.txt sind aktuell (npm run seo)", () => {
  for (const [f, body] of Object.entries(files)) assert.equal(read(f), body, f + " veraltet: npm run seo");
});

test("je Seite: Sprache, H1, canonical auf sich selbst, hreflang-Gruppe gegenseitig mit x-default", () => {
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    assert.match(html, new RegExp(`<html lang="${p.lang}">`));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, p.path + ": genau eine H1");
    assert.equal(tag(html, /<link rel="canonical" href="([^"]+)">/), SITE + p.path);
    const alt = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => [m[1], m[2]]));
    const other = PAGES.find(x => x.path === p.alt);
    assert.equal(other.alt, p.path, "Gegenstück zeigt zurück");
    assert.deepEqual(alt, { [p.lang]: SITE + p.path, [other.lang]: SITE + other.path, "x-default": SITE + (p.lang === "en" ? p.path : other.path) });
  }
});

test("„Jetzt spielen“ führt ins Spiel mit Quelle und Sprache der Seite", () => {
  const srcs = PAGES.map(p => p.src);
  assert.deepEqual(srcs, ["seo-de", "seo-de-freunde", "seo-en", "seo-en-friends"]);
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    const ctas = [...html.matchAll(/<a class="lp-btn[^"]*" href="([^"]+)">/g)].map(m => m[1]);
    assert.ok(ctas.length >= 3, p.path + ": Hero, Leiste unten und Schluss");
    for (const h of ctas) assert.equal(h, `/?src=${p.src}&amp;lang=${p.lang}`);
    assert.match(p.src, /^[a-z0-9_-]{1,40}$/, "Kennung, die js/app/track.js annimmt");
  }
});

test("fremde Spielnamen: nie in Titel, H1, Beschreibung oder URL; „head soccer“ höchstens einmal im Fließtext der EN-Freunde-Seite", () => {
  let count = 0;
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    for (const part of [p.path, tag(html, /<title>([^<]*)<\/title>/), tag(html, /<h1[^>]*>([^<]*)<\/h1>/), tag(html, /<meta name="description" content="([^"]*)">/)]) assert.doesNotMatch(part, FOREIGN, p.path + ": " + part);
    assert.doesNotMatch(html, /head\s*ball|football\s*heads|big\s*head|sports\s*heads/i, p.path);
    const hits = (html.match(/head\s*soccer/gi) || []).length;
    if (p.path !== "/en/play-with-friends/") assert.equal(hits, 0, p.path);
    count += hits;
  }
  assert.ok(count <= 1, "head soccer: " + count);
});

test("Seiten nur mit dem eigenen Quellen-Skript, eigene CSP, keine Inline-Styles; Rechtsseiten verlinkt", () => {
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    assert.deepEqual([...html.matchAll(/<script[^>]*>/g)].map(m => m[0]), ['<script type="module" src="/js/landing-src.js">'], p.path + ": nur das Quellen-Skript");
    assert.doesNotMatch(html, /style="/);
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';/);
    for (const f of ["imprint", "privacy", "terms"]) assert.match(html, new RegExp(`href="/legal/${f}\\.html\\?lang=${p.lang}"`));
  }
});

test("sitemap.xml: Startseite und alle Infoseiten mit hreflang; robots.txt nennt sie", () => {
  const sm = files["sitemap.xml"];
  for (const loc of ["/", ...PAGES.map(p => p.path)]) assert.match(sm, new RegExp(`<loc>${SITE}${loc}</loc>`));
  assert.equal((sm.match(/<xhtml:link /g) || []).length, PAGES.length * 3);
  assert.match(files["robots.txt"], new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, "m"));
});

test("Startseite: Titel, canonical, Structured Data ohne Bewertungen, Links zu allen Infoseiten", () => {
  const html = read("index.html");
  assert.match(tag(html, /<title>([^<]*)<\/title>/), /^Headstars – Kopfball-Fußball/);
  assert.doesNotMatch(tag(html, /<title>([^<]*)<\/title>/), FOREIGN);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/">`));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(m => JSON.parse(m[1]));
  const site = ld.find(x => x["@type"] === "WebSite"), game = ld.find(x => Array.isArray(x["@type"]) && x["@type"].includes("VideoGame"));
  assert.equal(site.name, "Headstars"); assert.equal(site.url, SITE + "/");
  assert.ok(game["@type"].includes("WebApplication"));
  assert.equal(game.offers.price, 0);
  assert.ok(!("aggregateRating" in game) && !("review" in game), "keine erfundenen Bewertungen");
  for (const p of PAGES) assert.match(html, new RegExp(`class="setlink" href="${p.path.slice(1)}"`));
});

test("Infoseiten werden veröffentlicht", () => {
  const cp = read(".github/workflows/pages.yml").match(/cp -r ([^\n]+) _site\//)[1].split(/\s+/);
  for (const f of ["de", "en", "landing", "robots.txt", "sitemap.xml"]) assert.ok(cp.includes(f), f);
});

test("css/landing.css übernimmt die Tokens aus css/style.css unverändert", () => {
  const vars = css => Object.fromEntries([...css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {"))).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const game = vars(read("css/style.css")), page = vars(read("css/landing.css"));
  const shared = Object.keys(page).filter(k => !k.startsWith("--lp-"));
  assert.ok(shared.length > 10);
  for (const k of shared) assert.equal(page[k], game[k], k);
});

test("Bilder und Gameplay-Loop: jede eingebundene Datei liegt in landing/, Bilder mit alt und Größe, unter dem Hero lazy", () => {
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    const media = mediaOf(html);
    assert.ok(media.length > 10, p.path);
    for (const f of media) assert.ok(existsSync(new URL("../../" + f, import.meta.url)), p.path + ": fehlt " + f + " (tools/gen-landing-media.mjs)");
    const imgs = [...html.matchAll(/<img [^>]*>/g)].map(m => m[0]);
    for (const i of imgs) assert.match(i, /alt="[^"]*"/, i);
    for (const i of imgs.filter(x => x.includes("/landing/"))) assert.match(i, / width="\d+" height="\d+"/, i);
    const eager = imgs.filter(x => !x.includes('loading="lazy"'));
    assert.ok(eager.length <= 3, p.path + ": nur Kopf und Hero ohne lazy");
    assert.match(html, /<link rel="preload" as="image" [^>]*fetchpriority="high">/);
    assert.match(html, /<video [^>]*autoplay muted loop playsinline/);
    for (const m of html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)) assert.ok(m[1].trim().length >= 3, "H2 mit Text: " + m[1]);
  }
});

test("Quelle aus der Adresse (z. B. Anzeige) ersetzt die Quelle der Infoseite im Spiel-Link", async () => {
  const { withSrc } = await import("../../js/landing-src.js");
  const href = "/?src=seo-de&lang=de";
  assert.equal(withSrc(href, "?src=gads-de-kern"), "/?src=gads-de-kern&lang=de");
  assert.equal(withSrc(href, "?src=GADS-EN"), "/?src=gads-en&lang=de", "klein geschrieben wie track.js");
  assert.equal(withSrc(href, ""), href, "ohne Quelle bleibt der Link");
  assert.equal(withSrc(href, "?src=a%20b"), href, "freier Text wird ignoriert");
  assert.equal(withSrc(href, "?src=" + "x".repeat(41)), href, "zu lang wird ignoriert");
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    assert.ok(html.includes('<script type="module" src="/js/landing-src.js"></script>'), p.path + ": Skript eingebunden");
    assert.ok(html.includes("script-src 'self';"), p.path + ": CSP erlaubt nur eigene Skripte");
  }
});
