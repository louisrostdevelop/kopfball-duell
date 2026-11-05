// Spielphysik. Läuft beim Host bzw. offline, der Gast bekommt nur Zustände + Events.
import { buildObstacles, moveObstacles, layoutsFor } from "./layouts.js";
import { W, W0, setFieldW, H, G, GOAL_W, GOAL_H, BAR_Y, BAR_T, HR, BR, SR, FOOT, REST, STEP, KS, charById, arenaById, PU_KEYS, clamp, rand } from "./config.js";

// Eigene Regeln (für Spiele gegen Freunde). Alle Werte optional.
export const DEFAULT_RULES = { kick: 1, bounce: 1, ball: 1, goal: 1, speed: 1, len: 90, field: 1, obs: "off", grav: 1, floor: "normal", pu: "normal", supers: true, weight: "normal", head: 1, win: 0 };
// "len": Zahl = Spielzeit in Sekunden, "w3"/"w5" = Erster bis N Tore
export function matchLen(r) { const l = (r && r.len) ?? 90; if (typeof l === "string" && l[0] === "w") return { dur: 120, win: +l.slice(1) }; return { dur: +l || 90, win: (r && r.win) || 0 }; }
const WEIGHT = { light: { bounce: 0.18, grav: 0.78, kick: 1.12, drag: 0.7 }, normal: { bounce: 0, grav: 1, kick: 1, drag: 1 }, heavy: { bounce: -0.22, grav: 1.25, kick: 0.86, drag: 1.4 } };
const wgt = st => WEIGHT[st.rules.weight] || WEIGHT.normal;
const kickMul = st => wgt(st).kick * (st.rules.kick || 1);
// Bewegungs-Feintuning an einer Stelle
export const MOVE = {
  coyote: 0.08,      // so lange nach dem Verlassen des Bodens darf man noch springen
  cutMin: 0.06,      // frühestens hier wird ein kurzer Sprung abgebremst
  cut: 0.45,         // Restgeschwindigkeit beim Abbremsen (kurz tippen = halber Sprung)
  apexG: 0.62,       // weniger Schwerkraft am Scheitelpunkt, solange gehalten wird
  fallG: 1.15,       // etwas schneller fallen als steigen
  turn: 1.8,         // Richtungswechsel greift schneller
  stopG: 1.2,        // ohne Eingabe schneller zum Stehen
  bombV: 1750,       // Fallgeschwindigkeit der Arschbombe
  bombMinH: 40,      // Mindesthöhe über dem Boden
  bombFull: 230,     // ab dieser Fallstrecke volle Wucht
  bombRec: 0.1,      // kurzes Abfedern nach der Landung
  slideT: 0.3,       // Dauer der Grätsche
  slideV: 1.6,       // Starttempo relativ zum Laufen
  slideCD: 0.55,     // Pause bis zur nächsten Grätsche
  tripStun: 0.35,    // Gegner stolpert kurz
  tripCD: 1.2,       // so lange kann derselbe Gegner nicht wieder umgegrätscht werden
};
// Ball-Tempo beim Schuss: Feintuning an einer Stelle (Varianten werden per Simulation verglichen)
export const KICK = {
  carry: 0.4,         // Anteil des Ankunftstempos, den ein Schuss mitnimmt (Tempo stapelt sich)
  carryMode: "add",   // "add" = oben drauf, "max" = mindestens so schnell wie angekommen, "none" = altes Verhalten
  memDecay: 8,        // wie schnell das Tempo-Gedächtnis (Tempo vor dem Abprall) verblasst
  memClassify: true,  // Lupfer/Strahl nach Tempo vor dem Abprall statt nach dem gebremsten Tempo
  lobSpeed: 300,      // darunter gilt ein Ball am Boden als ruhig
  hsMode: "none",     // Standbild: "all" = jeder saubere Treffer, "hard" = nur sehr harte, "none"
  softCap: true,      // Tempo weich an die Obergrenze heranführen statt hart abschneiden
  driveVy: 430, driveCharge: 320,
  tap: 1350,          // Grundtempo eines sauberen Tipp-Schusses
  chargeAdd: 1100,    // so viel bringt volles Aufladen zusätzlich
  cap: 2700,          // Obergrenze fürs Balltempo (vorher 1900)
  swing: 0.18,        // Dauer der Schussbewegung (vorher 0.24)
  hitFrom: 0,         // Treffer zählt ab dem Moment des Loslassens (vorher erst nach 0.06 s)
  power: 1750,        // ab diesem Tempo gilt ein Schuss als Hammer (Effekte, kurzes Standbild)
  rollFric: 14,       // Rollreibung am Boden (x (1 - Arena-Roll) pro Sekunde)
};
const bombPow = p => clamp((p.y - p.bombY) / MOVE.bombFull, 0.25, 1);

