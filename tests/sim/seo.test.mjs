// Infoseiten für Suchmaschinen: aus tools/gen-seo.mjs erzeugt und aktuell (sonst: npm run seo), hreflang gegenseitig,
// keine fremden Spielnamen in Titel/Überschrift/URL, Startseite mit canonical und Structured Data ohne Bewertungen
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const { seoFiles, pagesOf, pageDirs, alternates, PAGES, SITE, fileOf, mediaOf } = await import("../../tools/gen-seo.mjs");
const { LANGS, DEFAULT_LANG, NEUTRAL_LANG } = await import("../../tools/seo/langs.mjs");
const read = f => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const files = seoFiles();
const tag = (html, re) => (html.match(re) || [])[1] || "";
const FOREIGN = /head\s*soccer|head\s*ball|football\s*heads|big\s*head|sports\s*heads/i;

test("Infoseiten, sitemap.xml und robots.txt sind aktuell (npm run seo)", () => {
  for (const [f, body] of Object.entries(files)) assert.equal(read(f), body, f + " veraltet: npm run seo");
});

/** hreflang-Gruppe, Sprachumschalter (Kopf, Fuß) einer erzeugten Seite */
const linksOf = html => ({
  alt: Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => [m[1], m[2]])),
  top: [...html.matchAll(/<a class="lp-lang__item" href="([^"]+)" hreflang="([^"]+)" lang="([^"]+)"/g)].map(m => [m[2], m[1]]),
  current: [...html.matchAll(/<a class="lp-lang__item" href="([^"]+)"[^>]* aria-current="page"/g)].map(m => m[1]),
  foot: [...tag(html, /<nav class="lp-foot__nav">(.*?)<\/nav>/).matchAll(/<a href="([^"]+)" hreflang="([^"]+)"/g)].map(m => [m[2], m[1]]),
});
/** Prüft je Seite: hreflang nennt sich selbst und jede Sprache mit derselben Seitenart (gegenseitig), x-default = EN */
function checkGroups(pages, out) {
  for (const p of pages) {
    const html = out[fileOf(p.path)];
    assert.match(html, new RegExp(`<html lang="${p.lang}">`));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, p.path + ": genau eine H1");
    assert.equal(tag(html, /<link rel="canonical" href="([^"]+)">/), SITE + p.path);
    const same = pages.filter(x => x.kind === p.kind), def = same.find(x => x.lang === DEFAULT_LANG);
    const { alt, top, current, foot } = linksOf(html);
    assert.deepEqual(alt, { ...Object.fromEntries(same.map(x => [x.lang, SITE + x.path])), ...(def ? { "x-default": SITE + def.path } : {}) }, p.path);
    for (const x of same) assert.equal(linksOf(out[fileOf(x.path)]).alt[p.lang], SITE + p.path, x.path + " zeigt zurück auf " + p.path);
    const others = same.filter(x => x !== p).map(x => [x.lang, x.path]);
    // oben: ein Knopf, die Liste nennt alle Sprachen der Seitenart, die eigene als aktuelle; unten: die anderen
    assert.deepEqual(top, same.length > 1 ? same.map(x => [x.lang, x.path]) : [], p.path + ": Sprachwahl oben");
    assert.deepEqual(current, same.length > 1 ? [p.path] : [], p.path + ": aktuelle Sprache markiert");
    if (same.length > 1) assert.match(html, new RegExp(`<details class="lp-lang"><summary class="lp-top__lang lp-lang__btn">.*<span class="lp-lang__cur">${p.D.name}</span>`), p.path);
    assert.deepEqual(foot, others, p.path + ": Umschalter unten");
  }
}

test("je Seite: Sprache, H1, canonical auf sich selbst, hreflang-Gruppe gegenseitig mit x-default, Sprachumschalter", () => {
  assert.deepEqual(PAGES.filter(p => ["de", "en"].includes(p.lang)).map(p => [p.lang, p.kind]), [["de", "main"], ["de", "friends"], ["en", "main"], ["en", "friends"]]);
  checkGroups(PAGES, files);
});

