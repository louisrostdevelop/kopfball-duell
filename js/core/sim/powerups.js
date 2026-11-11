// Power-ups: Kugeln (Ankündigung, Lebensdauer, Topf, Gold), Einsammeln,
// Wirkungen, Stapelregeln, Zeiten. Wirkungen auf Ball und Schuh stehen dort, wo sie rechnen (ball.js, shoe.js, player.js).
import { W, G, GOAL_W, BR, POWERUPS, PU_POT, PU_RANKED, fw } from "../../content/config.js";
import { addMeter, ev, shielded, unstick } from "./base.js";
import { kickMul, maxBall } from "./rules.js";
import { aimAngle, legCancel, shoeGeo, shotH } from "./shoe.js";
import { touch } from "./supers.js";
import { PU, bv, pv } from "./tuning.js";
import { dcos, dhypot, dsin, rnd, rrange } from "../../content/dmath.js";

const D2R = Math.PI / 180;
/** eigene, zeitlich begrenzte Wirkungen (Höchstgrenze PU.maxOwn); miniT und frz zählen als fremde */
export const OWN = ["fireT", "bootT", "spinT", "wingT", "bigT", "magT", "shieldT"];
const dur = k => POWERUPS[k].dur;

// ---------- Kugeln ----------
export function powerups(st, dt) {
  if (!st.pus) return;
  st.puT -= dt;
  // Ranked (st.fair): immer ein Paar, spiegelbildlich zur Mitte, damit keine Seite Glück hat
  if (st.puT <= 0 && (st.fair ? st.pu.length === 0 : st.pu.length < 2)) {
    st.puT = st.mod === "pu2" || st.rules.pu === "many" ? rrange(st, 3, 5) : rrange(st, 7, 11);
    let x = 0, y = 0;
    let ok = false;
    for (let tries = 0; tries < 24 && !ok; tries++) {
      x = st.fair ? rrange(st, fw(360), W / 2 - 90) : rrange(st, fw(360), W - fw(360)); y = rrange(st, 260, 370);   // Abstand zu den Toren wächst mit dem Feld
      ok = free(st, x, y) && (!st.fair || free(st, W - x, y));
    }
    if (ok) {
      const k = nextKey(st);
      st.pu.push({ id: st.puId++, k, x, y, t: -PU.warn });
      if (st.fair) st.pu.push({ id: st.puId++, k, x: W - x, y, t: -PU.warn });
      ev(st, { t: "puSpawn", k, x, y });
    }
  }
  const b = st.b;
  for (let n = st.pu.length - 1; n >= 0; n--) {
    const u = st.pu[n]; u.t += dt;
    if (u.t >= PU.life) { st.pu.splice(n, 1); ev(st, { t: "puGone", k: u.k, x: u.x, y: u.y }); continue; }
    // Ankündigung (t < 0): nur Schimmern, nicht einsammelbar
    if (u.t >= 0 && b.lt >= 0 && dhypot(b.x - u.x, b.y - (u.y + dsin(u.t * 3) * 10)) < b.r + 36) {
      st.pu.splice(n, 1); applyPu(st, b.lt, u.k, u.x, u.y);
    }
  }
}

// Platz frei von Hindernissen?
const free = (st, x, y) => !(st.obs || []).some(o => o.t === "plat" ? x > o.x - o.w / 2 - 50 && x < o.x + o.w / 2 + 50 && y > o.y - 50 && y < o.y + o.h + 50 : dhypot(x - o.x, y - o.y) < o.r + 60);

/**
 * Nächste Kugel: das PU.goldFirst-te Erscheinen und danach jedes PU.gold-te golden (5., 15., 25. …; Super voll und Portal
 * im Wechsel, nie Ranked), sonst aus dem Topf ohne
 * Wiederholung (st.puBag, leer → neu gemischt mit Fisher-Yates und rnd(st))
 */
