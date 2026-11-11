// Arenen und Hindernis-Layouts vermessen: Computer gegen Computer, je Layout viele Spiele.
//   node tools/balance/arenas.mjs [Spiele=16] [arena]
// Misst, was Spielspaß kostet oder bringt (Vergleich immer mit "ohne Hindernisse" derselben Arena):
//   Tore/min, Ballkontakte/min, Hindernis-Treffer/min, Anteil Tore direkt nach Hindernis (Zufallstore),
//   Totzeit (Ball langsam und kein Spieler in der Nähe), Ball hoch oben (auf dem Handy hinter der Anzeige oder außer Sicht),
//   und für jedes Hindernis, ob es auf dem Handy unter der Anzeige liegt.
import { seedRandom } from "../../tests/lib/rng.mjs";
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const L = await import("../../js/content/layouts.js");

// Sichtbarkeit wie render.js resize(): Handy quer mit Touch-Leiste; Anzeige (HUD) reicht bis visTop + 68
export const PHONES = [["iPhone 14", 844, 390], ["Android groß", 915, 412], ["iPhone Pro Max", 932, 430], ["iPhone SE", 667, 375]];
export function hudBottom(vw, vh, band = 104, W = C.W0) {
  const s0 = Math.min(vw / W, vh / (C.H * 0.6)), extra = Math.max(0, band - (C.H - C.G) * s0), s = Math.min(vw / W, (vh - extra) / (C.H * 0.6));
  const top = Math.max(-40, -(vh - extra - C.H * s) / s);
  return { top, hud: top + 68 };
}
export const SAFE_Y = Math.max(...PHONES.map(([, w, h]) => hudBottom(w, h).hud)) + 20;   // alles darunter ist auf jedem Handy frei zu sehen

const CHARS = ["kalle", "yuki", "bolt", "rocco", "nala", "tank", "tina", "magnus"];
function match(arena, obs, seed) {
  seedRandom(seed);
  const chars = [CHARS[seed % CHARS.length], CHARS[(seed * 3 + 1) % CHARS.length]];
  const st = P.newMatch({ chars, arena, dur: 90, pus: true, golden: false, rules: { obs }, seed, bots: [2, 2] });
  const m = { min: 0, goals: 0, touches: 0, obsHits: 0, obsGoals: 0, dead: 0, high: 0, frames: 0 };
  let acc = 0, lastTouch = -9, lastObs = -9, calm = 0, score = 0, touches = 0;
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 100 && st.ph !== "end"; f++) {
    acc = P.advance(st, dt, [{}, {}], acc);   // Bot rechnet im Physikschritt
    const tm = f * dt;
    for (const e of st.ev) if (e.t === "obs" || e.t === "noclip") { m.obsHits++; lastObs = tm; }
    st.ev.length = 0;
    const tc = st.stats[0].shots + st.stats[0].heads + st.stats[1].shots + st.stats[1].heads;
    if (tc > touches) { touches = tc; lastTouch = tm; }
    const s = st.s[0] + st.s[1];
    if (s > score) { score = s; m.goals++; if (lastObs > lastTouch) m.obsGoals++; }
    if (st.ph !== "play") continue;
    m.frames++;
    const b = st.b, sp = Math.hypot(b.vx, b.vy), near = st.p.some(p => Math.hypot(p.x - b.x, p.y - b.y) < 170);
    calm = sp < 90 && !near ? calm + dt : 0;
    if (calm > 1) m.dead += dt;
    if (b.y < SAFE_Y - 20) m.high += dt;
  }
  m.touches = touches; m.min = m.frames * dt / 60;
  return m;
}

export function measure(arena, obs, games = 16) {
  const t = { min: 0, goals: 0, touches: 0, obsHits: 0, obsGoals: 0, dead: 0, high: 0 };
  for (let g = 0; g < games; g++) { const m = match(arena, obs, 100 + g); for (const k in t) t[k] += m[k]; }
  const per = k => t[k] / t.min, pct = k => (100 * t[k]) / (t.min * 60);
  return { tore: per("goals"), kontakte: per("touches"), hindernis: per("obsHits"), zufallstore: t.goals ? (100 * t.obsGoals) / t.goals : 0, tot: pct("dead"), hoch: pct("high") };
}