test("Sprachcodes = Spielsprachen (uk, nie das Landeskürzel ua); og:locale mit Land", async () => {
  const { LANGS: GAME } = await import("../../js/content/i18n.js");
  const LOCALE = { de: "de_DE", en: "en_US", es: "es_419", pt: "pt_BR", vi: "vi_VN", uk: "uk_UA", ru: "ru_RU" };
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    assert.ok(Object.hasOwn(GAME, p.lang), p.lang + " ist keine Spielsprache");
    assert.equal(p.path.split("/")[1], p.lang, p.path + ": Ordner = Sprachcode");
    if (LOCALE[p.lang]) assert.equal(tag(html, /<meta property="og:locale" content="([^"]+)">/), LOCALE[p.lang], p.path);
    for (const m of html.matchAll(/(?:hreflang|lang)="([^"]+)"/g)) assert.ok(m[1] === "x-default" || Object.hasOwn(GAME, m[1]), `${p.path}: Sprachcode ${m[1]}`);
  }
  assert.doesNotMatch(files["sitemap.xml"], /hreflang="ua"|\/ua\//);
});

test("dritte Sprache mit nur der Hauptseite: hreflang vollständig und gegenseitig, Freunde-Seiten ohne sie", () => {
  const en = LANGS.find(D => D.lang === "en");
  const xx = { ...en, lang: "xx", name: "Testisch", thisPage: "Testseite", pages: { main: { path: "/xx/", src: "seo-xx",
    build: h => ({ ...en.pages.main.build({ ...h, path: kind => (kind === "main" ? "/xx/" : "/en/play-with-friends/") }), title: "Testseite | Headstars" }) } } };
  const langs = [...LANGS, xx], pages = pagesOf(langs), out = seoFiles(langs);
  checkGroups(pages, out);
  const main = pages.filter(p => p.kind === "main"), friends = pages.filter(p => p.kind === "friends");
  const withFriends = LANGS.filter(D => D.pages.friends).map(D => D.lang);
  for (const p of main) assert.deepEqual(alternates(p, pages).map(a => a[0]), [...LANGS.map(D => D.lang), "xx", "x-default"], p.path);
  for (const p of friends) assert.deepEqual(alternates(p, pages).map(a => a[0]), [...withFriends, "x-default"], p.path);
  const xhtml = out["xx/index.html"];
  assert.match(xhtml, /<nav class="lp-top__langs" aria-label="Languages">/, "mehrere Sprachen: Liste im Kopf");
  assert.doesNotMatch(tag(xhtml, /<nav class="lp-foot__nav">(.*?)<\/nav>/), /play-with-friends/, "keine eigene Freunde-Seite: kein Link im Fuß");
  assert.ok(out["sitemap.xml"].includes(`<loc>${SITE}/xx/</loc>`), "Sitemap nennt die neue Seite");
  assert.equal((out["sitemap.xml"].match(/<xhtml:link /g) || []).length, pages.reduce((s, p) => s + alternates(p, pages).length, 0));
  assert.throws(() => seoFiles([...LANGS, { ...xx, pages: { main: { ...xx.pages.main, build: en.pages.main.build } } }]), /verlinkt „friends“/, "Link auf fehlende Seite fällt auf");
  assert.throws(() => pagesOf([...LANGS, en]), /doppelt/);
});

