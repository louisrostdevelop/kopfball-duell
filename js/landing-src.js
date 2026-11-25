// Infoseiten (de/, en/ …): Kommt der Besuch mit eigener Quelle (?src=, z. B. aus einer Anzeige), nehmen die
// Spiel-Links sie mit. So zählt js/app/track.js den Besuch bei der Anzeige und nicht bei der Infoseite.
// Ohne gültige Quelle bleibt der feste Link der Seite (seo-…). Format wie origin() in js/app/track.js.
const SRC = /^[a-z0-9_-]{1,40}$/;

/** Spiel-Link mit der Quelle aus search; ungültige oder fehlende Quelle: Link unverändert */
export function withSrc(href, search) {
  const src = (new URLSearchParams(search).get("src") || "").toLowerCase();
  if (!SRC.test(src)) return href;
  const u = new URL(href, "https://x.invalid");
  u.searchParams.set("src", src);
  return u.pathname + u.search;
}

/** Sprachwahl (<details> im Kopf): Klick daneben oder Escape schließt sie; ohne Skript schließt erneutes Tippen */
export function closeOnOutside(menu, doc) {
  doc.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  doc.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary").focus();
  });
}

/** 404.html: erste Browsersprache, für die es eine Fassung gibt, sonst fallback */
export function pickLang(have, prefs, fallback) {
  for (const l of prefs) { const k = String(l || "").slice(0, 2).toLowerCase(); if (have.includes(k)) return k; }
  return fallback;
}
/** 404.html: zeigt die Fassung der Sprache l (Elemente mit data-nf), setzt Sprache und Titel der Seite */
export function showLang(doc, l) {
  const els = [...doc.querySelectorAll("[data-nf]")];
  if (!els.some(e => e.lang === l)) return;
  for (const e of els) e.hidden = e.lang !== l;
  doc.documentElement.lang = l;
  doc.title = els.find(e => e.lang === l && e.getAttribute("data-title"))?.getAttribute("data-title") || doc.title;
}

if (typeof document !== "undefined") {
  for (const a of document.querySelectorAll('a[href^="/?src="]')) a.setAttribute("href", withSrc(a.getAttribute("href"), location.search));
  const menu = document.querySelector(".lp-lang");
  if (menu) closeOnOutside(menu, document);
  const nf = [...document.querySelectorAll("[data-nf]")].map(e => e.lang);
  if (nf.length) showLang(document, pickLang(nf, navigator.languages || [navigator.language], document.documentElement.lang));
}
