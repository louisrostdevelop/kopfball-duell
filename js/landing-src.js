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

if (typeof document !== "undefined") {
  for (const a of document.querySelectorAll('a[href^="/?src="]')) a.setAttribute("href", withSrc(a.getAttribute("href"), location.search));
}
