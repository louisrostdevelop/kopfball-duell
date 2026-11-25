// Erzeugt die Infoseiten für Suchmaschinen (je Sprache aus tools/seo/langs.mjs, z. B. de/, de/gegen-freunde/, en/,
// en/play-with-friends/), sitemap.xml und robots.txt. Zahlen und Namen (Köpfe, Supers, Arenen, Modi, Sperren) kommen aus dem
// Spiel, damit die Seiten stimmen, wenn sich das Spiel ändert. Nach einer Änderung: `npm run seo`. Ein Test prüft, dass die
// Dateien aktuell sind. Texte je Sprache: tools/seo/<lang>.mjs; hier nur Aufbau und Bausteine.
// Bilder und Gameplay-Loop: landing/ (tools/gen-landing-media.mjs, aus dem echten Spiel aufgenommen).
// Aussehen: css/landing.css (Design-Tokens des Spiels). Fremde Spielnamen nie in Titel, Überschrift oder URL.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ARENAS, CHARS, MODES, PAYMENTS, POWERUPS } from "../js/content/config.js";
import { SIZES, VIDEO } from "./gen-landing-media.mjs";
import { DEFAULT_LANG, LANGS } from "./seo/langs.mjs";

export const SITE = "https://headstars.app";
// Sperren der Online-Modi stehen in js/app/matchmaking.js (zieht Browser-Code nach, daher hier nur gelesen)
const mm = readFileSync(new URL("../js/app/matchmaking.js", import.meta.url), "utf8").match(/MIN_LEVEL = \{ casual: (\d+), ranked: (\d+) \}/);
if (!mm) throw new Error("MIN_LEVEL in js/app/matchmaking.js nicht gefunden");
const MIN_LEVEL = { casual: +mm[1], ranked: +mm[2] };
// Symbole aus dem Spiel (index.html), damit die Seiten dieselben Icons zeigen
const INDEX = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const symbol = id => { const m = INDEX.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`)); if (!m) throw new Error("Symbol fehlt: " + id); return m[0]; };
const ICONS = ["i-play", "i-users", "i-globe", "i-trophy", "i-star", "i-cal", "i-inf", "i-target", "i-crown", "i-share", "i-bolt", "i-stadium"];

/** Seiten aller Sprachen: Pfad, Sprache, Art (main, friends), Kennung für „Jetzt spielen“ (?src=), Daten der Sprache */
export function pagesOf(langs) {
  if (new Set(langs.map(D => D.lang)).size !== langs.length) throw new Error("Sprache doppelt in tools/seo/langs.mjs");
  return langs.flatMap(D => Object.entries(D.pages).map(([kind, x]) => ({ path: x.path, lang: D.lang, src: x.src, kind, build: x.build, D })));
}
export const PAGES = pagesOf(LANGS);
/** Datei zur URL (GitHub Pages liefert für /de/ die Datei de/index.html) */
export const fileOf = path => path.slice(1) + "index.html";
/** Dieselbe Seitenart in allen Sprachen, die sie haben (die Seite selbst eingeschlossen) */
const group = (p, pages) => pages.filter(x => x.kind === p.kind);
/** hreflang-Gruppe einer Seite: jede Sprache mit dieser Seitenart, x-default = Englisch */
export function alternates(p, pages = PAGES) {
  const g = group(p, pages), def = g.find(x => x.lang === DEFAULT_LANG);
  return [...g.map(x => [x.lang, x.path]), ...(def ? [["x-default", def.path]] : [])];
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const playUrl = p => `/?src=${p.src}&amp;lang=${p.lang}`;
const kbd = s => `<kbd>${esc(s)}</kbd>`;
const icon = (id, cls = "lp-ico") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- Bilder ----------
/** Seitenverhältnis der Aufnahmen (Breite x Höhe der größten Fassung) */
const DIMS = { scene: [1600, 1000], heads: [2400, 1200], arena: [1600, 900], mode: [600, 340], step: [1920, 1080], head: [512, 512] };
/** Bild mit AVIF und WebP in mehreren Breiten; eager nur für das, was im ersten Bildschirm steht */
function pic(name, kind, alt, { sizes = "(min-width: 960px) 52vw, 100vw", cls = "", eager = false } = {}) {
  const ws = kind === "head" ? [256] : SIZES[kind === "heads" ? "heads" : kind];
  const set = ext => ws.map(w => `/landing/${name}-${w}.${ext} ${w}w`).join(", ");
  const [w, h] = DIMS[kind];
  return `<picture${cls ? ` class="${cls}"` : ""}><source type="image/avif" srcset="${set("avif")}" sizes="${sizes}"><img src="/landing/${name}-${ws[Math.min(1, ws.length - 1)]}.webp" srcset="${set("webp")}" sizes="${sizes}" width="${w}" height="${h}" alt="${esc(alt)}"${eager ? "" : ` loading="lazy"`} decoding="async"></picture>`;
}
/** Alle Dateien, die eine Seite aus landing/ einbindet (für den Test) */
export const mediaOf = html => [...new Set([...html.matchAll(/\/landing\/[\w.-]+/g)].map(m => m[0].slice(1)))];

// ---------- Bausteine aus dem Spiel (L = Spieltexte der Sprache) ----------
const n = { heads: CHARS.length, arenas: ARENAS.length, pus: Object.keys(POWERUPS).length,
  start: ARENAS.filter(a => !a.level && !a.season).length, byLevel: ARENAS.filter(a => a.level).length, bySeason: ARENAS.filter(a => a.season).length };
const lockNote = (L, id) => {
  if (id === "casual") return L["lock.level"].replace("{n}", MIN_LEVEL.casual);
  if (id === "ranked") return L["lock.level"].replace("{n}", MIN_LEVEL.ranked) + ", " + L["lock.account"];
  return "";
};
function modeCards(L, side) {
  return `<ul class="lp-modes">${MODES.filter(m => m.side === side).map(m => {
    const lock = lockNote(L, m.id), name = L[`mode.${m.id}.name`];
    return `<li class="lp-mode">${pic("mode-" + m.id, "mode", "", { sizes: "(min-width: 960px) 300px, 50vw", cls: "lp-mode__art" })}<div class="lp-mode__body"><h4 class="lp-mode__name">${icon(m.icon)}${esc(name)}</h4><p class="lp-mode__desc">${esc(L[`mode.${m.id}.desc`])}</p>${lock ? `<p class="lp-mode__lock">${esc(lock)}</p>` : ""}</div></li>`;
  }).join("")}</ul>`;
}
const headChips = L => `<ul class="lp-heads">${CHARS.map(c => `<li class="lp-head">${pic("head-" + c.id, "head", "", { sizes: "56px", cls: "lp-head__img" })}<span class="lp-head__name">${esc(c.name)}</span><span class="lp-head__super">${esc(L[`super.${c.super}.name`])}</span></li>`).join("")}</ul>`;
const arenaMosaic = L => `<ul class="lp-arenas">${ARENAS.map(a => `<li class="lp-arena">${pic("arena-" + a.id, "arena", "", { sizes: "(min-width: 960px) 240px, 45vw" })}<span class="lp-arena__name">${esc(L[`arena.${a.id}.name`])}</span></li>`).join("")}</ul>`;
// Steuerung wie in den Einstellungen des Spiels (js/ui/screens/settings.js)
function controls(L, u) {
  const s = k => L["html.settings." + k];
  const rows = [
    [s("laufen"), kbd("A") + kbd("D"), s("stick"), s("linksZiehen")],
    [s("springen"), kbd("W"), "A", s("linksHoch")],
    [s("graetscheBombe"), kbd("S"), s("stick2"), s("linksRunter")],
    [s("schuss"), kbd(s("leer")), s("xB"), L["ctl.shootBtn"]],
    [s("super"), kbd("E"), s("yRb"), L["ctl.superBtn"]],
  ];
  return `<div class="lp-keys"><table class="lp-keys__table">
<thead><tr><th scope="col"><span class="lp-sr">${u.action}</span></th><th scope="col">${esc(L["ctl.keyboard"])}</th><th scope="col">${esc(s("controller"))}</th><th scope="col">${esc(s("touch"))}</th></tr></thead>
<tbody>${rows.map(([a, k, p, t]) => `<tr><th scope="row">${esc(a)}</th><td>${k}</td><td>${p === "A" ? kbd("A") : esc(p)}</td><td>${esc(t)}</td></tr>`).join("")}</tbody>
</table></div>`;
}

/** Was die Seitentexte (build in tools/seo/<lang>.mjs) bekommen: Bausteine in der Sprache der Seite */
function helpers(p, pages) {
  const { L, ui: u } = p.D;
  return {
    esc, pic, kbd, n, PAYMENTS,
    /** drei Power-ups als Beispiele */
    pu: ["boot", "time", "portal"].map(k => esc(L[`pu.${k}.name`])),
    /** die ersten drei Spiellängen */
    len: esc(["0", "1", "2"].map(i => L["rule.len.opt." + i]).join(", ")),
    /** Pfad der Seite dieser Art in derselben Sprache (Fehler, wenn es sie nicht gibt) */
    path: kind => {
      const x = pages.find(y => y.lang === p.lang && y.kind === kind);
      if (!x) throw new Error(`${p.path}: verlinkt „${kind}“, die Sprache ${p.lang} hat diese Seite nicht`);
      return x.path;
    },
    lock: id => lockNote(L, id),
    modes: () => `<h3 class="lp-h3">${u.online}</h3>\n${modeCards(L, "on")}\n<h3 class="lp-h3">${u.offline}</h3>\n${modeCards(L, "off")}`,
    headChips: () => headChips(L),
    arenaMosaic: () => arenaMosaic(L),
    controls: () => controls(L, u),
    /** Einladungs-Schritte mit Bildern step-<lang>-<n> */
    steps: (list, alts) => `<ol class="lp-steps">${list.map(([h, t], i) => `<li class="lp-step">${pic(`step-${p.lang}-${i + 1}`, "step", alts[i], { sizes: "(min-width: 960px) 380px, 100vw", cls: "lp-step__img" })}<div class="lp-step__body"><h3 class="lp-step__title"><span class="lp-step__num" aria-hidden="true">${i + 1}</span>${esc(h)}</h3><p>${t}</p></div></li>`).join("")}</ol>`,
  };
}

// ---------- Abschnitte ----------
/** Bild links/rechts im Wechsel, Text daneben (H2 + Fließtext); media = fertiges HTML oder Bild */
const feature = (s, i) => `<section class="lp-feature${i % 2 ? " lp-feature--flip" : ""}${s.wide ? " lp-feature--wide" : ""}" id="${s.id}">
<div class="lp-feature__media">${s.media}</div>
<div class="lp-feature__text">
<h2 class="lp-h2">${esc(s.h2)}</h2>
${s.html}
</div>${s.after ? `\n<div class="lp-feature__after">${s.after}</div>` : ""}
</section>`;
const panel = s => `<section class="lp-panel" id="${s.id}">
<h2 class="lp-h2 lp-h2--ink">${esc(s.h2)}</h2>
${s.html}
</section>`;

// ---------- Seite ----------
/** Sprachumschalter: dieselbe Seite in jeder anderen Sprache, die sie hat */
function langLinks(others, u) {
  const link = o => `<a class="lp-top__lang" href="${o.path}" hreflang="${o.lang}" lang="${o.lang}" title="${esc(o.D.thisPage)}">${icon("i-globe")}${esc(o.D.name)}</a>`;
  if (others.length < 2) return others.map(link).join("");
  return `<nav class="lp-top__langs" aria-label="${esc(u.langs)}">${others.map(link).join("")}</nav>`;
}

function page(p, pages) {
  const c = p.build(helpers(p, pages)), u = p.D.ui;
  const others = group(p, pages).filter(x => x !== p), siblings = pages.filter(x => x.lang === p.lang && x !== p);
  const cta = (cls = "") => `<a class="lp-btn${cls}" href="${playUrl(p)}">${icon("i-play", "lp-btn__ico")}<span>${u.play}</span></a>`;
  const legal = ["imprint", "privacy", "terms"].map((f, i) => `<a href="/legal/${f}.html?lang=${p.lang}">${u.legal[i]}</a>`).join("");
  const poster = `/landing/poster-${p.lang}`;
  let fi = 0;
  const body = c.sections.map(s => (s.panel ? panel(s) : feature(s, fi++))).join("\n");
  return `<!doctype html>
<!-- ERZEUGT von tools/gen-seo.mjs. Nicht von Hand ändern: dort anpassen, dann npm run seo. -->
<html lang="${p.lang}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<link rel="canonical" href="${SITE}${p.path}">
${alternates(p, pages).map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${SITE}${h}">`).join("\n")}
<meta name="theme-color" content="#0d2275">
<meta property="og:title" content="${esc(c.h1)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:image" content="${SITE}/og.jpg">
<meta property="og:url" content="${SITE}${p.path}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${p.D.locale}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preload" as="image" href="${poster}-640.webp" imagesrcset="${SIZES.poster.map(w => `${poster}-${w}.webp ${w}w`).join(", ")}" imagesizes="(max-width: 899px) 40vw, 100vw" fetchpriority="high">
<link rel="preload" href="/fonts/lilita.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/landing.css">
<script type="module" src="/js/landing-src.js"></script>
</head>
<body class="lp">
<svg class="lp-sprite" aria-hidden="true">${ICONS.map(symbol).join("")}</svg>
<header class="lp-top">
<a class="lp-top__brand" href="${playUrl(p)}"><img src="/icons/wordmark.webp" width="600" height="200" alt="Headstars"></a>
${langLinks(others, u)}
</header>
<main>
<section class="lp-hero">
<div class="lp-hero__stage" aria-hidden="true"><img class="lp-hero__backdrop" src="${poster}-640.webp" srcset="${SIZES.poster.map(w => `${poster}-${w}.webp ${w}w`).join(", ")}" sizes="(max-width: 899px) 40vw, 100vw" width="${VIDEO[0]}" height="${VIDEO[1]}" alt="" fetchpriority="high"></div>
<div class="lp-hero__screen"><img class="lp-hero__still" src="${poster}-960.webp" width="${VIDEO[0]}" height="${VIDEO[1]}" alt=""><video class="lp-hero__video" autoplay muted loop playsinline preload="auto" poster="${poster}-960.webp" width="${VIDEO[0]}" height="${VIDEO[1]}" aria-label="${esc(u.video)}"><source src="/landing/gameplay-${p.lang}.mp4" type="video/mp4"></video></div>
<div class="lp-hero__body">
<h1 class="lp-hero__title">${esc(c.h1)}</h1>
<p class="lp-hero__lead">${esc(c.lead)}</p>
<div class="lp-hero__cta">${cta(" lp-btn--hero")}</div>
<ul class="lp-hero__facts">${u.facts.map(f => `<li>${f}</li>`).join("")}</ul>
</div>
</section>
${body}
<section class="lp-panel lp-faq" id="faq">
<h2 class="lp-h2 lp-h2--ink">${u.faq}</h2>
${c.faq.map(([q, a]) => `<h3 class="lp-faq__q">${esc(q)}</h3>\n<p class="lp-faq__a">${a}</p>`).join("\n")}
</section>
<section class="lp-end">
${pic("scene-super", "scene", "", { sizes: "100vw", cls: "lp-end__bg" })}
<div class="lp-end__body">
<h2 class="lp-h2 lp-end__title">${u.endTitle}</h2>
${cta(" lp-btn--hero")}
<p class="lp-end__note">${u.ctaNote}</p>
</div>
</section>
</main>
<div class="lp-sticky">${cta()}</div>
<footer class="lp-foot">
<nav class="lp-foot__nav">${siblings.map(s => `<a href="${s.path}">${u[s.kind]}</a>`).join("")}${others.map(o => `<a href="${o.path}" hreflang="${o.lang}" lang="${o.lang}">${esc(o.D.name)}</a>`).join("")}${legal}</nav>
</footer>
</body>
</html>
`;
}

/** Startseite plus alle Infoseiten, je Seite mit hreflang-Gruppe */
export function sitemap(pages = PAGES) {
  const url = (loc, alt = []) => `<url><loc>${SITE}${loc}</loc>${alt.map(([l, h]) => `\n  <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${h}"/>`).join("")}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[url("/"), ...pages.map(p => url(p.path, alternates(p, pages)))].join("\n")}
</urlset>
`;
}
export const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;

/** Alle erzeugten Dateien: Pfad relativ zum Projekt → Inhalt (langs: Sprachen wie in tools/seo/langs.mjs) */
export function seoFiles(langs = LANGS) {
  const pages = pagesOf(langs);
  return { ...Object.fromEntries(pages.map(p => [fileOf(p.path), page(p, pages)])), "sitemap.xml": sitemap(pages), "robots.txt": robots() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [f, body] of Object.entries(seoFiles())) {
    const to = new URL("../" + f, import.meta.url);
    mkdirSync(dirname(fileURLToPath(to)), { recursive: true });
    writeFileSync(to, body);
  }
  console.log("Infoseiten, sitemap.xml und robots.txt geschrieben");   // i18n-ok
}