export function newMatch(o) {
  const ar = arenaById(o.arena);
  setFieldW(W0 * ((o.rules && o.rules.field) || 1));
  const st = {
    arena: ar.id, mod: o.mod || null, dur: o.dur || 90, pus: o.pus !== false, golden: o.golden !== false,
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
const mkStats = () => ({ bombs: 0, slides: 0, shots: 0, heads: 0, goals: 0, supers: 0, pus: 0, stomps: 0, headGoals: 0, superGoals: 0, longGoals: 0, lastSecGoals: 0, ownGoals: 0, maxTrail: 0 });
function mkPlayer(i, ch) {
  return {
    i, ch, x: i ? W - Math.round(W * 0.283) : Math.round(W * 0.283), y: REST, vx: 0, vy: 0, dir: i ? -1 : 1, onG: true,
    kick: 0, kHit: false, kHeld: false, kPow: 1, chT: 0, charge: 0, lastJ: false, lastS: false,
    meter: 0, full: false, armed: 0, frz: 0, stun: 0, sc: 1, bigT: 0, miniT: 0, spdT: 0, jmpT: 0, fireNext: false, confT: 0, djT: 0, djUsed: false, kHitP: false, pushCD: 0, knock: 0,
    hc: 0, sc2: 0, mood: "", moodT: 0, emo: "", emoT: 0, land: 0,
    coy: 0, slick: false, bonkT: 0, jHeld: false, jRel: false, jT: 0, lastD: false, dBuf: 0, dAir: false, bombLock: false, stompImm: 0, bomb: 0, bombY: 0, bombRec: 0, slide: 0, slideDir: 1, slideCD: 0, slideHit: false, slideHitP: false, tripCD: 0,
  };
}
function mkBall(st) {
  return { x: W / 2, y: 265, vx: rand(-40, 40), vy: 0, r: baseBR(st), a: 0, av: 0, fx: "", fxT: 0, fxO: -1, fxP: 0, fxK: 0, fxBX: 0, fxBY: 0, fxDX: 0, fxDY: 0, alpha: 1, grow: 1, lt: -1, ltk: "", ltx: 0, held: 0 };
}
const baseBR = st => BR * st.rules.ball * (st.mod === "bigball" ? 1.55 : 1);
export const gMul = st => arenaById(st.arena).g * (st.mod === "lowgrav" ? 0.55 : 1) * st.rules.grav;
export const barY = (st, side) => G - GOAL_H * (st.rules ? st.rules.goal : 1) - (st.bigGoal[side] > 0 ? 60 : 0);
export const pr = p => HR * p.sc;
export function shoePos(p) {
  if (p.slide > 0) return { x: p.x + p.slideDir * 50 * KS * p.sc, y: p.y + (FOOT + 4) * p.sc, k: 0 };
  if (p.bomb) return { x: p.x - p.dir * 8 * KS * p.sc, y: p.y + FOOT * 0.82 * p.sc, k: 0 };
  const pr0 = p.kick > 0 ? 1 - p.kick / KICK.swing : 1;
  const k = p.kick > 0 ? (pr0 < 0.3 ? Math.sin(pr0 / 0.3 * Math.PI / 2) : Math.cos((pr0 - 0.3) / 0.7 * Math.PI / 2)) : 0;
  const wind = p.kHeld && p.charge > 0 ? -p.charge * 0.6 : 0;
  return { x: p.x + p.dir * (16 + 34 * k + 22 * wind) * KS * p.sc, y: p.y + (FOOT - 20 * KS * k) * p.sc, k };
}
const ev = (st, e) => { st.ev.push(e); };

export function kickoff(st) {
  const keep = st.p.map(p => ({ meter: p.meter, full: p.full, ch: p.ch, emo: p.emo, emoT: p.emoT }));
  st.p = [mkPlayer(0, keep[0].ch), mkPlayer(1, keep[1].ch)];
  st.p.forEach((p, i) => { p.meter = keep[i].meter; p.full = keep[i].full; p.emo = keep[i].emo; p.emoT = keep[i].emoT; });
  st.b = mkBall(st); st.pu = []; st.wall = [0, 0]; st.bigGoal = [0, 0]; st.wind = { t: 0, dir: 1 };
  placeSpawns(st);
}
// Startplätze nie in oder direkt an einem Block
function placeSpawns(st) {
  for (const p of st.p) for (const o of st.obs || []) {
    if (o.t !== "plat" || !o.block) continue;
    const r = pr(p), gap = o.w / 2 + r + 20;
    if (Math.abs(p.x - o.x) < gap) p.x = p.x > o.x ? o.x + gap : o.x - gap;
  }
}

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
    st.p.forEach((p, i) => movePlayer(st, p, {}, dt, false));
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

function tickCosmetics(st, dt) {
  st.p.forEach(p => {
    if (p.emoT > 0) p.emoT -= dt; else p.emo = "";
    if (p.moodT > 0) p.moodT -= dt; else p.mood = "";
    if (p.land > 0) p.land -= dt;
  });
}
function addMeter(st, p, v) {
  if (p.armed > 0 || p.full || !st.rules.supers) return;
  p.meter = Math.min(100, p.meter + v);
  if (p.meter >= 100) { p.full = true; ev(st, { t: "full", i: p.i }); }
}

function movePlayer(st, p, c, dt, frozenPhase) {
  const ar = arenaById(st.arena), ch = charById(p.ch);
  // Timer
  p.hc = Math.max(0, p.hc - dt); p.sc2 = Math.max(0, p.sc2 - dt); p.pushCD = Math.max(0, p.pushCD - dt); p.knock = Math.max(0, p.knock - dt);
  ["bigT", "miniT", "spdT", "jmpT", "confT", "djT"].forEach(k => { if (p[k] > 0) p[k] = Math.max(0, p[k] - dt); });
  if (p.frz > 0) p.frz = Math.max(0, p.frz - dt);
  if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
  if (p.armed > 0) { p.armed -= dt; if (p.armed <= 0) { p.armed = 0; p.meter = 60; ev(st, { t: "disarm", i: p.i }); } }
  let tsc = p.bigT > 0 ? 1.35 : p.miniT > 0 ? 0.7 : 1;
  if (st.mod === "minihead") tsc *= 0.78;
  tsc *= st.rules.head;
  p.sc += (tsc - p.sc) * Math.min(1, dt * 8);
  const r = pr(p);
  const locked = frozenPhase || p.frz > 0 || p.stun > 0;
  const turbo = (st.mod === "turbo" ? 1.22 : 1) * st.rules.speed;
  const sp = 505 * ch.spd * ar.spd * turbo * (p.spdT > 0 ? 1.35 : 1) * (p.miniT > 0 ? 1.08 : 1) * (p.kHeld && p.charge > 0.2 ? 0.9 : 1);
  const dirIn = ((c.r ? 1 : 0) - (c.l ? 1 : 0)) * (p.confT > 0 ? -1 : 1); // verwirrt: links/rechts vertauscht
  const grip = ar.grip * (st.rules.floor === "ice" ? 0.16 : 1) * (p.onG && p.slick ? 0.2 : 1);
  const rest = G - (FOOT + SR) * p.sc;
  // Unten wird kurz gepuffert: direkt nach einem Schuss oder kurz nach dem Absprung geht der Druck nicht verloren.
  // Ein Druck in der Luft bleibt eine Bombe, ein Druck am Boden eine Grätsche.
  if (c.d && !p.lastD) { p.dBuf = 0.16; p.dAir = !p.onG; }
  p.lastD = !!c.d;
  if (p.dBuf > 0) p.dBuf = Math.max(0, p.dBuf - dt);
  if (p.dBuf > 0 && p.dAir === p.onG) p.dBuf = 0;
  const dPress = p.dBuf > 0;
  if (p.stompImm > 0) p.stompImm -= dt;
  p.slideCD = Math.max(0, p.slideCD - dt); p.bombRec = Math.max(0, p.bombRec - dt); p.tripCD = Math.max(0, p.tripCD - dt);
  if (p.onG) p.coy = MOVE.coyote; else p.coy = Math.max(0, p.coy - dt);
  if ((locked || !p.onG) && p.slide > 0) endSlide(p);
  // Unten am Boden: Grätsche (Richtung = Laufrichtung, sonst Blickrichtung)
  if (!locked && dPress && p.onG && p.slide <= 0 && p.slideCD <= 0 && !(p.kick > 0.1)) {
    p.slide = MOVE.slideT; p.slideDir = dirIn || p.dir; p.slideHit = false; p.slideHitP = false; p.dBuf = 0;
    p.vx = p.slideDir * Math.max(Math.abs(p.vx) * (Math.sign(p.vx) === p.slideDir ? 1 : 0), sp * MOVE.slideV);
    if (p.kHeld) { p.kHeld = false; p.charge = 0; p.chT = 0; }
    st.stats[p.i].slides++;
    ev(st, { t: "slide", i: p.i, x: p.x, y: G, dir: p.slideDir });
  }
  // Unten in der Luft: Arschbombe, sofort und ohne Halt
  else if (!locked && dPress && !p.onG && !p.bomb && !p.bombLock && p.slide <= 0 && p.y < rest - MOVE.bombMinH) {
    p.bomb = 1; p.bombY = p.y; p.vy = Math.max(p.vy, MOVE.bombV); p.vx *= 0.4; p.jHeld = false; p.dBuf = 0;
    if (p.kHeld) { p.kHeld = false; p.charge = 0; p.chT = 0; }
    st.stats[p.i].bombs++;
    ev(st, { t: "bomb", i: p.i, x: p.x, y: p.y });
  }
  // Waagerecht
  if (p.slide > 0) {
    p.slide -= dt;
    const tgt = p.slideDir * sp * 0.45, dec = 1500 * Math.max(0.25, grip) * dt, d = tgt - p.vx;
    p.vx += Math.abs(d) < dec ? d : Math.sign(d) * dec;
    if (p.slide <= 0) endSlide(p);
  } else {
    const want = locked ? 0 : dirIn * sp;
    let acc = (p.onG ? 6400 : 4600) * grip * (p.frz > 0 ? 0.2 : 1) * (p.knock > 0 ? 0.12 : 1);
    if (want !== 0 && p.vx !== 0 && Math.sign(want) !== Math.sign(p.vx) && p.onG && p.knock <= 0 && grip >= 0.5) acc *= MOVE.turn;
    else if (want === 0) acc *= MOVE.stopG;
    if (p.bomb) acc *= 0.3;
    if (p.bombRec > 0) acc *= 0.5;
    const d = want - p.vx, mx = acc * dt;
    p.vx += Math.abs(d) < mx ? d : Math.sign(d) * mx;
  }
  // Springen: halten = voller Sprung, kurz tippen = halber
  const gm0 = gMul(st), jv = -1010 * ch.jmp * (p.jmpT > 0 ? 1.25 : 1) * Math.min(Math.pow(gm0, 0.25), Math.sqrt(1.5 * gm0)); // weniger Schwerkraft = höhere Sprünge (max. 1,5-fach)
  const jPress = !!c.j && !p.lastJ;
  if (!locked && c.j && (p.onG || p.coy > 0) && !p.bomb && p.vy >= -50) {
    if (p.slide > 0) endSlide(p);
    p.vy = jv; p.onG = false; p.coy = 0; p.jHeld = true; p.jRel = false; p.jT = 0;
    ev(st, { t: "jump", i: p.i, x: p.x, y: p.y + (FOOT + SR) * p.sc });
  } else if (!locked && jPress && !p.onG && p.djT > 0 && !p.djUsed && !p.bomb) {
    p.vy = jv * 0.85; p.djUsed = true; p.jHeld = true; p.jRel = false; p.jT = 0;
    ev(st, { t: "jump", i: p.i, x: p.x, y: p.y + (FOOT + SR) * p.sc, dbl: true });
  }
  p.lastJ = !!c.j;
  if (p.jHeld) {
    p.jT += dt;
    if (!c.j) p.jRel = true;
    if (p.jRel && p.jT >= MOVE.cutMin && p.vy < 0) { p.vy *= MOVE.cut; p.jHeld = false; }
    if (p.vy >= 0) p.jHeld = false;
  }
  // Schwerkraft: am Scheitel kurz schweben, beim Fallen etwas schneller
  let gm = 1;
  if (!p.bomb) { if (p.vy > 0) gm = MOVE.fallG; else if (p.jHeld && p.vy > -220) gm = MOVE.apexG; }
  p.vy += 3000 * gMul(st) * gm * dt;
  if (p.bomb) p.vy = Math.max(p.vy, MOVE.bombV);
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.y >= rest) {
    if (!p.onG) {
      if (p.bomb) bombLand(st, p);
      else if (p.vy > 500) { ev(st, { t: "land", i: p.i, x: p.x, y: G, v: p.vy }); p.land = 0.15; }
    }
    p.y = rest; p.vy = 0; p.onG = true; p.djUsed = false; p.jHeld = false; p.bombLock = false; p.slick = false;
  } else if (p.onG && p.y < rest - 1) {
    // steht evtl. auf Latte
    p.onG = onBar(st, p);
    if (!p.onG && p.vy === 0) p.onG = false;
  }
  p.x = clamp(p.x, r, W - r);
  // Latte: von unten Kopf stoßen, von oben drauf landen
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side), x0 = side ? W - GOAL_W - 6 : 0, x1 = side ? W : GOAL_W + 6;
    if (p.x + r * 0.7 < x0 || p.x - r * 0.7 > x1) continue;
    const foot = p.y + (FOOT + SR) * p.sc;
    if (p.vy >= 0 && foot >= by - BAR_T / 2 && foot - p.vy * dt <= by - BAR_T / 2 + 2) {
      if (p.bomb) bombLand(st, p);
      p.y = by - BAR_T / 2 - (FOOT + SR) * p.sc; p.vy = 0; p.onG = true; p.jHeld = false; p.bombLock = false; continue;
    }
    if (p.y - r < by + BAR_T / 2 && p.y > by) { p.y = by + BAR_T / 2 + r; if (p.vy < 0) p.vy = 0; }
  }
  if (st.obs && st.obs.length) obsPlayer(st, p, dt, rest);
}
// Spieler gegen Plattformen (draufstehen, von unten anstoßen, seitlich abprallen) und Bumper
function obsPlayer(st, p, dt, rest) {
  const r = pr(p), foot = (FOOT + SR) * p.sc;
  p.bonkT = Math.max(0, p.bonkT - dt);
  for (const o of st.obs) {
    if (o.t === "plat") {
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y, y1 = o.y + o.h;
      const L = p.x - r * 0.8, R = p.x + r * 0.8, top = p.y - r, bot = p.y + foot;
      if (R <= x0 || L >= x1) continue;
      // Landen / Stehen (auch auf bewegten Plattformen)
      if (p.vy >= o.vy - 1 && bot >= y0 - 0.5 && bot - (p.vy - o.vy) * dt <= y0 + 6) {
        if (!p.onG && p.bomb) bombLand(st, p);
        else if (!p.onG && p.vy > 500) { ev(st, { t: "land", i: p.i, x: p.x, y: y0, v: p.vy }); p.land = 0.15; }
        p.y = y0 - foot; p.vy = 0; p.onG = true; p.djUsed = false; p.jHeld = false; p.bombLock = false; p.slick = o.slick;
        p.x += o.vx * dt;
        continue;
      }
      if (bot <= y0 || top >= y1) continue;
      // Kantenhilfe: Fuß nur knapp unter der Oberkante -> hochziehen statt abprallen (fühlt sich fair an, keiner bleibt an der Kante hängen)
      if (bot - y0 < 30 && p.vy > -400) { p.y = y0 - foot; p.vy = Math.min(p.vy, 0); p.onG = true; p.jHeld = false; p.bombLock = false; p.slick = o.slick; if (p.bomb) bombLand(st, p); continue; }
      // Überlappung auflösen: kleinste Eindringtiefe, aber nie in den Boden drücken
      const down = y1 - top, left = R - x0, right = x1 - L;
      const canDown = p.y + down <= rest + 0.5;
      if (canDown && down < left && down < right) {
        p.y += down;
        if (p.vy < o.vy) { if (p.vy < -250 && p.bonkT <= 0) { ev(st, { t: "bonk", i: p.i, x: p.x, y: y1 }); p.bonkT = 0.3; } p.vy = Math.max(0, o.vy); p.jHeld = false; }
      } else {
        // seitlich raus, aber nie mit einem Ruck (z. B. großer Kopf unter dem Aufzug wird langsam rausgeschoben)
        const lim = canDown ? 1e9 : 10;
        if (left < right) { p.x -= Math.min(left, lim); if (p.vx > o.vx) p.vx = o.vx; }
        else { p.x += Math.min(right, lim); if (p.vx < o.vx) p.vx = o.vx; }
      }
    } else if (o.t === "bump") {
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), min = r + o.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      p.x = o.x + nx * min; p.y = Math.min(o.y + ny * min, rest);
      const vn = (p.vx - o.vx) * nx + (p.vy - o.vy) * ny;
      if (vn < 0) { p.vx -= 1.5 * vn * nx; p.vy -= 1.5 * vn * ny; }
      if (ny < -0.6) { p.vy = Math.min(p.vy, -650); p.onG = false; p.coy = 0; p.jHeld = false; p.bomb = 0; } // oben drauf = Trampolin
      if (p.slide > 0) endSlide(p);
    }
  }
  p.x = clamp(p.x, r, W - r);
}
function endSlide(p) { p.slide = 0; p.slideCD = MOVE.slideCD; }
function bombLand(st, p) {
  const k = bombPow(p);
  p.bomb = 0; p.bombRec = MOVE.bombRec; p.land = 0.12 + 0.1 * k;
  ev(st, { t: "pound", i: p.i, x: p.x, y: p.y + (FOOT + SR) * p.sc, k });
}
function onBar(st, p) {
  const foot = p.y + (FOOT + SR) * p.sc, r = pr(p);
  if (st.obs) for (const o of st.obs) if (o.t === "plat" && p.x + r * 0.8 > o.x - o.w / 2 && p.x - r * 0.8 < o.x + o.w / 2 && Math.abs(foot - o.y) < 4) return true;
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side), x0 = side ? W - GOAL_W - 6 : 0, x1 = side ? W : GOAL_W + 6;
    if (p.x + r * 0.7 >= x0 && p.x - r * 0.7 <= x1 && Math.abs(foot - (by - BAR_T / 2)) < 3) return true;
  }
  return false;
}