test("Lücken in einer Sprachdatei oder in den Spieltexten brechen den Lauf ab, statt „undefined“ zu schreiben", () => {
  const en = LANGS.find(D => D.lang === "en");
  const xx = (over = {}) => ({ ...en, lang: "xx", name: "Testisch", thisPage: "Testseite", pages: { main: { path: "/xx/", src: "seo-xx",
    build: h => en.pages.main.build({ ...h, path: kind => (kind === "main" ? "/xx/" : "/en/play-with-friends/") }) } }, ...over });
  const run = D => seoFiles([...LANGS, D]);
  for (const l of [DEFAULT_LANG, NEUTRAL_LANG]) assert.ok(LANGS.some(D => D.lang === l), "x-default und Aufnahmesprache stehen in LANGS: " + l);
  assert.ok(run(xx())["xx/index.html"], "vollständige Test-Sprache läuft");
  const { play: _play, ...noPlay } = en.ui;
  assert.throws(() => run(xx({ ui: noPlay })), /tools\/seo\/xx\.mjs: ui\.play fehlt/);
  assert.throws(() => run(xx({ ui: { ...en.ui, facts: ["Free"] } })), /ui\.facts braucht 3/);
  assert.throws(() => run(xx({ media: { locale: "xx-XX", host: "Sam" } })), /media\.guest fehlt/);
  assert.throws(() => run(xx({ name: "" })), /name fehlt oder leer/);
  assert.throws(() => run(xx({ pages: { blog: { path: "/xx/blog/", src: "seo-xx-blog", build: () => ({}) } } })), /unbekannte Seitenart blog/);
  assert.throws(() => run(xx({ pages: { main: { path: "xx", src: "seo-xx", build: () => ({}) } } })), /braucht path, src/);
  const page = build => xx({ pages: { main: { path: "/xx/", src: "seo-xx", build } } });
  const base = h => en.pages.main.build({ ...h, path: () => "/en/play-with-friends/" });
  assert.throws(() => run(page(h => ({ ...base(h), lead: undefined }))), /pages\.main: lead fehlt/);
  assert.throws(() => run(page(h => ({ ...base(h), faq: [["Frage?", ""]] }))), /faq\[0\] Antwort fehlt/);
  const L = { ...en.L };
  delete L["arena.eis.name"];
  assert.throws(() => run(xx({ L })), /xx\/index\.html: „undefined“ im HTML/);
});

test("„Jetzt spielen“ führt ins Spiel mit Quelle und Sprache der Seite", () => {
  const srcs = PAGES.map(p => p.src);
  assert.deepEqual(srcs.slice(0, 4), ["seo-de", "seo-de-freunde", "seo-en", "seo-en-friends"]);
  assert.equal(new Set(srcs).size, srcs.length, "jede Seite mit eigener Kennung");
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    const ctas = [...html.matchAll(/<a class="lp-btn[^"]*" href="([^"]+)">/g)].map(m => m[1]);
    assert.ok(ctas.length >= 3, p.path + ": Hero, Leiste unten und Schluss");
    for (const h of ctas) assert.equal(h, `/?src=${p.src}&amp;lang=${p.lang}`);
    assert.match(p.src, /^[a-z0-9_-]{1,40}$/, "Kennung, die js/app/track.js annimmt");
  }
});

test("Beschreibung (meta description) höchstens 155 Zeichen, damit Google sie nicht abschneidet", () => {
  const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const p of PAGES) {
    const d = unesc(tag(files[fileOf(p.path)], /<meta name="description" content="([^"]*)">/));
    assert.ok(d.length >= 70 && d.length <= 155, `${p.path}: ${d.length} Zeichen`);
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
  assert.equal((sm.match(/<xhtml:link /g) || []).length, PAGES.reduce((s, p) => s + alternates(p).length, 0));
  assert.match(files["robots.txt"], new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, "m"));
});

test("Startseite: Titel, canonical, Structured Data ohne Bewertungen, Einstellungs-Links auf die Infoseiten", () => {
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
  // je Seitenart ein Link, ohne Skript auf die Seite von DEFAULT_LANG; das Spiel setzt die der Spielsprache aus info-pages.js
  const kinds = [...new Set(PAGES.map(p => p.kind))];
  for (const kind of kinds) assert.match(html, new RegExp(`class="setlink" data-info="${kind}" href="${PAGES.find(p => p.kind === kind && p.lang === DEFAULT_LANG).path.slice(1)}" hreflang="${DEFAULT_LANG}"`), kind);
  assert.equal((html.match(/class="setlink" data-info=/g) || []).length, kinds.length, "keine Links je Sprache von Hand");
});