export function nextKey(st) {
  const n = st.puN++;
  if (!st.fair && n >= PU.goldFirst - 1 && (n - (PU.goldFirst - 1)) % PU.gold === 0) {
    const k = st.puGold % 2 || !st.rules.supers ? "portal" : "super";   // ohne Supers immer Portal
    st.puGold++;
    return k;
  }
  if (!st.puBag.length) {
    const a = (st.fair ? PU_RANKED : PU_POT).slice();
    for (let j = a.length - 1; j > 0; j--) { const m = Math.floor(rnd(st) * (j + 1)), t = a[j]; a[j] = a[m]; a[m] = t; }
    st.puBag = a;
  }
  return st.puBag.pop();
}

/** Betroffener für die Anzeige: Sammler, Gegner oder -1 (Feld) */
const target = (k, i) => (POWERUPS[k].to === "me" ? i : POWERUPS[k].to === "op" ? 1 - i : -1);

// ---------- Wirkungen ----------
export function applyPu(st, i, k, x, y) {
  const me = st.p[i], op = st.p[1 - i];
  st.stats[i].pus++;
  switch (k) {
    case "fire": own(st, me, "fireT", k); me.fireNext = true; break;
    case "boot": own(st, me, "bootT", k); break;
    case "spin": own(st, me, "spinT", k); me.spinN = PU.spinN; break;
    case "goal": st.bigGoal[1 - i] = dur(k); break;
    case "wall": st.wall[i] = dur(k); st.wallHp[i] = PU.wallHp; break;
    case "bubble": own(st, me, "shieldT", k); break;
    case "clone": st.clone[i] = { t: dur(k), hp: PU.cloneHp }; break;
    case "time": st.slow2[i] = dur(k); break;
    case "wings": own(st, me, "wingT", k); break;
    case "head": own(st, me, "bigT", k); me.miniT = 0; break;
    case "magnet": own(st, me, "magT", k); break;
    case "mini": if (!shielded(st, op)) { op.miniT = dur(k); op.bigT = 0; } break;
    case "ice": if (!shielded(st, op)) { op.frz = Math.max(op.frz, dur(k)); op.iceB = true; unstick(st, op.i); } break;
    case "quake": quake(st, i); break;
    case "float": st.floatT = dur(k); break;
    case "wind": st.wind = { t: dur(k), dir: me.dir }; break;
    case "super": me.meter = 100; me.full = true; break;
    case "portal": {
      // Eingang in der eigenen Hälfte, Ausgang vor dem Tor des Gegners, beide frei von Hindernissen (portalSpots);
      // ein zweites Portal ersetzt das erste
      const [a, z] = portalSpots(st, i);
      st.portal = { t: dur(k), i, ax: a[0], ay: a[1], bx: z[0], by: z[1] };
      break;
    }
  }
  st.hs = Math.max(st.hs, PU.hs);
  ev(st, { t: "pu", i, k, x, y, to: target(k, i), fam: POWERUPS[k].fam });
}

/** Eigene Wirkung setzen (gleiche nochmal: Dauer wieder voll). Eine vierte beendet die mit der kürzesten Restzeit. */
function own(st, p, f, k) {
  const was = p[f] > 0;
  p[f] = dur(k);
  if (was) return;
  let n = 0, low = "";
  for (const o of OWN) if (p[o] > 0) { n++; if (o !== f && (!low || p[o] < p[low])) low = o; }
  if (n > PU.maxOwn && low) endOwn(st, p, low);
}

/** Eigene Wirkung sofort beenden (mit allem, was an ihr hängt) */
export function endOwn(st, p, f) {
  p[f] = 0;
  if (f === "fireT") p.fireNext = false;
  if (f === "spinT") p.spinN = 0;
  if (f === "magT") unstick(st, p.i);
}