function swingNow(st, p) {
  p.kick = KICK.swing; p.kHit = false; p.kHitP = false; p.kPow = 1 + p.charge * 0.75;
  ev(st, { t: "swing", i: p.i, pow: p.kPow });
}
function handleKick(st, p, c, dt) {
  // Halten = aufladen (der Ball verhält sich dabei ganz normal), Loslassen = Schuss, und zwar sofort:
  // die Schussbewegung trifft schon im selben Physikschritt, in dem losgelassen wird.
  const can = p.frz <= 0 && p.stun <= 0 && !(p.slide > 0) && !p.bomb;
  if (p.kick > 0) p.kick = Math.max(0, p.kick - dt);
  if (can && c.k && !p.kHeld) {
    p.kHeld = true; p.chT = 0; p.charge = 0;
  } else if (c.k && p.kHeld && can) {
    p.chT += dt;
    const before = p.charge;
    p.charge = clamp((p.chT - 0.05) / 0.3, 0, 1); // voll nach 0,35 s
    if (before < 1 && p.charge >= 1) ev(st, { t: "charged", i: p.i });
  } else if (!c.k && p.kHeld) {
    p.kHeld = false;
    if (can) swingNow(st, p);
    p.charge = 0; p.chT = 0;
  }
  if (!can) { p.kHeld = false; p.charge = 0; }
}
function handleSuper(st, p, c) {
  const press = c.s && !p.lastS; p.lastS = !!c.s;
  if (!press || p.frz > 0 || p.stun > 0) return;
  if (p.full && p.armed <= 0) {
    p.full = false; p.meter = 0;
    const b = st.b;
    if (Math.hypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 90) fireSuper(st, p, charById(p.ch).super);
    else { p.armed = 4; ev(st, { t: "arm", i: p.i }); }
  }
}