// Hindernisse, die auf dem Handy (teilweise) hinter der Anzeige liegen: höchster Punkt inkl. Bewegung
export function hidden(arena, idx) {
  const out = [];
  for (const o of L.buildObstacles(arena, idx)) {
    const reach = o.mv ? (o.mv.orbit ? Math.abs(o.mv.orbit) * 0.45 : Math.abs(o.mv.ay || 0)) : 0;
    const top = (o.t === "bump" ? o.cy - o.r : o.cy) - reach;
    if (top < SAFE_Y) out.push(`${o.t}@y${Math.round(top)}`);
  }
  return [...new Set(out)];
}

// Design-Regeln (docs in js/content/layouts.js), in Normalgröße (Abstand dx zur Mitte). Liefert die Verstöße als Text.
export const RULE_TOP = 230;   // höchster Punkt (mit Bewegung) nie darüber: auf dem Handy liegt sonst die Anzeige drüber
export function violations(arena, idx) {
  const out = [];
  for (const it of L.layoutsFor(arena)[idx].items) {
    const mv = it.mv || {}, ax = Math.abs(mv.ax || 0) + Math.abs(mv.orbit || 0), ay = Math.abs(mv.ay || 0) + Math.abs(mv.orbit || 0) * 0.45;
    const half = it.t === "bump" ? it.r : (it.w || 0) / 2, top = (it.t === "bump" ? it.y - it.r : it.t === "geyser" || it.t === "bubbles" ? C.G : it.y) - ay;
    const far = Math.abs(it.dx) + half + ax, near = Math.max(0, Math.abs(it.dx) - half - ax), low = it.t === "bump" ? it.y + it.r + ay : it.y + (it.h || 18) + ay;
    const ground = it.y >= 480 || ["ramp", "geyser", "bubbles"].includes(it.t);
    if (top < RULE_TOP) out.push(`${it.t}@${it.dx}: zu hoch (${Math.round(top)})`);
    if (far > 520) out.push(`${it.t}@${it.dx}: im Torraum (${Math.round(far)})`);
    if (!ground && near < 60 && low > 200 && top < 360) out.push(`${it.t}@${it.dx}: über dem Anstoß`);
    if (ground && it.t !== "geyser" && it.t !== "bubbles" && Math.abs(Math.abs(it.dx) - 330) < half + 40) out.push(`${it.t}@${it.dx}: auf dem Startplatz`);
    if (it.t === "portal" && Math.abs(it.dx) < 120) out.push(`portal@${it.dx}: zu nah an der Mitte`);
  }
  return out.map(s => `${arena}.${idx} ${s}`);
}

if (process.argv[1] && process.argv[1].endsWith("arenas.mjs")) {
  const games = +(process.argv[2] || 16), only = process.argv[3];
  console.log(`Sicher sichtbar auf allen Handys ab y ${Math.round(SAFE_Y)} (Boden 640, Latte ${C.BAR_Y})`);
  const f = x => x.toFixed(1);
  for (const a of C.ARENAS) {
    if (only && a.id !== only) continue;
    const rows = [["ohne", "off"], ...L.layoutsFor(a.id).map((l, i) => [`${i}`, i])];
    for (const [name, obs] of rows) {
      const r = measure(a.id, obs, games), h = obs === "off" ? [] : hidden(a.id, obs);
      console.log(`${a.id.padEnd(8)} ${name.padEnd(4)} Tore/min ${f(r.tore)}  Kontakte/min ${f(r.kontakte)}  Hindernis/min ${f(r.hindernis)}  Zufallstore ${f(r.zufallstore)}%  Totzeit ${f(r.tot)}%  hoch ${f(r.hoch)}%  ${h.length ? "versteckt: " + h.join(" ") : ""}`);
    }
  }
}
