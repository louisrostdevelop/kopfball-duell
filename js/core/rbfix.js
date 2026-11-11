// Prüfung einer Korrektur vom Host (Rollback „rs“, unter Freunden) und einer Wiederaufnahme (rbstart.js): Der Gast
// vergleicht den fremden Stand mit seinem eigenen zum selben Takt. Ein ehrlicher Resync ändert, was auseinandergelaufen
// sein kann (Positionen, Tempo, Zufall, Statistik, ein Tor in den letzten Takten), aber nichts Festes und nichts, was das
// Spiel selbst so nicht erzeugen kann. In der Gegnersuche gibt es keine Korrektur: eine Abweichung macht das Spiel
// ungültig (rbpeer.js strict, app/matchmaking.js).
import { G, GOAL_W, POWERUPS, W } from "../content/config.js";
import { maxBall } from "./sim/rules.js";
import { PU } from "./sim/tuning.js";

/** so weit dürfen Restzeit und Phasen-Zeit abweichen (die Rechnung läuft höchstens gut eine Sekunde auseinander) */
export const FIX_DT = 2.5;
const PT_MAX = { cd: 3, ko: 1, goal: 3.7 };
// höchste Werte, die das Spiel selbst setzt (sim/*.js), mit etwas Luft; Wirkdauern der Power-ups aus config.js
// (POWERUPS[k].dur) und PU, damit eine neue Dauer nicht als Betrug gilt
const D = k => POWERUPS[k].dur;
const P_MAX = { frz: Math.max(1.5, D("ice")) + 0.1, frzS: 1.1, stun: 1, knock: 0.45, pushCD: 0.6, slideCD: 0.6, slide: 0.31, tripCD: 1.25, bombRec: 0.11, stompImm: 2.1, sc2: 0.8,
  bigT: D("head"), miniT: D("mini"), fireT: D("fire"), bootT: D("boot"), spinT: D("spin"), spinN: PU.spinN, wingT: D("wings"), magT: D("magnet"), shieldT: D("bubble"), confT: 3.5, sadT: 1.5, charmT: 0.6, armed: 4, emoT: 2.2, land: 0.3, hc: 0.12, bonkT: 0.3, coy: 0.08,
  dBuf: 0.16, meter: 100, sc: 2.5 };
const B_MAX = { ghost: 0.3, held: 0.05, nhT: 0.22, grow: 2, fxT: 4, r: 130, alpha: 1, spin: 1, magCD: PU.magLock, tch: 1 };
const S_MAX = { hs: 0.15, slow: 0.9, puT: 11, jam: 2, floatT: D("float") };
const num = v => typeof v === "number" && Number.isFinite(v);
const isPu = k => typeof k === "string" && Object.prototype.hasOwnProperty.call(POWERUPS, k);
// (abgelaufene Zeiten laufen etwas unter 0 weiter, das schadet nicht: begrenzt wird nach oben)
const within = (v, max) => num(v) && v >= -60 && v <= max + 1e-9;
// alle Zahlen endlich und im Rahmen (NaN, Unendlich, riesige Werte rechnen beim Gast sonst kaputt); nur die
// Zufallszähler (rng) sind 32-Bit-Zahlen
function finite(o, depth = 0, key = "") {
  if (depth > 6) return false;
  if (typeof o === "number") return Number.isFinite(o) && Math.abs(o) <= (key === "rng" ? 4294967296 : 1e6);
  if (o === null || typeof o !== "object") return true;
  for (const k of Object.keys(o)) if (!finite(o[k], depth + 1, k)) return false;
  return true;
}
// Tempo: Spieler laufen, werden geschubst, springen, fallen als Bombe (MOVE, tricks.js); der Ball höchstens bis zur
// Obergrenze (Spezialschüsse 2300), mit Luft für Abpraller innerhalb eines Schritts
const P_V = { x: 2500, y: 3500 };
const ballV = f => Math.max(maxBall(f), 2300) * 1.6;
const json = v => JSON.stringify(v === undefined ? null : v);
// Hindernisse: alles bis auf die Lage (die folgt aus der Spielzeit) und das Aufleuchten
const obsKey = o => json(o && typeof o === "object" ? { ...o, x: 0, y: 0, vx: 0, vy: 0, hitT: 0 } : o);