// Fuß trifft den Gegner: dezenter Schubser, abhängig von der Aufladung
function kickPush(st, p) {
  if (!(p.kick > KICK.hitFrom) || p.kHitP) return;
  const o = st.p[1 - p.i];
  if (o.pushCD > 0) return;
  const fx = p.x + p.dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
  const ro = pr(o), so = shoePos(o);
  const hitHead = Math.hypot(o.x - fx, o.y - fy) < ro + 26 * KS * p.sc;
  const hitFoot = Math.hypot(so.x - fx, so.y - fy) < SR * o.sc + 30 * KS * p.sc;
  if (!(hitHead || hitFoot) || (o.x - p.x) * p.dir < -10) return;
  p.kHitP = true;
  const c = (p.kPow - 1) / 0.75;
  const big = o.bigT > 0 ? 0.6 : o.miniT > 0 ? 1.3 : 1; // schwerer Kopf lässt sich schwerer schubsen
  o.vx = p.dir * (320 + 160 * c) * big;
  o.vy = Math.min(o.vy, -(110 + 140 * c) * big); o.onG = false;
  o.knock = 0.22 + 0.08 * c; o.coy = 0; o.jHeld = false;
  if (o.slide > 0) endSlide(o);
  o.pushCD = 0.55;
  if (o.kHeld) { o.kHeld = false; o.charge = 0; o.chT = 0; } // Aufladen wird unterbrochen
  ev(st, { t: "bump", i: p.i, x: (fx + o.x) / 2, y: (fy + o.y) / 2, pow: 1 + c });
}
// Ball klemmt zwischen beiden Spielern: nach kurzer Zeit springt er fair nach oben raus
function unjam(st, dt) {
  const b = st.b, [a, c] = st.p;
  const near = p => Math.hypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 10 || Math.hypot(b.x - shoePos(p).x, b.y - shoePos(p).y) < SR * p.sc + b.r + 10;
  const between = (b.x - a.x) * (b.x - c.x) < 0;
  // nach Position messen (die Geschwindigkeit kann beim Einklemmen riesig sein, obwohl sich nichts bewegt)
  if (near(a) && near(c) && between && !b.fx) {
    if (st.jamX === undefined || Math.hypot(b.x - st.jamX, b.y - st.jamY) > 34) { st.jamX = b.x; st.jamY = b.y; st.jam = 0; }
    else st.jam += dt;
  } else { st.jam = 0; st.jamX = undefined; }
  if (st.jam > 0.7) {
    st.jamX = undefined;
    st.jam = 0;
    b.vy = -900; b.vx = (Math.random() < 0.5 ? -1 : 1) * rand(220, 300); b.y -= 6; b.ghost = 0.3;
    ev(st, { t: "pop", x: b.x, y: b.y });
  }
}

// Spieler gegen Spieler (inkl. Draufspringen)
function playerVsPlayer(st) {
  const [a, b] = st.p, ra = pr(a), rb = pr(b);
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = ra + rb;
  if (d >= min || d === 0) return;
  const top = dy < -min * 0.55 ? b : dy > min * 0.55 ? a : null;
  if (top && top.vy > 150) {
    const bot = top === a ? b : a;
    const bk = top.bomb ? bombPow(top) : 0, bombed = !!top.bomb;
    top.vy = bombed ? -620 : -820; top.onG = false; top.bomb = 0; top.jHeld = false; top.coy = 0; top.bombLock = true;
    top.vx = (Math.sign(top.x - bot.x) || -top.dir) * 240; // vom Kopf abprallen, nicht drauf sitzen bleiben
    top.y = bot.y - (pr(top) + pr(bot)) * 1.01;
    if (top.sc2 <= 0 && !(bot.stompImm > 0)) {
      const stn = bombed ? 0.45 + 0.4 * bk : 0.55;
      bot.stun = Math.max(bot.stun, stn); top.sc2 = 0.8;
      bot.stompImm = stn + 1.1; // danach eine Weile nicht wieder betäubbar: Zeit zum Wegkommen
      if (bot.kHeld) { bot.kHeld = false; bot.charge = 0; bot.chT = 0; }
      st.stats[top.i].stomps++;
      ev(st, { t: "stomp", i: top.i, x: bot.x, y: bot.y - pr(bot), bomb: bombed, k: bk });
    }
    return;
  }
  const push = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
  a.x = clamp(a.x - push, ra, W - ra); b.x = clamp(b.x + push, rb, W - rb);
}

// Ball gegen Plattformen und Bumper
function obsBall(st, b, dt) {
  const e = clamp(0.62 * (st.rules.bounce || 1), 0.35, 0.92);
  if (b.fx && b.fx !== "bouncy" && b.fx !== "giant") return; // Spezialschüsse gehen durch Hindernisse
  for (const o of st.obs) {
    if (o.t === "plat") {
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y, y1 = o.y + o.h;
      const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1), dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if (d >= b.r) continue;
      let nx, ny;
      if (d === 0) { nx = 0; ny = b.y < (y0 + y1) / 2 ? -1 : 1; } else { nx = dx / d; ny = dy / d; }
      b.x = cx + nx * b.r; b.y = cy + ny * b.r;
      const rvx = b.vx - o.vx, rvy = b.vy - o.vy, dot = rvx * nx + rvy * ny;
      if (dot < 0) {
        b.vx -= (1 + e) * dot * nx; b.vy -= (1 + e) * dot * ny;
        if (-dot > 260) ev(st, { t: "obs", x: b.x, y: b.y, v: -dot, k: "plat" });
      }
      // liegt der Ball oben drauf, rollt er zur näheren Kante (nie liegen bleiben)
      if (ny < -0.7 && Math.abs(b.vx - o.vx) < 260) b.vx += (Math.sign(b.x - o.x) || (st.el % 2 < 1 ? 1 : -1)) * 900 * dt;
    } else if (o.t === "bump") {
      const hit = collideCircle(b, o.x, o.y, o.r + b.r, o.vx, o.vy, 0.9);
      if (!hit || hit.imp <= 0) continue;
      const sp = Math.hypot(b.vx, b.vy), want = Math.min(maxBall(st), Math.max(sp * o.k, 650 * o.k));
      if (sp > 0) { b.vx *= want / sp; b.vy *= want / sp; }
      ev(st, { t: "obs", x: b.x - hit.nx * b.r, y: b.y - hit.ny * b.r, v: want, k: "bump" });
    }
  }
}