// Erdbeben: wer vom Gegner am Boden steht, hüpft hoch und taumelt; ein liegender Ball springt (auch mit Schutzblase)
function quake(st, i) {
  const op = st.p[1 - i], b = st.b;
  if (op.onG && !shielded(st, op)) {
    op.vy = -pv(PU.quakeP); op.onG = false; op.coy = 0; op.jHeld = false; op.stun = Math.max(op.stun, PU.quakeStun);
    unstick(st, op.i);
  }
  if (b.y + b.r >= G - 2 && !b.stick) b.vy = -bv(PU.quakeB);
  ev(st, { t: "quake", i, x: op.x, y: G });
}

// ---------- Portal: Platz ----------
// Kandidaten in fester Reihenfolge (der erste ist der Platz der Spezifikation), für Spieler 0; Spieler 1 gespiegelt:
// je Höhe über dem Boden alle Abstände. Eingang: Anteil der Feldbreite; Ausgang: Abstand zur Torlinie des Gegners.
const grid = (hs, ds) => hs.flatMap(h => ds.map(d => [d, h]));
const PORTAL_OUT = grid([220, 150, 320], [230, 300, 170, 370, 440]);

/**
 * Liegt (x, y) mit Rand m an Hindernis o? Alle Arten aus layouts.js, bewegte über ihre ganze Bahn (der Platz gilt 6 s):
 * Plattform/Block und Noclip-Tür als Rechteck, Bumper als Quadrat um die Bahn, Geysir und Blasen als Säule bis zum
 * Boden, Rampe als Rechteck bis zum Boden
 */
export function nearObs(o, x, y, m) {
  const mv = o.mv, ax = mv ? Math.abs(mv.ax || 0) + (mv.orbit || 0) : 0, ay = mv ? Math.abs(mv.ay || 0) + (mv.orbit || 0) * 0.45 : 0;
  switch (o.t) {
    case "plat": case "portal": return Math.abs(x - o.cx) < o.w / 2 + ax + m && y > o.cy - ay - m && y < o.cy + o.h + ay + m;
    case "bump": return Math.abs(x - o.cx) < o.r + ax + m && Math.abs(y - o.cy) < o.r + ay + m;
    case "geyser": case "bubbles": return Math.abs(x - o.cx) < o.w / 2 + m && y > o.top - m;
    case "ramp": return x > o.cx - o.top / 2 - o.L - m && x < o.cx + o.top / 2 + o.R + m && y > G - o.h - m;
  }
  return false;
}

/**
 * Eingang und Ausgang des Portals von Spieler i: jeweils der erste Kandidat ohne Hindernis in der Nähe (Eingang: im
 * Fangbereich PU.portalR plus Ballradius; Ausgang: Ballradius plus 16 px), deterministisch und spiegelbildlich für beide
 * Seiten; ist keiner frei, der erste
 */
export function portalSpots(st, i) {
  const obs = st.obs || [];
  const pick = (list, m) => list.find(([x, y]) => !obs.some(o => nearObs(o, x, y, m))) || list[0];
  return [pick(grid(PU.portalInH, PU.portalInF).map(([f, h]) => [W * (i ? 1 - f : f), G - h]), PU.portalR + BR),
    pick(PORTAL_OUT.map(([d, h]) => [i ? GOAL_W + d : W - GOAL_W - d, G - h]), BR + 16)];
}

// ---------- Zeiten ----------
/** Zeiten am Spieler (jeder Schritt, movePlayer); Ablauf beendet, was daran hängt */
export function puTimers(st, p, dt) {
  for (const k of ["bootT", "wingT", "shieldT"]) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
  if (p.fireT > 0) { p.fireT = Math.max(0, p.fireT - dt); if (p.fireT === 0) p.fireNext = false; }
  if (p.spinT > 0) { p.spinT = Math.max(0, p.spinT - dt); if (p.spinT === 0) p.spinN = 0; }
  if (p.magT > 0) { p.magT = Math.max(0, p.magT - dt); if (p.magT === 0) unstick(st, p.i); }
}

