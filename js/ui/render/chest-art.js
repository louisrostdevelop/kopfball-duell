// Kisten als SVG (scharf in jeder Größe): Bronze = Holz mit Bronzebeschlägen, Silber = dunkles Holz mit Silber und Nieten,
// Gold = rotes Holz mit Goldbeschlägen und Edelsteinen, Legendär = Kristall mit leuchtenden Runen.
// Deckel (.lid) und Leuchten im Inneren (.inner) sind eigene Gruppen, damit die Öffnen-Animation (CSS) sie bewegen kann.

const INK = "#1c1838";
const PAL = {
  bronze: { wood: ["#c98450", "#8a4a22"], metal: ["#f0c08a", "#a8652f"], plank: "#6e3a1a", lock: ["#ffe6a0", "#c9862a"], gem: null },
  silver: { wood: ["#5d6b8c", "#343d58"], metal: ["#ffffff", "#8a99ad"], plank: "#262d44", lock: ["#ffffff", "#9aa7bb"], gem: "#4fc3ff" },
  gold: { wood: ["#d8414a", "#8e1c2a"], metal: ["#fff1a0", "#d89400"], plank: "#6b1320", lock: ["#fff6c0", "#e0a400"], gem: "#ff3b6b" },
  legend: { wood: ["#9a6bff", "#4a1fa8"], metal: ["#f2e3ff", "#9a5cf0"], plank: "#3a1784", lock: ["#ffffff", "#c9a2ff"], gem: "#5effe0", rune: "#7ff6ff" },
};

const grad = (id, [a, b], y1 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="${y1}" x2="0" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

/** SVG-Quelltext einer Kiste (viewBox 120 x 104) */
export function chestSvg(tier) {
  const P = PAL[tier] || PAL.bronze, id = k => `ch-${tier}-${k}`;
  const W = `url(#${id("w")})`, M = `url(#${id("m")})`, L = `url(#${id("l")})`;
  const stroke = `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
  const rivet = ([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${P.metal[0]}" stroke="${INK}" stroke-width="1.5"/>`;
  const metalTier = tier === "silver" || tier === "gold";
  const boxRivets = metalTier ? [[29, 58], [29, 84], [91, 58], [91, 84]].map(rivet).join("") : "";
  const lidRivets = metalTier ? [[29, 26], [91, 26]].map(rivet).join("") : "";
  const lidGem = P.gem ? `<path d="M60 19 l5 5 -5 5 -5 -5 z" fill="${P.gem}" stroke="${INK}" stroke-width="2"/>` : "";
  const boxGems = P.gem && tier !== "silver" ? [29, 91].map(x => `<circle cx="${x}" cy="71" r="3.6" fill="${P.gem}" stroke="${INK}" stroke-width="1.8"/>`).join("") : "";
  const runes = P.rune
    ? `<g class="runes" stroke="${P.rune}" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M16 60 l6 8 -6 8"/><path d="M104 60 l-6 8 6 8"/><path d="M44 80 h8 M68 80 h8"/><path d="M18 26 l5 -6 5 6"/><path d="M92 26 l5 -6 5 6"/></g>`
    : "";
  const sparkle = tier === "legend" || tier === "gold"
    ? `<g class="twinkle" fill="#fff"><path d="M100 10 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/><path d="M14 40 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4 -4 -4 -1.4 4 -1.4z"/></g>`
    : "";
  return `<svg viewBox="0 0 120 104" aria-hidden="true">
  <defs>${grad(id("w"), P.wood)}${grad(id("m"), P.metal)}${grad(id("l"), P.lock)}
    <radialGradient id="${id("g")}" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="#fffbe0"/><stop offset=".5" style="stop-color: var(--rc, #ffe9a0); stop-opacity: .9"/><stop offset="1" style="stop-color: var(--rc, #ffe9a0); stop-opacity: 0"/></radialGradient></defs>
  <ellipse cx="60" cy="98" rx="50" ry="5" fill="rgb(0 0 0 / 25%)"/>
  <g class="inner"><ellipse cx="60" cy="46" rx="58" ry="40" fill="url(#${id("g")})"/></g>
  <g class="box">
    <rect x="14" y="40" width="92" height="12" rx="3" fill="${INK}"/>
    <rect x="10" y="46" width="100" height="48" rx="9" fill="${W}" ${stroke}/>
    <path d="M14 62 H106 M14 78 H106" stroke="${P.plank}" stroke-width="2" opacity=".55"/>
    <rect x="23" y="46" width="12" height="48" fill="${M}" ${stroke}/><rect x="85" y="46" width="12" height="48" fill="${M}" ${stroke}/>
    <rect x="10" y="46" width="100" height="48" rx="9" fill="none" ${stroke}/>
    <rect x="12" y="84" width="96" height="6" rx="3" fill="rgb(0 0 0 / 18%)"/>
    ${runes}${boxRivets}${boxGems}
  </g>
  <g class="lid">
    <path d="M8 48 V32 Q8 12 30 12 H90 Q112 12 112 32 V48 Z" fill="${W}" ${stroke}/>
    <path d="M23 13 H35 V48 H23 Z M85 13 H97 V48 H85 Z" fill="${M}" ${stroke}/>
    <rect x="6" y="40" width="108" height="10" rx="4" fill="${M}" ${stroke}/>
    <path d="M18 22 Q40 15 60 15" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45" fill="none"/>
    ${lidRivets}${lidGem}
  </g>
  <g class="lock">
    <rect x="49" y="38" width="22" height="24" rx="5" fill="${L}" ${stroke}/>
    <circle cx="60" cy="46.5" r="3.4" fill="${INK}"/><path d="M58.2 48 H61.8 L63.2 56 H56.8 Z" fill="${INK}"/>
  </g>
  ${sparkle}
</svg>`;
}