// Arschbombe trifft den Ball von oben
function bombBall(st, b, p) {
  const r = pr(p), bottom = p.y + (FOOT + SR) * p.sc, dxb = b.x - p.x, reach = r * 0.95 + b.r * 0.6;
  if (Math.abs(dxb) > reach || b.y < p.y + r * 0.3 || b.y - b.r > bottom + 4 || b.y + b.r < p.y) return false;
  const k = bombPow(p);
  if (b.y > p.y) p.y = Math.min(p.y, b.y - b.r - (FOOT + SR) * p.sc - 1); // sauber auf den Ball setzen, nicht hinein
  p.bomb = 0; p.vy = -(360 + 200 * k); p.onG = false; p.jHeld = false; p.coy = 0; p.bombLock = true;
  b.nh = p.i; b.nhT = 0.22;
  if (!touch(st, b, p, "bomb")) return true;
  const ox = clamp(dxb / reach, -1, 1), flat = Math.min(1, Math.abs(ox) * 1.5), km = kickMul(st);
  const side = Math.abs(ox) < 0.12 ? p.dir : Math.sign(ox);
  if (b.y + b.r >= G - 16) {
    // gequetscht: seitlich raus, je weiter vom Rand getroffen, desto flacher und schneller
    b.vx = side * (650 + 850 * k) * (0.3 + 0.7 * Math.max(0.15, flat)) * km;
    b.vy = -(420 + 560 * k) * (1 - 0.55 * flat) * km;
    b.y = G - b.r - 1;
    ev(st, { t: "squash", i: p.i, x: b.x, y: G - b.r, k, flat });
  } else {
    // in der Luft: runter geschmettert
    b.vy = Math.max(b.vy, 0) + (700 + 600 * k) * km; b.vx = b.vx * 0.5 + ox * 300;
    ev(st, { t: "smash", i: p.i, x: b.x, y: b.y, k });
  }
  b.held = 0.05;
  st.hs = Math.max(st.hs, 0.02 + 0.015 * k);
  addMeter(st, p, 6 * (st.mod === "superfast" ? 2 : 1));
  return true;
}
// Grätsche spitzelt den Ball flach weg
function slideBall(st, b, p) {
  const f = shoePos(p);
  if (b.y < p.y + (FOOT + SR) * p.sc - 110 || Math.hypot(b.x - f.x, b.y - f.y) > SR * p.sc * 1.4 + b.r) return false;
  p.slideHit = true;
  b.nh = p.i; b.nhT = 0.12;
  if (!touch(st, b, p, "slide")) return true;
  const v = clamp(380 + Math.abs(p.vx) * 0.75, 420, 1050) * kickMul(st);
  b.vx = p.slideDir * v; b.vy = -220; b.y = Math.min(b.y, G - b.r - 1);
  p.vx *= 0.6;
  ev(st, { t: "poke", i: p.i, x: b.x, y: b.y, v });
  return true;
}
// Grätsche trifft den Gegner am Boden: kurz ins Stolpern, mehr nicht
function slideTripHit(st, p) {
  if (!(p.slide > 0) || p.slideHitP) return false;
  const o = st.p[1 - p.i];
  if (!o.onG || o.tripCD > 0) return false;
  const f = shoePos(p);
  if (Math.abs((o.y + (FOOT + SR) * o.sc) - (p.y + (FOOT + SR) * p.sc)) > 30) return false; // gleiche Höhe (nicht auf der Latte)
  return (o.x - p.x) * p.slideDir >= 0 && Math.abs(o.x - f.x) <= pr(o) * 0.8 + SR * p.sc;
}
function slideTrip(st, p) {
  const o = st.p[1 - p.i];
  p.slideHitP = true; p.vx *= 0.4;
  o.stun = Math.max(o.stun, MOVE.tripStun); o.tripCD = MOVE.tripCD;
  o.vx = p.slideDir * 260; o.vy = -240; o.onG = false; o.jHeld = false; o.coy = 0;
  if (o.slide > 0) endSlide(o);
  if (o.kHeld) { o.kHeld = false; o.charge = 0; o.chT = 0; }
  ev(st, { t: "trip", i: p.i, x: o.x, y: G - 20 });
}

// Ball
function maxBall(st) { return KICK.cap * arenaById(st.arena).maxB * (st.mod === "turbo" ? 1.15 : 1) * Math.max(1, st.rules.speed) * Math.max(1, st.rules.kick || 1); }

function ballPhysics(st, dt, postGoal) {
  const b = st.b, ar = arenaById(st.arena);
  // Größe
  const tr = baseBR(st) * (b.fx === "giant" || b.grow > 1 ? b.grow : 1);
  if (b.fx !== "giant" && b.grow > 1) b.grow = Math.max(1, b.grow - dt * 0.8);
  b.r += (tr - b.r) * Math.min(1, dt * 10);
  const fxGrav = fxGravity(b);
  // Tempo-Gedächtnis: wie schnell war der Ball kurz vor einer Berührung?
  b.vmem = Math.max(Math.hypot(b.vx, b.vy), (b.vmem || 0) * Math.exp(-dt * KICK.memDecay));
  if (b.fx && !postGoal) superStep(st, b, dt);
  b.vy += 1750 * gMul(st) * fxGrav * wgt(st).grav * dt;
  if (st.wind && st.wind.t > 0 && !b.fx) b.vx += st.wind.dir * 300 * dt;
  b.vx *= 1 - ar.ballDrag * wgt(st).drag * (st.rules.floor === "ice" && b.y + b.r > G - 2 ? 0.3 : 1) * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.av = b.vx / b.r; b.a += b.av * dt;
  if (b.held > 0) b.held -= dt;
  if (b.nhT > 0) b.nhT -= dt;

  if (b.ghost > 0) b.ghost -= dt;
  if (!postGoal && !(b.ghost > 0)) {
    st.p.forEach(p => ballVsPlayer(st, b, p, dt));
  }
  // Boden
  if (b.y + b.r > G && b.vy < 0) b.y = G - b.r; // gerade weggeschossen: nur aus dem Boden heben
  if (b.y + b.r > G && b.vy >= 0) {
    const imp = b.vy;
    b.y = G - b.r;
    const bounce = b.fx === "bouncy" ? 1.06 : clamp((ar.bounce + wgt(st).bounce) * (st.rules.bounce || 1), 0.2, 0.95);
    b.vy = -b.vy * bounce;
    // Aufprall kostet einmal etwas Tempo, Rollen nur wenig pro Sekunde (vorher wurde jeder Schritt wie ein Aufprall gebremst)
    const roll = st.rules.floor === "ice" ? 0.995 : ar.roll;
    if (imp > 140) b.vx *= roll; else b.vx *= 1 - (1 - roll) * KICK.rollFric * dt;
    if (Math.abs(b.vy) < 70) b.vy = 0;
    if (imp > 220) ev(st, { t: "bounce", x: b.x, y: G, v: imp });
    if (b.fx === "meteor" && b.fxP === 2) { meteorImpact(st, b); }
    if (b.fx && !["bouncy", "giant"].includes(b.fx)) endFx(st);
  }
  if (st.obs && st.obs.length) obsBall(st, b, dt);
  // Decke & Wände
  const wb = clamp(0.7 * (st.rules.bounce || 1), 0.45, 0.95);
  if (b.y - b.r < -260) { b.y = -260 + b.r; b.vy = Math.abs(b.vy) * wb; }
  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * wb; if (b.fx && b.fx !== "bouncy") endFx(st); }
  if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * wb; if (b.fx && b.fx !== "bouncy") endFx(st); }
  // Latten
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side);
    const x0 = side ? W - GOAL_W : 0, x1 = side ? W : GOAL_W;
    if (collideRect(b, x0, x1, by - BAR_T / 2, by + BAR_T / 2, 1.6)) {
      if (Math.hypot(b.vx, b.vy) > 200) ev(st, { t: "post", x: b.x, y: by });
      // Ball liegt auf der Latte: sanft zurück ins Feld rollen lassen
      if (b.y < by && Math.abs(b.vy) < 90) b.vx += (side ? -1 : 1) * 40;
      if (b.fx && b.fx !== "bouncy" && b.fx !== "giant") endFx(st);
    }
    // Pfosten vorne (dünn)
    const px = side ? W - GOAL_W : GOAL_W;
    collideRect(b, px - 4, px + 4, by - BAR_T / 2, by + 6, 1.6);
    // Torwand-Power-up
    if (st.wall[side] > 0) {
      const wx = side ? W - GOAL_W - 10 : GOAL_W + 10;
      if (collideRect(b, wx - 7, wx + 7, by + BAR_T / 2, G, 1.75)) {
        ev(st, { t: "wallhit", x: wx, y: b.y });
        if (b.fx && b.fx !== "giant") endFx(st);
      }
    }
  }
  // Tempo-Limit
  const sp = Math.hypot(b.vx, b.vy), lim = b.fx ? 2300 : maxBall(st);
  if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
  // Tor?
  if (!postGoal && st.ph === "play") {
    if (b.x + b.r * 0.6 < GOAL_W && b.y - b.r * 0.3 > barY(st, 0) + BAR_T / 2) goal(st, 1);
    else if (b.x - b.r * 0.6 > W - GOAL_W && b.y - b.r * 0.3 > barY(st, 1) + BAR_T / 2) goal(st, 0);
  }
}