// Teile des Zustands, die sich im Spiel nie ändern
const FIXED = ["arena", "mod", "dur", "golden", "fair", "train", "pus", "obsIdx", "rules", "lv"];
/** Feste Teile (Regeln, Level, Arena, Modus, Hindernisse, Köpfe, Bots) gleich? */
export function sameFixed(own, fix) {
  if (!FIXED.every(k => json(own[k]) === json(fix[k]))) return false;
  const bots = st => (st.bot == null ? "" : Array.isArray(st.bot) ? st.bot.map(x => !!x).join() : "?");   // Bot je Seite: nur, wo schon einer ist
  if (bots(own) !== bots(fix)) return false;
  return Array.isArray(fix.p) && fix.p.length === 2 && fix.p.every((q, i) => q && typeof q === "object" && q.ch === own.p[i].ch);
}

/** Werte im Rahmen dessen, was das Spiel erzeugt (Zeiten, Größen, Lage im Feld)? */
function inRange(f) {
  if (!f.p.every(q => Object.keys(P_MAX).every(k => q[k] === undefined || within(q[k], P_MAX[k])) && within(q.x, W) && num(q.y) && q.y > -900 && q.y <= G
    && num(q.vx) && Math.abs(q.vx) <= P_V.x && num(q.vy) && Math.abs(q.vy) <= P_V.y)) return false;
  const b = f.b, bv = ballV(f);
  if (!num(b.vx) || !num(b.vy) || Math.abs(b.vx) > bv || Math.abs(b.vy) > bv) return false;
  if (!Object.keys(B_MAX).every(k => b[k] === undefined || within(b[k], B_MAX[k])) || !num(b.x) || b.x < -60 || b.x > W + 60 || !num(b.y) || b.y < -600 || b.y > G + 20) return false;
  if (!Object.keys(S_MAX).every(k => f[k] === undefined || within(f[k], S_MAX[k]))) return false;
  if (!Array.isArray(f.wall) || f.wall.length !== 2 || !f.wall.every(v => within(v, D("wall")))) return false;
  if (!Array.isArray(f.bigGoal) || f.bigGoal.length !== 2 || !f.bigGoal.every(v => within(v, D("goal")))) return false;
  if (!f.wind || typeof f.wind !== "object" || !within(f.wind.t, D("wind"))) return false;
  if (!Array.isArray(f.pu) || f.pu.length > 4 || !f.pu.every(u => u && within(u.t, PU.life) && within(u.x, W) && isPu(u.k))) return false;
  // Power-ups: Feldwirkungen, Topf, Magnet
  const pair = (a, ok) => Array.isArray(a) && a.length === 2 && a.every(ok);
  if (!pair(f.wallHp, v => within(v, PU.wallHp)) || !pair(f.slow2, v => within(v, D("time"))) || !pair(f.clone, c => c && typeof c === "object" && within(c.t, D("clone")) && within(c.hp, PU.cloneHp))) return false;
  if (!pair(f.wallCD, v => within(v, PU.hitCD)) || !pair(f.cloneCD, v => within(v, PU.hitCD))) return false;   // Sperrzeiten der Treffer
  if (!Array.isArray(f.puBag) || f.puBag.length > 16 || !f.puBag.every(isPu)) return false;
  const pt = f.portal;
  if (pt !== null && !(pt && typeof pt === "object" && within(pt.t, D("portal")) && (pt.i === 0 || pt.i === 1) && [pt.ax, pt.bx].every(v => within(v, W)) && [pt.ay, pt.by].every(v => within(v, G)))) return false;
  const sk = b.stick;
  if (sk !== null && sk !== undefined && !(typeof sk === "object" && (sk.i === 0 || sk.i === 1) && within(sk.t, PU.magHold))) return false;
  return true;
}