test("js/content/info-pages.js: jede Infoseite je Sprache und Art, sonst der Abschnitt der Hauptseite; Ersatzsprache hat jede Art", async () => {
  const { INFO_PAGES, INFO_DEFAULT } = await import("../../js/content/info-pages.js");
  assert.equal(INFO_DEFAULT, DEFAULT_LANG);
  const flat = Object.entries(INFO_PAGES).flatMap(([l, k]) => Object.entries(k).map(([kind, path]) => [l, kind, path]));
  assert.deepEqual(flat.filter(([, , path]) => !path.includes("#")), PAGES.map(p => [p.lang, p.kind, p.path.slice(1)]));
  const covered = PAGES.flatMap(p => Object.entries(p.covers).map(([kind, id]) => [p.lang, kind, `${p.path.slice(1)}#${id}`]));
  assert.deepEqual(flat.filter(([, , path]) => path.includes("#")), covered);
  assert.deepEqual(INFO_PAGES.pt?.friends, "pt/#com-amigos", "Portugiesisch: Freunde als Abschnitt der Hauptseite");
  for (const [l, kind, id] of PAGES.flatMap(p => Object.entries(p.covers).map(([k, i]) => [p.lang, k, i]))) {
    assert.ok(!PAGES.some(p => p.lang === l && p.kind === kind), `${l}: ${kind} als Seite und als Abschnitt`);
    assert.match(files[fileOf(PAGES.find(p => p.lang === l && p.covers[kind]).path)], new RegExp(` id="${id}"`));
  }
  const { LANGS: GAME } = await import("../../js/content/i18n.js");
  for (const l of Object.keys(INFO_PAGES)) assert.ok(GAME[l], "Infoseite ohne Spielsprache: " + l);
});

test("Infoseiten werden veröffentlicht: Sprachordner kommen aus tools/seo/langs.mjs", () => {
  const yml = read(".github/workflows/pages.yml");
  assert.match(yml, /^\s*langs="\$\(node tools\/gen-seo\.mjs --dirs\)"/m);
  const cp = yml.match(/cp -r ([^\n]+) _site\//)[1].split(/\s+/);
  for (const f of ["$langs", "landing", "robots.txt", "sitemap.xml"]) assert.ok(cp.includes(f), f);
  const dirs = execFileSync(process.execPath, ["tools/gen-seo.mjs", "--dirs"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim().split(" ");
  assert.deepEqual(dirs, pageDirs());
  for (const p of PAGES) assert.ok(dirs.includes(p.path.split("/")[1]), p.path);
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
  // Sprachwahl: Klick daneben und Escape schließen, Klick hinein nicht
  const { closeOnOutside } = await import("../../js/landing-src.js");
  const on = {}, inside = {}, summary = { focused: false, focus() { this.focused = true; } };
  const menu = { open: true, contains: t => t === inside || t === summary, querySelector: () => summary };
  closeOnOutside(menu, { addEventListener: (type, fn) => { on[type] = fn; } });
  on.click({ target: inside }); assert.equal(menu.open, true, "Klick in die Liste");
  on.click({ target: {} }); assert.equal(menu.open, false, "Klick daneben");
  menu.open = true; on.keydown({ key: "Enter" }); assert.equal(menu.open, true);
  on.keydown({ key: "Escape" }); assert.equal(menu.open, false, "Escape"); assert.ok(summary.focused, "Fokus zurück auf den Knopf");
  for (const p of PAGES) {
    const html = files[fileOf(p.path)];
    assert.ok(html.includes('<script type="module" src="/js/landing-src.js"></script>'), p.path + ": Skript eingebunden");
    assert.ok(html.includes("script-src 'self';"), p.path + ": CSP erlaubt nur eigene Skripte");
  }
});