function collideRect(b, x0, x1, y0, y1, rest) {
  const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1);
  const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= b.r) return false;
  let nx, ny;
  if (d === 0) { nx = 0; ny = b.y < (y0 + y1) / 2 ? -1 : 1; } else { nx = dx / d; ny = dy / d; }
  b.x = cx + nx * b.r; b.y = cy + ny * b.r;
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) { b.vx -= rest * dot * nx; b.vy -= rest * dot * ny; return true; }
  return false;
}

function collideCircle(b, cx, cy, minD, pvx, pvy, rest) {
  const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= minD || d === 0) return null;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * minD; b.y = cy + ny * minD;
  const rvx = b.vx - pvx, rvy = b.vy - pvy, dot = rvx * nx + rvy * ny;
  if (dot < 0) { b.vx -= (1 + rest) * dot * nx; b.vy -= (1 + rest) * dot * ny; }
  return { nx, ny, imp: -dot };
}

function touch(st, b, p, kind) {
  const prevOwner = b.fxO;
  if (b.fx && prevOwner !== p.i) {
    // Gegner berührt Spezialschuss
    // Jeder Spezialschuss ist abwehrbar. Wer blockt, zahlt einen kleinen Preis.
    if (b.fx === "fire") { p.vx = -p.dir * 420; p.vy = Math.min(p.vy, -260); p.onG = false; p.stun = Math.max(p.stun, 0.3); ev(st, { t: "burn", i: p.i, x: p.x, y: p.y }); }
    if (b.fx === "ice") { p.frz = Math.max(p.frz, 1.1); ev(st, { t: "freeze", i: p.i, x: p.x, y: p.y }); }
    if (b.fx === "giant") { /* bleibt groß */ }
    else endFx(st);
    ev(st, { t: "save", i: p.i, x: b.x, y: b.y });
  }
  b.lt = p.i; b.ltk = kind; b.ltx = p.x;
  if (p.armed > 0) { p.armed = 0; fireSuper(st, p, charById(p.ch).super); return false; }
  if (p.fireNext && kind === "kick") { p.fireNext = false; fireSuper(st, p, "fire"); return false; }
  return true;
}

function ballVsPlayer(st, b, p, dt) {
  const r = pr(p), ch = charById(p.ch);
  if (b.nhT > 0 && b.nh === p.i) return; // gerade gequetscht/gespitzelt: kurz keine zweite Berührung
  if (p.bomb && bombBall(st, b, p)) return;
  if (p.slide > 0 && !p.slideHit && slideBall(st, b, p)) return;
  if (b.fx && b.fxO === p.i && b.fxT < 0.25) return; // eigener Schuss löst sich erst
  // Kopf
  const preVx = b.vx, preVy = b.vy, preLt = b.lt, preK = b.ltk;
  const hc = collideCircle(b, p.x, p.y, r + b.r, p.vx, p.vy, clamp(0.82 * Math.sqrt(st.rules.bounce || 1), 0.6, 0.95));
  if (hc) {
    // Harter Schuss des Gegners trifft mich: ich werde ein Stück zurückgedrückt
    if (preLt === 1 - p.i && (preK === "kick" || preK === "super") && hc.imp > 450 && p.pushCD <= 0) {
      const k = Math.min(1, (hc.imp - 450) / 900) * (p.bigT > 0 ? 0.6 : 1);
      p.vx += Math.sign(preVx || -p.dir) * (160 + 220 * k); p.pushCD = 0.35; p.knock = 0.15 + 0.1 * k;
      if (k > 0.5) { p.vy = Math.min(p.vy, -140); p.onG = false; }
    }
    if (!touch(st, b, p, "head")) return;
    b.vx += p.vx * 0.25 + (hc.ny < 0.1 ? p.dir * 160 : 0); // Schub nach vorn nur bei echtem Kopfball, nicht wenn der Ball unten am Kinn klemmt
    if (p.vy < -150 && hc.ny < -0.3) { b.vy -= 260; b.vx += p.dir * 220; } // Kopfball-Wucht
    // Kopfball beim Aufladen/Ausholen: mehr Kraft, aber weniger als ein sauberer Schuss mit dem Fuß
    let hp = 0;
    // Power-Kopfball nur, wenn der Ball wirklich oben am Kopf ist. Ein Ball unten am Kinn/Fuß ist Sache des Schusses.
    const atHead = b.y < p.y + r * 0.35;
    if (!atHead) { /* nichts: Schuss übernimmt */ }
    else if (p.kHeld && p.charge > 0.08) { hp = p.charge; p.kHeld = false; p.charge = 0; p.chT = 0; }
    else if (p.kick > KICK.hitFrom && !p.kHit) { hp = Math.max(0.25, (p.kPow - 1) / 0.75); p.kHit = true; }
    if (hp > 0) {
      const pm = ch.pow * (p.miniT > 0 ? 0.8 : 1) * (p.bigT > 0 ? 1.1 : 1);
      b.vx = p.dir * (Math.abs(b.vx) * 0.25 + (540 + 460 * hp) * pm * kickMul(st)) + p.vx * 0.15;
      b.vy = Math.min(b.vy, -(300 + 360 * hp));
      if (hp > 0.6) st.hs = Math.max(st.hs, 0.015);
    }
    if ((hc.imp > 160 || hp > 0) && p.hc <= 0) {
      p.hc = 0.12; st.stats[p.i].heads++;
      addMeter(st, p, 4 * (st.mod === "superfast" ? 2 : 1));
      ev(st, { t: "head", i: p.i, x: b.x - hc.nx * b.r, y: b.y - hc.ny * b.r, v: hc.imp, pow: 1 + hp * 0.6 });
    }
  }
  // Schuh
  const s = shoePos(p);
  const sc = collideCircle(b, s.x, s.y, SR * p.sc + b.r, p.vx, p.vy, 0.55);
  if (sc && sc.imp > 120) { touch(st, b, p, "shoe"); }
  // Schuss
  if (p.kick > KICK.hitFrom && !p.kHit) {
    const fx = p.x + p.dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
    const reach = 66 * KS * p.sc + b.r;
    const dist = Math.hypot(b.x - fx, b.y - fy);
    const through = (st.obs || []).some(o => o.t === "plat" && b.x > o.x - o.w / 2 && b.x < o.x + o.w / 2 && ((fy < o.y && b.y > o.y + o.h) || (fy > o.y + o.h && b.y < o.y)));
    if (dist < reach && !through && (b.x - p.x) * p.dir > -18 * KS * p.sc) {
      p.kHit = true;
      if (!touch(st, b, p, "kick")) return;
      // Trefferqualität: sauber am Fuß = volle Kraft, am Rand der Reichweite deutlich weniger
      const q = clamp((1 - dist / reach) * 1.7, 0, 1);
      const qm = 0.7 + 0.3 * q;
      // aufgeladen (c = 0..1): härter UND deutlich höher
      const c = (p.kPow - 1) / 0.75;
      const pm = ch.pow * (p.miniT > 0 ? 0.8 : 1) * (p.bigT > 0 ? 1.1 : 1);
      const kv = kickVec(st, p, b, c, qm, pm);
      const wk = kickMul(st);
      const inSpd = Math.max(b.vmem || 0, Math.hypot(b.vx, b.vy)); // Tempo vor dem Abprall an Kopf/Schuh
      let ox = p.dir * kv.vx * wk, oy = kv.vy * wk;
      const m = Math.hypot(ox, oy) || 1;
      let nm = m;
      if (KICK.carryMode === "add") nm = m + KICK.carry * inSpd * qm;
      else if (KICK.carryMode === "max") nm = Math.max(m, inSpd * KICK.carry * qm);
      if (KICK.softCap) { const L = maxBall(st), knee = L * 0.6; if (nm > knee) nm = knee + (L - knee) * Math.tanh((nm - knee) / (L - knee)); }
      ox *= nm / m; oy *= nm / m;
      b.vx = ox + p.vx * 0.2;
      b.vy = oy;
      b.kin = inSpd;
      b.held = 0.05;
      st.stats[p.i].shots++;
      addMeter(st, p, 6 * (st.mod === "superfast" ? 2 : 1));
      const pow = 1 + (p.kPow - 1) * qm;
      const spd = Math.hypot(b.vx, b.vy);
      ev(st, { t: "kick", i: p.i, x: b.x, y: b.y, pow, q, c, spd, kind: kv.kind, inSpd });
      if (KICK.hsMode === "all") { if (q > 0.45 || c > 0.3) st.hs = Math.max(st.hs, 0.028 + 0.05 * c); }
      else if (KICK.hsMode === "hard") { if (spd > KICK.power) st.hs = Math.max(st.hs, 0.03 + 0.03 * clamp((spd - KICK.power) / 900, 0, 1)); }
      if (spd > KICK.power) { b.pw = 0.55; p.vx -= p.dir * (90 + 120 * c); } else b.pw = 0;
    }
  }
}