/** Feldwirkungen (im Spiel, nach dem Ball) */
export function fieldTimers(st, dt) {
  for (let i = 0; i < 2; i++) {
    if (st.slow2[i] > 0) st.slow2[i] = Math.max(0, st.slow2[i] - dt);
    if (st.wallCD[i] > 0) st.wallCD[i] = Math.max(0, st.wallCD[i] - dt);
    if (st.cloneCD[i] > 0) st.cloneCD[i] = Math.max(0, st.cloneCD[i] - dt);
    if (!(st.wall[i] > 0)) st.wallHp[i] = 0;
    const c = st.clone[i];
    if (c.t > 0) { c.t = Math.max(0, c.t - dt); if (c.t === 0) c.hp = 0; }
  }
  if (st.floatT > 0) st.floatT = Math.max(0, st.floatT - dt);
  if (st.portal) { st.portal.t -= dt; if (st.portal.t <= 0) st.portal = null; }
}

/**
 * Eisblock: jeder neue Tastendruck (Flanke von l, r, j, k, d) taut PU.iceTap ab; vorzeitig frei: Ereignis icebreak.
 * Gilt nur für das Eis des Power-ups (p.iceB), nicht für das Einfrieren durch den Eis-Super: dessen Rest p.frzS bleibt
 * (p.frz ist das Größere von beiden; beide laufen gleich schnell ab, also reicht der Rest des Supers).
 */
export function iceTaps(st, p, c) {
  const m = (c.l ? 1 : 0) | (c.r ? 2 : 0) | (c.j ? 4 : 0) | (c.k ? 8 : 0) | (c.d ? 16 : 0), nw = m & ~p.keyM;
  p.keyM = m;
  const hard = p.frzS > 0 ? p.frzS : 0;
  if (!(p.frz > 0) || !p.iceB || !nw || p.frz <= hard) return;
  let n = 0;
  for (let v = nw; v; v >>= 1) n += v & 1;
  p.frz = Math.max(hard, p.frz - PU.iceTap * n);
  ev(st, { t: "icetap", i: p.i, x: p.x, y: p.y });
  if (p.frz <= hard) { p.frz = hard; p.iceB = false; ev(st, { t: "icebreak", i: p.i, x: p.x, y: p.y }); }
}

// ---------- Effet ----------
/** Schuss von p (Ereignis kick): mit Effet bekommt der Ball Topspin, einer weniger übrig */
export function kickSpin(p, b) {
  if (!(p.spinN > 0) || b.fx) return;
  b.spin = 1; p.spinN--;
  if (p.spinN <= 0) { p.spinN = 0; p.spinT = 0; }
}

// ---------- Magnetschuh ----------
/** Ball sitzt vorne auf der Schuhspitze und hat das Tempo des Schuhs (gehaltenes Bein: das des Spielers) */
export function pinBall(b, p) {
  const g = shoeGeo(p), k = g.hl + g.rs + b.r;
  b.x = g.x + g.ux * k; b.y = g.y + g.uy * k; b.vx = p.vx; b.vy = p.vy;
}

/**
 * Gehaltenes Bein (oben) trifft einen langsamen freien Ball: festhalten. fv = Tempo des Schuhs. true = erledigt.
 * Nie einen Ball, den schon jemand hält, und nicht in der Sperrzeit nach dem Lösen (b.magCD, beide Spieler).
 */
export function magnetCatch(st, b, p, fv) {
  if (b.stick || b.magCD > 0 || dhypot(b.vx - fv.vx, b.vy - fv.vy) >= PU.magRel) return false;
  if (!touch(st, b, p, "shoe")) return true;   // scharfer Super zündet
  b.stick = { i: p.i, t: PU.magHold }; b.spin = 0;
  pinBall(b, p);
  ev(st, { t: "magnet", i: p.i, x: b.x, y: b.y });
  return true;
}

/**
 * Jeder Schritt nach dem Bein: Taste losgelassen → Schuss; Zeit um → Ball fällt (Bein geht zurück); Super, Grätsche,
 * Bombe, Einfrieren, Taumeln, Schubser → Ball löst sich. Sonst sitzt er weiter auf der Spitze.
 */
