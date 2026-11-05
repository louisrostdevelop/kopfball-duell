// Spielzustand anlegen: Match, Spieler, Ball, Anstoß
import { buildObstacles, moveObstacles, layoutsFor } from "../../content/layouts.js";
import { W, W0, setFieldW, REST, arenaById, rand } from "../../content/config.js";
import { pr } from "./base.js";
import { DEFAULT_RULES, baseBR, matchLen } from "./rules.js";

export function newMatch(o) {
  const ar = arenaById(o.arena);
  setFieldW(W0 * ((o.rules && o.rules.field) || 1));
  const st = {
    arena: ar.id, lv: o.levels || [1, 1], mod: o.mod || null, dur: o.dur || 90, pus: o.pus !== false, golden: o.golden !== false,
    rules: (() => { const r = { ...DEFAULT_RULES, ...(o.rules || {}) }; const ml = matchLen(r); if (ml.win) r.win = ml.win; return r; })(), train: !!o.train,
    t: o.dur || 90, ph: "cd", pt: 3, gold: false, el: 0,
    s: [0, 0],
    p: [mkPlayer(0, o.chars[0]), mkPlayer(1, o.chars[1])],
    b: null, pu: [], puT: rand(6, 9), puId: 1,
    wall: [0, 0], bigGoal: [0, 0], wind: { t: 0, dir: 1 }, jam: 0,
    ev: [], hs: 0, slow: 0,
    stats: [mkStats(), mkStats()],
    lastGoal: null, trail: 0, seq: 0,
  };
  if (st.rules.pu === "off") st.pus = false;
  // Hindernisse: "off", Layout-Nummer oder "rnd" (Zufall wird offline hier gezogen, online schon vorher im Menü)
  let oi = st.rules.obs;
  if (oi === "rnd") oi = Math.floor(Math.random() * Math.max(1, layoutsFor(ar.id).length));
  st.obsIdx = typeof oi === "number" ? oi : -1;
  st.obs = st.obsIdx >= 0 ? buildObstacles(ar.id, st.obsIdx) : [];
  moveObstacles(st.obs, 0, 0);
  placeSpawns(st);
  st.b = mkBall(st);
  return st;
}

export const mkStats = () => ({ bombs: 0, slides: 0, shots: 0, heads: 0, goals: 0, supers: 0, pus: 0, stomps: 0, headGoals: 0, superGoals: 0, longGoals: 0, lastSecGoals: 0, ownGoals: 0, maxTrail: 0 });

export function mkPlayer(i, ch) {
  return {
    i, ch, x: i ? W - Math.round(W * 0.283) : Math.round(W * 0.283), y: REST, vx: 0, vy: 0, dir: i ? -1 : 1, onG: true,
    kick: 0, kHit: false, kHeld: false, kPow: 1, chT: 0, charge: 0, lastJ: false, lastS: false,
    meter: 0, full: false, armed: 0, frz: 0, stun: 0, sc: 1, bigT: 0, miniT: 0, spdT: 0, jmpT: 0, fireNext: false, confT: 0, djT: 0, djUsed: false, kHitP: false, pushCD: 0, knock: 0,
    hc: 0, sc2: 0, mood: "", moodT: 0, emo: "", emoT: 0, land: 0,
    coy: 0, slick: false, bonkT: 0, jHeld: false, jRel: false, jT: 0, lastD: false, dBuf: 0, dAir: false, bombLock: false, stompImm: 0, bomb: 0, bombY: 0, bombRec: 0, slide: 0, slideDir: 1, slideCD: 0, slideHit: false, slideHitP: false, tripCD: 0,
  };
}

export function mkBall(st) {
  return { x: W / 2, y: 265, vx: rand(-40, 40), vy: 0, r: baseBR(st), a: 0, av: 0, fx: "", fxT: 0, fxO: -1, fxP: 0, fxK: 0, fxBX: 0, fxBY: 0, fxDX: 0, fxDY: 0, alpha: 1, grow: 1, lt: -1, ltk: "", ltx: 0, held: 0 };
}

export function kickoff(st) {
  const keep = st.p.map(p => ({ meter: p.meter, full: p.full, ch: p.ch, emo: p.emo, emoT: p.emoT }));
  st.p = [mkPlayer(0, keep[0].ch), mkPlayer(1, keep[1].ch)];
  st.p.forEach((p, i) => { p.meter = keep[i].meter; p.full = keep[i].full; p.emo = keep[i].emo; p.emoT = keep[i].emoT; });
  st.b = mkBall(st); st.pu = []; st.wall = [0, 0]; st.bigGoal = [0, 0]; st.wind = { t: 0, dir: 1 };
  placeSpawns(st);
}

// Startplätze nie in oder direkt an einem Block
export function placeSpawns(st) {
  for (const p of st.p) for (const o of st.obs || []) {
    if (o.t !== "plat" || !o.block) continue;
    const r = pr(p), gap = o.w / 2 + r + 20;
    if (Math.abs(p.x - o.x) < gap) p.x = p.x > o.x ? o.x + gap : o.x - gap;
  }
}