// Schussart nach dem, was man sieht:
// Ball ruhig am Boden = Lupfer (steil), Ball rollt/springt flach = Strahl (hart, flach), Ball in der Luft = Volley (flach, hoch getroffen leicht nach unten)
export function kickKind(b) {
  if (b.y + b.r < G - 34) return "volley";
  const sp = KICK.memClassify ? Math.max(b.vmem || 0, Math.hypot(b.vx, b.vy)) : Math.hypot(b.vx, b.vy);
  return sp < KICK.lobSpeed ? "lob" : "drive";
}
function kickVec(st, p, b, c, qm, pm) {
  const kind = kickKind(b), ch = charById(p.ch);
  const base = ((KICK.tap + 400 * (ch.pow - 1)) * pm + KICK.chargeAdd * c) * qm, lift = 0.7 + 0.3 * qm;
  if (kind === "lob") return { kind, vx: base * 0.5, vy: -(800 + 380 * c) * lift };
  if (kind === "volley") return { kind, vx: base * 1.05, vy: b.y < p.y ? -(180 + 150 * c) * lift : -(480 + 300 * c) * lift };
  return { kind, vx: base, vy: -(KICK.driveVy + KICK.driveCharge * c) * lift };
}
// Vorschau für den Richtungspfeil beim Halten: nur wenn der Ball in Schussnähe ist
export function kickPreview(st, p) {
  const b = st.b, fx = p.x + p.dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
  const reach = 66 * KS * p.sc + b.r;
  if (Math.hypot(b.x - fx, b.y - fy) > reach * 2 || (b.x - p.x) * p.dir < -18 * KS * p.sc) return null;
  const pm = charById(p.ch).pow * (p.miniT > 0 ? 0.8 : 1) * (p.bigT > 0 ? 1.1 : 1);
  const kv = kickVec(st, p, b, p.charge, 1, pm);
  return { kind: kv.kind, ang: Math.atan2(kv.vy, p.dir * kv.vx), c: p.charge };
}

// ---------- Spezialschüsse ----------
function target(st, i, hi) {
  const side = i ? 0 : 1;
  const x = side ? W - GOAL_W * 0.45 : GOAL_W * 0.45;
  const by = barY(st, side);
  const y = hi ? by + 50 : by + (G - by) * 0.55;
  return { x, y };
}
function aim(b, tx, ty, sp) { const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1; b.vx = dx / d * sp; b.vy = dy / d * sp; }
function steer(b, tx, ty, rate, sp, dt) {
  const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(ty - b.y, tx - b.x);
  let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const a = cur + clamp(d, -rate * dt, rate * dt);
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
}
function fxGravity(b) {
  switch (b.fx) {
    case "fire": case "thunder": case "rocket": case "ghost": case "tornado": case "magnet": case "clone": return 0;
    case "meteor": return 0;
    case "ice": return 0.25;
    case "banana": return 0;
    default: return 1;
  }
}

export function fireSuper(st, p, kind) {
  const b = st.b, t = target(st, p.i, false);
  b.fx = kind; b.fxT = 0; b.fxO = p.i; b.fxP = 0; b.alpha = 1; b.lt = p.i; b.ltk = "super"; b.ltx = p.x;
  // Ball vor den Fuß holen, damit er nicht im Kopf steckt
  if (Math.hypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 4) { b.x = p.x + p.dir * (pr(p) + b.r + 6); }
  st.stats[p.i].supers++;
  switch (kind) {
    case "fire": aim(b, t.x, t.y, 1350); break;
    case "ice": aim(b, t.x, t.y - 40, 1150); break;
    case "thunder": aim(b, t.x, t.y, 1050); break;
    case "rocket": { b.vx = 0; b.vy = -80; const t2 = target(st, p.i, true); b.fxTX = t2.x; b.fxTY = t2.y; break; }
    case "banana": b.vx = p.dir * 700; b.vy = -900; break;
    case "ghost": aim(b, t.x, t.y, 1150); break;
    case "giant": b.grow = 2.0; aim(b, t.x, t.y - 120, 1000); break;
    case "tornado": b.fxBX = b.x; b.vx = 0; b.vy = -650; break;
    case "magnet": b.vx = p.dir * 900; b.vy = -650; break;
    case "meteor": b.vx = 0; b.vy = -2300; b.fxTX = t.x; b.fxTY = G; break;
    case "bouncy": b.vx = p.dir * 1100; b.vy = 700; break;
    case "clone": aim(b, t.x, t.y, 1150); b.fxBX = b.x; b.fxBY = b.y; b.fxDX = b.vx; b.fxDY = b.vy; b.fxK = [-1, 0, 1][Math.floor(Math.random() * 3)]; break;
  }
  st.hs = 0.12; st.slow = 0.25;
  ev(st, { t: "super", i: p.i, k: kind, x: b.x, y: b.y });
}

