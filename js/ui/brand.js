// Marke Headstars: Farben und Schriftzug (Logo „Kopf + Ball“, App-Icon in tools/brand/icon.js).
// Daraus erzeugt tools/brand/build.mjs icons/wordmark.webp (Ladebildschirm, Teilen-Bild),
// das App-Icon zeichnet tools/brand/icon.js mit den echten Spielgrafiken.
// Reine SVG-Texte, kein DOM: läuft im Browser und in Node.

export const BRAND = { ink: "#15112e", cream: "#fff8e8", gold: "#ffb020", goldHi: "#ffe36a", sky: "#2e4fa8", night: "#1b2b6b", grass: "#2aa05a", skin: "#ffcf9a", skinLo: "#f2a56b", pink: "#ff4fd8", cyan: "#22d3ee" };

const B = BRAND;

/**
 * Wortmarke HEADSTARS im Stil der Knöpfe: dicke dunkle Kontur, Kante nach unten (Tiefe), Verlauf mit Glanz oben,
 * „HEAD“ hell, „STARS“ gold wie der Spielen-Knopf, leicht nach oben gewölbt. Rahmen 900×300. Braucht Lilita One.
 */
export function wordmarkSvg({ id = "wm" } = {}) {
  const arc = `M70 236 Q450 150 830 236`;
  const txt = (attrs, head, stars) => `<text ${attrs}><textPath href="#${id}p" startOffset="50%" text-anchor="middle"><tspan ${head}>HEAD</tspan><tspan ${stars}>STARS</tspan></textPath></text>`;   // i18n-ok: Marke
  const F = `font-family="'Lilita One', Impact, sans-serif" font-size="150" letter-spacing="2" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300" width="900" height="300">
 <defs><path id="${id}p" d="${arc}"/>
  <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset=".08" stop-color="#ffffff"/><stop offset=".55" stop-color="#eaf3ff"/><stop offset="1" stop-color="#a9c8ff"/></linearGradient>
  <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset=".08" stop-color="#fff6b0"/><stop offset=".5" stop-color="#ffc21f"/><stop offset="1" stop-color="#ff8a00"/></linearGradient>
  <filter id="${id}s" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#0a0820" flood-opacity=".55"/></filter></defs>
 <g ${F} filter="url(#${id}s)">
  ${txt(`transform="translate(0 18)" fill="${B.ink}" stroke="${B.ink}" stroke-width="30"`, "", "")}
  ${txt(`transform="translate(0 10)" stroke="${B.ink}" stroke-width="30"`, `fill="#6f8fd6"`, `fill="#c25a00"`)}
  ${txt(`stroke="${B.ink}" stroke-width="26" paint-order="stroke"`, `fill="url(#${id}w)"`, `fill="url(#${id}g)"`)}
  ${txt(`fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" transform="translate(0 -3)"`, "", "")}
 </g></svg>`;
}
