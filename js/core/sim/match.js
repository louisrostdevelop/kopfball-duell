// Spielablauf: Echtzeit-Fortschritt, Schritt, Phasen, Vorhersage für den Online-Gast
import { moveObstacles } from "../../content/layouts.js";
import { STEP } from "../../content/config.js";
import { ballPhysics, unjam } from "./ball.js";
import { addMeter, ev } from "./base.js";
import { handleKick, kickPush } from "./kick.js";
import { movePlayer, playerVsPlayer, tickCosmetics } from "./player.js";
import { powerups } from "./powerups.js";
import { kickoff } from "./state.js";
import { handleSuper } from "./supers.js";
import { slideTrip, slideTripHit } from "./tricks.js";

// Echtzeit-Fortschritt inkl. Hit-Stop und Zeitlupe
export function advance(st, dt, inp, acc) {
  // Kurze Drücke (Sprung, unten) merken, bis ein Physikschritt sie gesehen hat
  if (!st.latch) st.latch = [{}, {}];
  inp.forEach((c, i) => { if (c && c.j) st.latch[i].j = true; if (c && c.d) st.latch[i].d = true; });
  if (st.hs > 0) { st.hs -= dt; return acc; }
  if (st.slow > 0) { st.slow -= dt; dt *= 0.28; }
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 12) {
    const use = n === 0 ? inp.map((c, i) => ({ ...(c || {}), j: (c && c.j) || st.latch[i].j, d: (c && c.d) || st.latch[i].d })) : inp;
    step(st, STEP, use); acc -= STEP; n++;
    if (n === 1) st.latch = [{}, {}];
    if (st.hs > 0) { acc = 0; break; }
  }
  return acc;
}

export function step(st, dt, inp) {
  st.el += dt;
  if (st.obs && st.obs.length) moveObstacles(st.obs, st.el, dt);
  if (st.ph === "end") { tickCosmetics(st, dt); return; }
  if (st.ph === "cd" || st.ph === "ko") {
    st.pt -= dt; tickCosmetics(st, dt);
    st.p.forEach((p, i) => movePlayer(st, p, inp[i] || {}, dt, true));
    if (st.pt <= 0) { st.ph = "play"; ev(st, { t: "go" }); }
    return;
  }
  if (st.ph === "goal") {
    st.pt -= dt; tickCosmetics(st, dt);
    // Ball und Spieler dürfen nachlaufen
    st.p.forEach(p => movePlayer(st, p, {}, dt, false));
    ballPhysics(st, dt, true);
    if (st.pt <= 0) {
      const won = st.rules.win && Math.max(st.s[0], st.s[1]) >= st.rules.win;
      if (st.gold || won || (!st.rules.win && st.t <= 0 && st.s[0] !== st.s[1])) { st.ph = "end"; ev(st, { t: "end" }); return; }
      kickoff(st); st.ph = "ko"; st.pt = 1.0; ev(st, { t: "ko" });
    }
    return;
  }
  // play
  if (!st.gold && !st.rules.win && !st.train) {
    const before = st.t; st.t -= dt;
    if (before > 10 && st.t <= 10) ev(st, { t: "ten" });
    if (st.t <= 0) {
      st.t = 0;
      if (st.s[0] === st.s[1] && st.golden) { st.gold = true; kickoff(st); st.ph = "cd"; st.pt = 2.2; ev(st, { t: "golden" }); return; }
      st.ph = "end"; ev(st, { t: "end" }); return;
    }
  }
  tickCosmetics(st, dt);
  const sfast = st.mod === "superfast" ? 2 : 1;
  st.p.forEach((p, i) => {
    const c = inp[i] || {};
    addMeter(st, p, 1.1 * dt * sfast);
    movePlayer(st, p, c, dt, false);
    handleKick(st, p, c, dt);
    handleSuper(st, p, c);
  });
  playerVsPlayer(st);
  st.p.forEach(p => kickPush(st, p));
  const trips = st.p.map(p => slideTripHit(st, p)); // erst beide prüfen, dann anwenden: keiner gewinnt nur wegen der Reihenfolge
  st.p.forEach((p, i) => { if (trips[i]) slideTrip(st, p); });
  const bsp = Math.hypot(st.b.vx, st.b.vy), sub = Math.max(1, Math.min(4, Math.ceil(bsp * dt / (st.b.r * 0.5))));
  for (let k = 0; k < sub; k++) ballPhysics(st, dt / sub, false);
  if (st.b.pw > 0) st.b.pw -= dt;
  unjam(st, dt);
  powerups(st, dt);
  ["wall", "bigGoal"].forEach(k => { st[k][0] = Math.max(0, st[k][0] - dt); st[k][1] = Math.max(0, st[k][1] - dt); });
  if (st.wind.t > 0) st.wind.t = Math.max(0, st.wind.t - dt);
}

// Für den Online-Gast: eigene Figur sofort lokal bewegen (ohne Ball)
export function predictPlayer(st, p, c, dt) {
  const locked = st.ph === "cd" || st.ph === "ko";
  movePlayer(st, p, st.ph === "goal" || st.ph === "end" ? {} : c, dt, locked);
  if (st.ph === "play") handleKick(st, p, c, dt);
}

export function skipCelebration(st) { if (st.ph === "goal" && st.pt > 0.3) st.pt = 0.3; }

export const REPLAY_START = 2.75, REPLAY_END = 0.35; // pt-Fenster, in dem die Wiederholung läuft