// Phasen: welche Unterschiede zwischen eigenem Stand (a) und Korrektur (b) entstehen, wenn die Rechnung kurz
// auseinanderläuft? d: Unterschied im Spielstand (Summe b − a), kurz: a bzw. b ist erst seit Kurzem in dieser Phase
function phaseOk(a, b, d) {
  if (b.ph !== "end" && !(b.ph in PT_MAX) && b.ph !== "play") return false;
  if (b.ph in PT_MAX && !within(b.pt, PT_MAX[b.ph])) return false;
  if (b.ph === "play" && !(num(b.pt) && b.pt <= 0.05 && b.pt > -1)) return false;
  const fresh = s => s.ph in PT_MAX && PT_MAX[s.ph] - s.pt <= FIX_DT;   // erst seit Kurzem in dieser Phase
  const late = s => s.ph in PT_MAX && s.pt <= FIX_DT;                  // bald vorbei
  if (a.ph === b.ph) return d === 0 && (!(a.ph in PT_MAX) || Math.abs(a.pt - b.pt) <= FIX_DT);
  if (b.ph === "end") return d >= 0 && endOk(b) && (a.ph === "goal" || a.t <= FIX_DT);
  if (a.ph === "end") return d <= 0 && endOk(a) && (b.ph === "goal" || b.t <= FIX_DT);
  if (d === 1) return a.ph === "play" && b.ph === "goal" && fresh(b);    // Tor beim Host, das der Gast nicht hatte
  if (d === -1) return a.ph === "goal" && b.ph === "play" && fresh(a);   // Tor beim Gast, das der Host nicht hatte
  if (d !== 0) return false;
  // dasselbe Tor, nur die Jubel- und Anstoß-Zeit verschoben: goal → ko → play
  if (a.ph === "goal" && b.ph === "ko") return late(a);
  if (a.ph === "ko" && b.ph === "goal") return late(b);
  if (a.ph === "ko" && b.ph === "play") return true;
  if (a.ph === "play" && b.ph === "ko") return true;
  if (a.ph === "goal" && b.ph === "play") return late(a);
  if (a.ph === "play" && b.ph === "goal") return late(b);
  // Countdown (Anpfiff, Golden Goal) und Spiel
  if ((a.ph === "cd" && b.ph === "play") || (a.ph === "play" && b.ph === "cd")) return true;
  return false;
}
// Ende, wie es das Spiel selbst erreicht: Zeit um ohne Gleichstand, Golden Goal, „Erster bis N“
function endOk(s) {
  const win = s.rules && s.rules.win;
  if (win) return Math.max(s.s[0], s.s[1]) >= win;
  if (s.train) return false;
  return s.s[0] !== s.s[1] && (s.gold || s.t <= 1e-6);
}

/**
 * Korrektur des Hosts plausibel? own: eigener Stand zum selben Takt, recent: eigene Stände der letzten Takte.
 * o.el: so weit darf die Spielzeit (el) abweichen (Standard FIX_DT), o.why: Gründe einer Ablehnung (Tests, Fehlersuche)
 */
export function fixOk(own, fix, recent = [], o = {}) {
  const no = why => { if (o.why) o.why.push(why); return false; };   // o.why: Gründe sammeln (Tests, Fehlersuche)
  if (!own || !fix || typeof fix !== "object" || !Array.isArray(fix.p) || fix.p.length !== 2 || !fix.b || typeof fix.b !== "object" || !Array.isArray(fix.s) || fix.s.length !== 2) return no("form");
  if (!sameFixed(own, fix)) return no("fest");
  if (!finite(fix)) return no("zahl");
  if (!inRange(fix)) return no("bereich");
  // Uhr: Spielzeit (läuft in Zeitlupe und Standbild langsamer, hängt also auch am Spielverlauf) und Restzeit (steht im
  // Torjubel) höchstens FIX_DT anders
  if (!num(fix.el) || Math.abs(fix.el - own.el) > (o.el ?? FIX_DT)) return no("spielzeit");
  if (!within(fix.t, fix.dur) || Math.abs(fix.t - own.t) > FIX_DT) return no("restzeit");
  // Hindernisse genau gleich bis auf die Lage
  const oo = own.obs || [], fo = fix.obs || [];
  if (!Array.isArray(fo) || fo.length !== oo.length || !fo.every((x, i) => obsKey(x) === obsKey(oo[i]))) return no("hindernisse");
  // Spielstand: höchstens ein Tor anders, nie auf beiden Seiten. Dazu: nur bei einem Tor in den letzten Takten
  // (Gast hatte es, Host nicht) bzw. mit dem Ball am oder hinter der Torlinie (Host hatte es, Gast nicht)
  const ds = [0, 1].map(i => fix.s[i] - own.s[i]);
  if (!fix.s.every(Number.isInteger) || ds.some(d => d < -1 || d > 1) || (ds[0] !== 0 && ds[1] !== 0)) return no("stand");
  for (let i = 0; i < 2; i++) {
    // links (0) trifft ins rechte Tor, rechts (1) ins linke
    const behind = b => b && (i ? b.x < GOAL_W + b.r : b.x > W - GOAL_W - b.r);
    if (ds[i] === 1 && !(behind(fix.b) || [own, ...recent].some(r => r && behind(r.b)))) return no("tor");
  }
  // Golden Goal: nur, wenn die Zeit um ist (eine Seite schon in der Verlängerung, die andere kurz davor)
  if (!!fix.gold !== !!own.gold) {
    const [g, n] = fix.gold ? [fix, own] : [own, fix];
    if (!g.golden || g.t > 1e-6 || n.t > FIX_DT) return no("golden");
  }
  return phaseOk(own, fix, ds[0] + ds[1]) || no("phase " + own.ph + ">" + fix.ph);
}