export function magnetStep(st, p, c, dt) {
  const b = st.b, s = b.stick;
  if (!s || s.i !== p.i) return;
  if (b.fx || !(p.magT > 0) || p.frz > 0 || p.stun > 0 || p.slide > 0 || p.bomb || p.knock > 0) { unstick(st); return; }
  if (p.lgS !== 2) { unstick(st); if (!c.k) magnetShot(st, b, p); return; }   // noch gedrückt: Schwung abgebrochen
  s.t -= dt;
  if (s.t <= 0) { unstick(st); legCancel(p); return; }
  pinBall(b, p);
}

// Loslassen: Schuss mit festem Tempo, Winkel nach der Höhe am Kopf (wie aimAngle beim Schuss)
function magnetShot(st, b, p) {
  if (!touch(st, b, p, "kick")) return;   // Feuer-Power-up oder scharfer Super übernimmt
  const dir = p.lgDir || p.dir, a = aimAngle(shotH(b, p)) * D2R, sp = Math.min(PU.magShot * kickMul(st), maxBall(st));
  b.vx = dir * dcos(a) * sp; b.vy = -dsin(a) * sp;
  b.kin = 0; b.held = 0.05; b.pw = 0;
  st.stats[p.i].shots++;
  addMeter(st, p, 6 * (st.mod === "superfast" ? 2 : 1));
  ev(st, { t: "kick", i: p.i, x: b.x, y: b.y, pow: 1, q: 1, c: 0, spd: sp, kind: "drive", inSpd: 0, mag: true });
  kickSpin(p, b);
}

/** Tempo-Faktor fürs Laufen, solange p den Ball am Magnetschuh hält */
export const magRun = (st, p) => (st.b && st.b.stick && st.b.stick.i === p.i ? PU.magRun : 1);

/** Startwerte am Spieler (alle Spieler bekommen die Felder) */
export const puFields = () => ({ fireT: 0, bootT: 0, spinN: 0, spinT: 0, wingT: 0, magT: 0, shieldT: 0, iceB: false, keyM: 0, frzS: 0 });

/**
 * Startwerte im Spiel (newMatch) und nach jedem Anstoß (kickoff): alle Feldwirkungen weg. Die Kugeln bleiben über den
 * Anstoß (keep: sonst räumt jedes Tor sie ab), außer denen nah am Anstoßpunkt (koOrbs);
 * puBag, puN, puGold bleiben das ganze Spiel
 */
export function resetField(st, keep = false) {
  st.pu = keep ? koOrbs(st) : []; st.wall = [0, 0]; st.wallHp = [0, 0]; st.bigGoal = [0, 0]; st.wind = { t: 0, dir: 1 };
  st.clone = [{ t: 0, hp: 0 }, { t: 0, hp: 0 }]; st.slow2 = [0, 0]; st.floatT = 0; st.portal = null;
  st.wallCD = [0, 0]; st.cloneCD = [0, 0];   // Sperrzeit zwischen zwei Treffern an Torwand bzw. Doppelgänger
}

/**
 * Kugeln nach dem Anstoß: der neue Ball (st.b, schon am Anstoßpunkt) fällt fast senkrecht, beide laufen hin; wer ihn
 * zuerst berührt, sammelte eine Kugel in dieser Säule ungewollt mit ein. Solche verschwinden (Ereignis puGone wie beim
 * Ablauf), alle anderen bleiben mit ihrer Restzeit. Säule: waagrecht näher als Einsammel-Abstand (b.r + 36) plus Wippen
 * (10) plus PU.koClear, vom Anstoßpunkt (ebenso viel darüber) bis zum Boden
 */
function koOrbs(st) {
  const b = st.b, near = b.r + 36 + 10 + PU.koClear;
  return st.pu.filter(u => {
    if (Math.abs(u.x - b.x) >= near || u.y <= b.y - near) return true;
    ev(st, { t: "puGone", k: u.k, x: u.x, y: u.y });
    return false;
  });
}