function superStep(st, b, dt) {
  b.fxT += dt;
  const t = target(st, b.fxO, false), t2 = target(st, b.fxO, true);
  switch (b.fx) {
    case "fire": if (b.fxT > 1.6) endFx(st); break;
    case "ice": if (b.fxT > 1.6) endFx(st); break;
    case "thunder": {
      const ph = Math.floor(b.fxT / 0.11);
      if (ph !== b.fxP) { b.fxP = ph; ev(st, { t: "zap", x: b.x, y: b.y }); }
      aim(b, t.x, t.y, 1050);
      const ax = b.vx / 1050, ay = b.vy / 1050, s = (ph % 2 ? 1 : -1) * 420;
      b.vx += -ay * s; b.vy += ax * s;
      if (b.fxT > 1.8) endFx(st); break;
    }
    case "rocket":
      if (b.fxP === 0 && b.fxT > 0.5) { b.fxP = 1; aim(b, b.fxTX, b.fxTY, 1400); ev(st, { t: "launch", x: b.x, y: b.y }); }
      if (b.fxT > 2) endFx(st); break;
    case "banana": steer(b, t.x, t.y + 20, 2.6 + b.fxT * 2, 1150, dt); if (b.fxT > 2.2) endFx(st); break;
    case "ghost": b.alpha = b.fxT < 0.2 ? 1 : Math.abs(b.x - t.x) < 320 ? 0.95 : 0.2; if (b.fxT > 1.6) endFx(st); break;
    case "giant": if (b.fxT > 3) { b.fx = ""; b.fxO = -1; } break;
    case "tornado":
      if (b.fxP === 0) {
        b.vx = Math.cos(b.fxT * 16) * 520 + (b.fxBX - b.x) * 3; b.vy = -620;
        if (b.fxT > 0.55 || b.y < 120) { b.fxP = 1; aim(b, t.x, t.y, 1300); ev(st, { t: "launch", x: b.x, y: b.y }); }
      } else steer(b, t.x, t.y, 4, 1250, dt);
      if (b.fxT > 2.4) endFx(st); break;
    case "magnet": steer(b, t.x, t.y, 2.6, 1100, dt); if (b.fxT > 2.4) endFx(st); break;
    case "meteor":
      if (b.fxP === 0 && b.y < -230) {
        b.fxP = 2; const side = b.fxO ? -1 : 1;
        b.x = t.x - side * 430; b.y = -240; aim(b, t.x, t.y + 30, 1500); ev(st, { t: "launch", x: b.x, y: 0 });
      }
      if (b.fxP === 0 && b.fxT > 1.2) endFx(st);
      if (b.fxT > 2.5) endFx(st); break;
    case "bouncy": if (b.fxT > 3.2) endFx(st); break;
    case "clone": {
      b.fxBX += b.fxDX * dt; b.fxBY += b.fxDY * dt;
      const amp = 75 * Math.sin(Math.min(1, b.fxT / 0.35) * Math.PI / 2);
      const d = Math.hypot(b.fxDX, b.fxDY) || 1, px = -b.fxDY / d, py = b.fxDX / d;
      const nx = b.fxBX + px * amp * b.fxK, ny = b.fxBY + py * amp * b.fxK;
      b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt;
      b.x = nx - b.vx * dt; b.y = ny - b.vy * dt; // wird gleich wieder addiert
      if (b.fxT > 1.8) endFx(st); break;
    }
  }
}
function endFx(st) {
  const b = st.b;
  if (!b.fx) return;
  if (b.fx === "clone") { const s = Math.hypot(b.fxDX, b.fxDY) || 1; b.vx = b.fxDX / s * 900; b.vy = b.fxDY / s * 900; }
  if (b.fx === "giant") b.grow = Math.max(b.grow, 2.0);
  b.fx = ""; b.fxO = -1; b.alpha = 1; b.fxP = 0;
}
function meteorImpact(st, b) {
  ev(st, { t: "quake", x: b.x, y: G });
  st.p.forEach(p => { if (p.i !== b.fxO && p.onG && Math.abs(p.x - b.x) < 170) { p.stun = 0.4; p.vy = -380; p.onG = false; } });
}

// ---------- Power-ups ----------
function powerups(st, dt) {
  if (!st.pus) return;
  st.puT -= dt;
  if (st.puT <= 0 && st.pu.length < 2) {
    st.puT = st.mod === "pu2" || st.rules.pu === "many" ? rand(3, 5) : rand(7, 11);
    const k = PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)];
    let x = 0, y = 0;
    let ok = false;
    for (let tries = 0; tries < 24 && !ok; tries++) {
      x = rand(360, W - 360); y = rand(260, 370);
      ok = !(st.obs || []).some(o => o.t === "plat" ? x > o.x - o.w / 2 - 50 && x < o.x + o.w / 2 + 50 && y > o.y - 50 && y < o.y + o.h + 50 : Math.hypot(x - o.x, y - o.y) < o.r + 60);
    }
    if (ok) { st.pu.push({ id: st.puId++, k, x, y, t: 0 }); ev(st, { t: "puSpawn" }); }
  }
  const b = st.b;
  for (let n = st.pu.length - 1; n >= 0; n--) {
    const u = st.pu[n]; u.t += dt;
    if (u.t > 13) { st.pu.splice(n, 1); continue; }
    if (Math.hypot(b.x - u.x, b.y - (u.y + Math.sin(u.t * 3) * 10)) < b.r + 36 && b.lt >= 0) {
      st.pu.splice(n, 1); applyPu(st, b.lt, u.k, u.x, u.y);
    }
  }
}
function applyPu(st, i, k, x, y) {
  const me = st.p[i], op = st.p[1 - i];
  st.stats[i].pus++;
  switch (k) {
    case "bighead": me.bigT = 6; me.miniT = 0; break;
    case "mini": op.miniT = 6; op.bigT = 0; break;
    case "freeze": op.frz = Math.max(op.frz, 1.5); break;
    case "speed": me.spdT = 6; break;
    case "jump": me.jmpT = 6; break;
    case "fire": me.fireNext = true; break;
    case "wall": st.wall[i] = 5; break;
    case "biggoal": st.bigGoal[1 - i] = 6; break;
    case "meter": me.meter = 100; me.full = true; break;
    case "confuse": op.confT = 3.5; break;
    case "dbljump": me.djT = 7; break;
    case "wind": st.wind = { t: 5, dir: me.dir }; break;
  }
  ev(st, { t: "pu", i, k, x, y });
}

// ---------- Tore ----------
function goal(st, i) {
  const b = st.b, other = 1 - i;
  st.s[i]++;
  const own = b.lt === other;
  const kind = own ? "own" : b.ltk === "super" || b.fx ? "super" : b.ltk === "head" ? "head" : b.ltk === "bomb" ? "bomb" : b.ltk === "slide" ? "slide" : "kick";
  const long = !own && b.lt === i && (i === 0 ? b.ltx < W / 2 - 40 : b.ltx > W / 2 + 40);
  const lastSec = !st.gold && st.t < 3;
  const S = st.stats[i];
  S.goals++;
  if (own) st.stats[other].ownGoals++;
  if (kind === "head") S.headGoals++;
  if (kind === "super") S.superGoals++;
  if (long) S.longGoals++;
  if (lastSec) S.lastSecGoals++;
  st.lastGoal = { i, kind, long, lastSec, gold: st.gold, x: b.x, y: b.y, s: [...st.s] };
  st.p[i].mood = "happy"; st.p[i].moodT = 3; st.p[other].mood = "sad"; st.p[other].moodT = 3;
  addMeter(st, st.p[other], 15);
  endFx(st); b.alpha = 1;
  st.ph = "goal"; st.pt = 3.7; st.slow = 0.9;
  ev(st, { t: "goal", i, kind, long, lastSec, gold: st.gold, x: b.x, y: b.y, s: [...st.s] });
}

// Für den Online-Gast: eigene Figur sofort lokal bewegen (ohne Ball)
export function predictPlayer(st, p, c, dt) {
  const locked = st.ph === "cd" || st.ph === "ko";
  movePlayer(st, p, st.ph === "goal" || st.ph === "end" ? {} : c, dt, locked);
  if (st.ph === "play") handleKick(st, p, c, dt);
}
export function emote(st, i, e) { const p = st.p[i]; p.emo = e; p.emoT = 2.2; ev(st, { t: "emote", i, e }); }
export function skipCelebration(st) { if (st.ph === "goal" && st.pt > 0.3) st.pt = 0.3; }
export const REPLAY_START = 2.75, REPLAY_END = 0.35; // pt-Fenster, in dem die Wiederholung läuft
