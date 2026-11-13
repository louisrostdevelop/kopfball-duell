// Kopfball-Jonglieren auf der Bühne (Startseite, Gegnersuche): Antippen kurz bevor der Ball den Kopf trifft.
// Einheiten: Kopfradius = 1, Kopfmitte = (0, 0), y zeigt nach unten. Der Kopf steht fest, nur der Ball fliegt.
export const BALL_R = 0.32, FLOOR = 0.98;
const PERFECT = 0.055, GOOD = 0.13, LATE = 0.13, LEAD = 0.06, COOL = 0.11, WHIFF_COOL = 0.28;
const AIR0 = 1, G_MIN = 8, RAMP = 0.03, RAMP_MAX = 0.9, HEIGHT = 2.3, STOP = 0.025, BACK_TO_AUTO = 1.6;

/** @param {() => number} [rnd] */
export function createJuggle(rnd = Math.random) {
  return { mode: "auto", x: 0, y: -3, vx: 0, vy: 0, a: 0, g: 10, streak: 0, best: 0, pending: null, cool: 0, contactT: -9,
    passive: 0, t: 0, stop: 0, nod: 9, sq: 0, ring: 9, mood: "", moodT: 0, dropT: 0, lim: HEIGHT, wx: 3, ev: [], rnd };
}

const contactY = x => -Math.sqrt(Math.max(0, (1 + BALL_R) ** 2 - x * x));
/** Sekunden, bis der fallende Ball den Kopf berührt; null, wenn er ihn nicht mehr trifft */
export function contactIn(j) {
  const d = contactY(j.x) - j.y;
  if (d < -0.1 || Math.abs(j.x) > 1 + BALL_R * 0.5) return null;
  return (-j.vy + Math.sqrt(j.vy * j.vy + 2 * j.g * Math.max(0, d))) / j.g;
}
/** Kopf-Nicken nach oben (in Kopfradien), für die Darstellung */
export const nodOffset = j => (j.nod < 0.18 ? 0.22 * Math.sin((Math.PI * j.nod) / 0.18) : 0);

function launch(j, kind) {
  // Grundtempo: etwa eine Sekunde pro Kopfball, bei wenig Platz kürzer statt schwebend; mit der Serie schneller (Schwerkraft bis ×1,9)
  const top = Math.min(j.lim, HEIGHT), base = Math.max(G_MIN, (8 * top) / (AIR0 * AIR0));
  j.g = base * (kind === "auto" ? 0.85 : 1 + Math.min(RAMP_MAX, j.streak * RAMP));
  const h = top * (kind === "good" ? 0.85 : 1) * (0.93 + j.rnd() * 0.07), t = 2 * Math.sqrt((2 * h) / j.g);
  j.vy = -Math.sqrt(2 * j.g * h);
  // gut getroffen fliegt er leicht schräg, perfekt wieder zur Mitte; landen tut er immer auf dem Kopf
  const to = kind === "good" ? (j.rnd() - 0.5) * 0.7 : (j.rnd() - 0.5) * 0.15;
  j.vx = (to - j.x) / t;
}
function hit(j, q) {
  launch(j, q);
  j.passive = 0; j.pending = null; j.streak++; j.best = Math.max(j.best, j.streak); j.sq = 1;
  if (q === "perfect") { j.stop = STOP; j.ring = 0; j.mood = "happy"; j.moodT = 0.45; }
  j.ev.push({ k: "hit", q, n: j.streak });
}
function miss(j) {
  j.mode = "drop"; j.dropT = 0; j.passive = 0; j.pending = null; j.mood = "sad"; j.moodT = 0.8;
  j.ev.push({ k: "miss", n: j.streak });
  j.streak = 0;
}
function respawn(j, mode) {
  j.mode = mode; j.streak = 0; j.pending = null; j.passive = 0;
  Object.assign(j, { x: (j.rnd() - 0.5) * 0.2, y: -(1 + Math.min(j.lim, 2.2) + BALL_R), vx: 0, vy: 0 });
}

/**
 * Antippen. lag: Sekunden zwischen Eingabe und diesem Aufruf (wird zur Bewertung herausgerechnet).
 * @returns {string|null} "perfect" | "good" | "early" | "start" | null (ignoriert)
 */
export function juggleTap(j, lag = 0) {
  if (j.t < j.cool) return null;
  j.cool = j.t + COOL;
  if (j.mode === "drop") { respawn(j, "play"); return "start"; }
  if (j.mode === "auto") { j.mode = "play"; j.streak = 0; }
  if (j.pending) return null;
  j.nod = 0;
  // etwas zu spät: der Ball hat den Kopf gerade berührt und hüpft noch, das zählt als Treffer
  if (j.passive && j.t - lag - j.contactT <= LATE) { hit(j, "good"); return "good"; }
  const tc = contactIn(j);
  const err = tc === null ? Infinity : tc + lag - LEAD;
  if (Math.abs(err) <= PERFECT) j.pending = "perfect";
  else if (Math.abs(err) <= GOOD) j.pending = "good";
  else { j.cool = j.t + WHIFF_COOL; return "early"; }
  return j.pending;
}

/**
 * Ein Zeitschritt.
 * @param {{ lim?: number, wx?: number }} room lim: Platz über dem Kopf, wx: halbe Bühnenbreite (beides in Kopfradien)
 */
export function juggleStep(j, dt, room = {}) {
  if (room.lim) j.lim = Math.max(0.5, room.lim);
  if (room.wx) j.wx = room.wx;
  j.t += dt; j.nod += dt; j.ring += dt; j.sq = Math.max(0, j.sq - dt * 9); j.moodT -= dt;
  if (j.stop > 0) { j.stop -= dt; return; }
  j.vy += j.g * dt; j.x += j.vx * dt; j.y += j.vy * dt; j.a += dt * 2 + j.vx * dt * 2;
  if (j.mode !== "drop" && j.vy > 0 && Math.abs(j.x) < 1 + BALL_R * 0.5 && j.y >= contactY(j.x)) {
    j.y = contactY(j.x);
    if (j.mode === "auto") { launch(j, "auto"); j.nod = 0.05; j.sq = 0.5; }
    else if (j.pending) hit(j, j.pending);
    else {
      // nicht getippt: kleiner Hüpfer, beim zweiten Mal rutscht er vom Kopf. Vorbei ist es erst am Boden.
      j.vy = -Math.abs(j.vy) * 0.5;
      j.vx = (j.x >= 0 ? 1 : -1) * (j.passive ? 2.2 : 0.9);
      j.passive++; j.contactT = j.t;
      j.ev.push({ k: "bump" });
    }
  }
  if (j.y + BALL_R > FLOOR) {
    j.y = FLOOR - BALL_R;
    if (j.mode === "play") miss(j);
    j.vy = j.vy > 1.5 ? -j.vy * 0.45 : 0; j.vx *= 0.97;
  }
  if (Math.abs(j.x) > j.wx - BALL_R) { j.x = Math.sign(j.x) * (j.wx - BALL_R); j.vx = -j.vx * 0.6; }
  if (j.mode === "drop") { j.dropT += dt; if (j.dropT > BACK_TO_AUTO) respawn(j, "auto"); }
}
