// Power-ups: je Wirkung ein Test, dazu jede Regel und jeder Grenzfall der Spezifikation
// (Lebenszyklus, Topf, Gold, Ranked, Stapeln, Schutzblase, Torwand, Doppelgänger, Zeitblase, Effet, Portal, Magnet,
// Eisblock, Erdbeben, Anstoß, Rollback-Klon).
import { test } from "node:test";
import assert from "node:assert/strict";
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const U = await import("../../js/core/sim/powerups.js");
const T = await import("../../js/core/sim/tuning.js");
const { ballPhysics, ballVsPlayer } = await import("../../js/core/sim/ball.js");
const { shoePush, shoeDims, tUpOf, swingAt, swingVelAt } = await import("../../js/core/sim/shoe.js");
const { slideTrip } = await import("../../js/core/sim/tricks.js");
const { touch } = await import("../../js/core/sim/supers.js");
const { clone, hashState } = await import("../../js/core/rollback.js");
const { barY } = await import("../../js/core/sim/base.js");
const LY = await import("../../js/content/layouts.js");
const { fixOk } = await import("../../js/core/rbfix.js");
const DT = 1 / 120;
const { PU, SPIN_K, SHOE, PACE } = T;
const J = o => JSON.parse(JSON.stringify(o));

function setup(o = {}) {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, pus: true, golden: false, rules: o.rules || {}, seed: o.seed ?? 11, fair: !!o.fair, bots: o.bots });
  st.ph = "play"; st.pt = 0; st.puT = 999;
  st.p[0].x = 500; st.p[1].x = C.W - 500;
  Object.assign(st.b, { x: C.W / 2, y: 120, vx: 0, vy: 0, lt: -1 });
  return st;
}
// n Schritte (Eingaben je Schritt: inp(k, st) = [Spieler 0, Spieler 1]); liefert alle Ereignisse
function run(st, n, inp, each) {
  const evs = [];
  for (let k = 0; k < n; k++) { P.step(st, DT, inp ? inp(k, st) : [{}, {}]); evs.push(...st.ev.splice(0)); if (each) each(st, k); }
  return evs;
}
const give = (st, i, k) => { U.applyPu(st, i, k, 0, 0); return st.ev.splice(0); };
const ownCount = p => U.OWN.filter(f => p[f] > 0).length;
// Kugeln erscheinen lassen (Zeitgeber auf 0, alte Kugeln weg): Art je Erscheinen
function spawns(st, n) {
  const out = [];
  for (let k = 0; k < n; k++) { st.pu = []; st.puT = 0; U.powerups(st, DT); out.push(st.pu.map(u => u.k)); st.ev.length = 0; }
  return out;
}
const sorted = a => [...a].sort();

// ---------- Lebenszyklus ----------
test("Kugel: Ankündigung (t < 0) nicht einsammelbar, danach an den letzten Berührer; pu mit to und fam, Hit-Stop", () => {
  const st = setup();
  st.pu = [{ id: 99, k: "boot", x: 900, y: 300, t: -PU.warn }];
  const hold = s => { const u = s.pu[0]; if (u) Object.assign(s.b, { x: u.x, y: u.y + Math.sin(u.t * 3) * 10, vx: 0, vy: 0, lt: 1 }); };
  let got = null, at = 0;
  for (let k = 0; k < 200 && !got; k++) {
    hold(st); const t0 = st.pu[0].t;
    U.powerups(st, DT);
    got = st.ev.splice(0).find(e => e.t === "pu") || null; at = t0 + DT;
  }
  assert.ok(got, "eingesammelt");
  assert.ok(at >= 0 && at < 2 * DT, `erst ab t = 0 (bei ${at.toFixed(3)})`);
  assert.deepEqual({ i: got.i, k: got.k, to: got.to, fam: got.fam }, { i: 1, k: "boot", to: 1, fam: "atk" });
  assert.equal(st.p[1].bootT, 6);
  assert.equal(st.hs, PU.hs, "Hit-Stop 0,045 s");
  const el = st.el; P.advance(st, 1 / 60, [{}, {}], 0);
  assert.equal(st.el, el, "Hit-Stop hält die Physik an (bestehende Logik)");
  // Betroffener: Gegner bzw. Feld
  const s2 = setup();
  assert.equal(give(s2, 0, "mini").find(e => e.t === "pu").to, 1);
  assert.equal(give(s2, 0, "float").find(e => e.t === "pu").to, -1);
  assert.equal(give(s2, 1, "portal").find(e => e.t === "pu").fam, "gold");
});

test("Kugel: neue erscheinen angekündigt (t = -0,8), Ablauf nach 10 s mit puGone (x, y)", () => {
  const st = setup();
  const [ks] = spawns(st, 1);
  assert.equal(ks.length, 1); assert.equal(st.pu[0].t, -PU.warn + DT);
  st.puT = 999; st.pu = [{ id: 5, k: "wind", x: 900, y: 300, t: 0 }];
  let gone = null, n = 0;
  while (!gone && n < 2000) { U.powerups(st, DT); n++; gone = st.ev.splice(0).find(e => e.t === "puGone") || null; }
  assert.ok(gone); assert.deepEqual([gone.x, gone.y, gone.k], [900, 300, "wind"]);
  assert.ok(Math.abs(n * DT - PU.life) <= DT + 1e-9, `weg nach ${(n * DT).toFixed(3)} s`);
  assert.equal(st.pu.length, 0);
});

// ---------- Topf, Gold, Ranked ----------
test("Topf ohne Wiederholung: zwei Durchläufe mit je allen 16 normalen Kugeln (ohne Gold)", () => {
  const st = setup(), keys = spawns(st, 40).map(a => a[0]).filter(k => !C.POWERUPS[k].rare);
  assert.equal(C.PU_POT.length, 16);
  assert.deepEqual(sorted(keys.slice(0, 16)), sorted(C.PU_POT), "1. Durchlauf");
  assert.deepEqual(sorted(keys.slice(16, 32)), sorted(C.PU_POT), "2. Durchlauf");
  assert.notDeepEqual(keys.slice(0, 16), keys.slice(16, 32), "neu gemischt");
  assert.ok(Array.isArray(st.puBag) && st.puBag.every(k => C.PU_POT.includes(k)));
});

test("Gold: das 5. Erscheinen, danach jedes zehnte (15., 25.), Super voll und Portal im Wechsel; ohne Supers nur Portal", () => {
  assert.deepEqual([PU.goldFirst, PU.gold], [5, 10]);
  const st = setup(), keys = spawns(st, 30).map(a => a[0]);
  keys.forEach((k, n) => assert.equal(C.POWERUPS[k].rare, n % 10 === 4, `Erscheinen ${n + 1}: ${k}`));
  assert.deepEqual([keys[4], keys[14], keys[24]], ["super", "portal", "super"]);
  assert.equal(st.puN, 30); assert.equal(st.puGold, 3);
  const s2 = setup({ rules: { supers: false } }), k2 = spawns(s2, 20).map(a => a[0]);
  assert.deepEqual([k2[4], k2[14]], ["portal", "portal"]);
  // im natürlichen Spiel (90 s, etwa alle 9 s eine Kugel) kommt das erste Gold mitten im Spiel, nicht erst am Ende
  let at = 0, n = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, pus: true, golden: false, seed, bots: [3, 3] });
    for (let k = 0; k < 100 * 120 && m.ph !== "end"; k++) {
      P.step(m, DT, [{}, {}]);
      const e = m.ev.splice(0).find(x => x.t === "puSpawn" && C.POWERUPS[x.k].rare);
      if (e) { at += 90 - m.t; n++; break; }
    }
  }
  assert.ok(n >= 5, `Gold in ${n} von 6 Spielen`);
  assert.ok(at / n > 25 && at / n < 65, `erstes Gold nach ${(at / n).toFixed(0)} s Spielzeit`);
});

test("Ranked: Paar aus dem Ranked-Topf (10 Kugeln, ohne Wiederholung), nie Gold", () => {
  const st = setup({ fair: true }), sp = spawns(st, 30);
  assert.equal(C.PU_RANKED.length, 10);
  for (const a of sp) { assert.equal(a.length, 2); assert.equal(a[0], a[1], "gleiche Art"); assert.ok(C.POWERUPS[a[0]].ranked, a[0]); }
  const keys = sp.map(a => a[0]);
  for (let c = 0; c < 3; c++) assert.deepEqual(sorted(keys.slice(c * 10, c * 10 + 10)), sorted(C.PU_RANKED), `Durchlauf ${c + 1}`);
  assert.ok(!keys.some(k => C.POWERUPS[k].rare));
});

// ---------- Stapeln ----------
test("Zwei Power-ups gleichzeitig: beim selben Spieler und bei beiden Spielern", () => {
  const st = setup(), [a, b] = st.p;
  give(st, 0, "fire"); give(st, 0, "wings");
  assert.ok(a.fireNext && a.fireT === 10 && a.wingT === 7);
  give(st, 1, "boot"); give(st, 1, "head");
  assert.ok(b.bootT === 6 && b.bigT === 6);
  assert.equal(a.bootT + a.bigT + b.fireT + b.wingT, 0, "nichts springt über");
  // Feldwirkungen gleichzeitig
  give(st, 0, "wall"); give(st, 1, "wall"); give(st, 0, "clone"); give(st, 1, "time"); give(st, 0, "float"); give(st, 1, "goal");
  assert.ok(st.wall[0] > 0 && st.wall[1] > 0 && st.clone[0].t > 0 && st.slow2[1] > 0 && st.floatT > 0 && st.bigGoal[0] > 0);
});

test("Höchstens drei eigene Wirkungen: eine vierte beendet die mit der kürzesten Restzeit; Mini und Eis zählen nicht", () => {
  const st = setup(), p = st.p[0];
  give(st, 0, "fire"); give(st, 0, "wings"); give(st, 0, "boot");   // 10, 7, 6
  give(st, 1, "mini");   // fremd: zählt nicht mit
  run(st, 120);   // 9, 6, 5
  assert.equal(ownCount(p), 3); assert.ok(p.miniT > 0);
  give(st, 0, "magnet");
  assert.equal(ownCount(p), 3);
  assert.equal(p.bootT, 0, "Riesenschuh (kürzeste Restzeit) beendet");
  assert.ok(p.fireT > 0 && p.wingT > 0 && p.magT === C.POWERUPS.magnet.dur && p.miniT > 0);
  // beendetes Feuer nimmt den Feuerschuss mit
  give(st, 0, "bubble"); run(st, 10); give(st, 0, "spin");
  assert.equal(ownCount(p), 3);
});

test("Gleiches Power-up nochmal: Dauer wieder voll, Effet wieder 3, kein Platz verbraucht; Sofort-Wirkungen erneut", () => {
  const st = setup(), p = st.p[0];
  give(st, 0, "boot"); give(st, 0, "fire"); give(st, 0, "wings");
  run(st, 240);
  give(st, 0, "boot");
  assert.equal(p.bootT, 6); assert.ok(p.fireT > 0 && p.wingT > 0, "nichts beendet");
  give(st, 0, "spin"); assert.equal(ownCount(p), 3);
  p.spinN = 1; give(st, 0, "spin"); assert.equal(p.spinN, 3); assert.equal(p.spinT, 10);
  give(st, 0, "super"); p.meter = 0; p.full = false; give(st, 0, "super");
  assert.ok(p.full && p.meter === 100, "Super voll erneut");
  const q = st.p[1]; give(st, 0, "quake"); q.stun = 0; q.onG = true; q.vy = 0; give(st, 0, "quake");
  assert.ok(q.stun > 0 && q.vy < 0, "Erdbeben erneut");
});

test("Riesenkopf und Mini heben sich auf; Riesenschuh und Mini gelten beide", () => {
  const st = setup(), p = st.p[0];
  give(st, 0, "head"); assert.equal(p.bigT, 6);
  give(st, 1, "mini"); assert.equal(p.bigT, 0); assert.equal(p.miniT, C.POWERUPS.mini.dur);
  give(st, 0, "head"); assert.equal(p.miniT, 0); assert.equal(p.bigT, 6);
  const s2 = setup(), q = s2.p[0];
  give(s2, 0, "boot"); give(s2, 1, "mini"); run(s2, 120);
  assert.ok(q.bootT > 0 && q.miniT > 0 && q.sc < 0.75);
  assert.ok(Math.abs(shoeDims(q).L - 46 * SHOE.size * q.sc * PU.bootSize) < 1e-9, "Faktoren multiplizieren");
});

// ---------- Schutzblase ----------
// je negative Wirkung: wirkt sie auf Spieler 0? (Gegner 1 löst sie aus)
const NEG = {
  mini: [st => U.applyPu(st, 1, "mini", 0, 0), o => o.miniT > 0],
  ice: [st => U.applyPu(st, 1, "ice", 0, 0), o => o.frz > 0],
  quake: [st => { st.p[0].onG = true; st.p[0].vy = 0; st.p[0].stun = 0; U.applyPu(st, 1, "quake", 0, 0); }, o => o.stun > 0],
  schubser: [st => {
    const p = st.p[1], o = st.p[0];
    Object.assign(p, { x: 700, dir: -1, lgS: 1, lgV: 5, lgD: 0.5, kHitP: false, slide: 0 });
    const g = P.shoeGeo(p); Object.assign(o, { x: g.x + g.ux * g.hl, y: g.y + g.uy * g.hl, pushCD: 0, knock: 0 });
    shoePush(st, p);
  }, o => o.knock > 0],
  grätsche: [st => { st.p[0].stun = 0; st.p[1].slideDir = -1; slideTrip(st, st.p[1]); }, o => o.stun > 0],
  feuerSuper: [st => { Object.assign(st.b, { fx: "fire", fxO: 1, fxT: 1 }); st.p[0].stun = 0; touch(st, st.b, st.p[0], "head"); }, o => o.stun > 0],
  eisSuper: [st => { Object.assign(st.b, { fx: "ice", fxO: 1, fxT: 1 }); st.p[0].frz = 0; touch(st, st.b, st.p[0], "head"); }, o => o.frz > 0],
  memeSuper: [st => { Object.assign(st.b, { fx: "sad", fxO: 1, fxT: 1 }); st.p[0].sadT = 0; touch(st, st.b, st.p[0], "head"); }, o => o.sadT > 0],
};
for (const [name, [hurt, hit]] of Object.entries(NEG)) test(`Schutzblase fängt ${name} genau einmal ab`, () => {
  const st = setup(), o = st.p[0];
  give(st, 0, "bubble"); assert.equal(o.shieldT, 10);
  hurt(st);
  assert.ok(!hit(o), "erste Wirkung abgefangen");
  assert.equal(o.shieldT, 0);
  assert.equal(st.ev.splice(0).filter(e => e.t === "shield" && e.i === 0).length, 1, "Ereignis shield");
  hurt(st);
  assert.ok(hit(o), "zweite Wirkung trifft");
});

test("Schutzblase: ohne negative Wirkung bleibt sie; läuft nach 10 s ab", () => {
  const st = setup(), o = st.p[0];
  give(st, 0, "bubble"); o.onG = false; give(st, 1, "quake");   // in der Luft: Erdbeben trifft nicht, Blase bleibt
  assert.equal(o.shieldT, 10);
  run(st, 1201);
  assert.equal(o.shieldT, 0);
});

// ---------- Torwand, Doppelgänger ----------
// Ball fliegt frei (kein Spieler hat ihn eben berührt) auf Torwand bzw. Doppelgänger; Spieler stehen weit weg.
// post: im Torjubel (ballPhysics mit postGoal)
function shootAt(st, x, y, vx, n = 40, post = false) {
  Object.assign(st.b, { x, y, vx, vy: 0, fx: "", tch: 1 });
  st.p.forEach((p, i) => { p.x = C.W - 150 - 150 * i; });   // weit weg vom linken Tor
  const evs = []; for (let k = 0; k < n; k++) { ballPhysics(st, DT, post); U.fieldTimers(st, DT); evs.push(...st.ev.splice(0)); }
  return evs;
}
test("Torwand: zwei harte Treffer (ab 1200) brechen sie, ein schwacher zählt nicht; 5 s", () => {
  const st = setup(), wx = C.GOAL_W + 10;
  give(st, 0, "wall"); assert.deepEqual([st.wall[0], st.wallHp[0]], [5, 2]);
  let e = shootAt(st, wx + 80, C.G - 80, -800);
  assert.ok(e.some(x => x.t === "wallhit") && !e.some(x => x.t === "wallcrack"), "schwach: kein Riss"); assert.equal(st.wallHp[0], 2);
  e = shootAt(st, wx + 80, C.G - 80, -1500);
  assert.ok(e.some(x => x.t === "wallcrack" && x.hp === 1)); assert.equal(st.wallHp[0], 1); assert.ok(st.b.vx > 0, "prallt ab");
  e = shootAt(st, wx + 80, C.G - 80, -1500);
  assert.ok(e.some(x => x.t === "wallbreak")); assert.equal(st.wall[0], 0);
  e = shootAt(st, wx + 80, C.G - 80, -1500);
  assert.ok(!e.some(x => x.t === "wallhit"), "weg: Ball geht durch");
  const s2 = setup(); give(s2, 1, "wall"); run(s2, 601); assert.equal(s2.wall[1], 0); assert.equal(s2.wallHp[1], 0);
});

test("Doppelgänger: fester Kopf vor dem eigenen Tor, Ball prallt ab, zwei Treffer ab 600; schwach zählt nicht; 6 s", () => {
  const st = setup(), cx = C.GOAL_W + C.HR, cy = C.G - C.HR;
  give(st, 0, "clone"); assert.deepEqual(st.clone[0], { t: 6, hp: 2 }); assert.equal(st.clone[1].t, 0);
  let e = shootAt(st, cx + 160, cy, -300, 60);
  assert.ok(st.b.vx > 0, "prallt ab"); assert.ok(!e.some(x => x.t === "clonehit")); assert.equal(st.clone[0].hp, 2);
  e = shootAt(st, cx + 160, cy, -1000);
  assert.ok(e.some(x => x.t === "clonehit" && x.hp === 1)); assert.ok(st.b.vx > 0);
  e = shootAt(st, cx + 160, cy, -1000);
  assert.ok(e.some(x => x.t === "clonebreak")); assert.deepEqual(st.clone[0], { t: 0, hp: 0 });
  e = shootAt(st, cx + 160, cy, -1000, 20);
  assert.ok(st.b.vx < 0, "weg: kein Abprall");
  const s2 = setup(); give(s2, 1, "clone"); run(s2, 721); assert.equal(s2.clone[1].t, 0);
});

// ---------- Ball: Zeitblase, Schwerelos, Effet, Portal ----------
function oneStep(o, f) {
  const st = setup(); f && f(st); Object.assign(st.b, { lt: 0, ...o });
  const x0 = st.b.x, y0 = st.b.y, vy0 = st.b.vy; ballPhysics(st, DT, true);
  return { dx: st.b.x - x0, dy: st.b.y - y0, dvy: st.b.vy - vy0 };
}
test("Zeitblase: Ball in der eigenen Hälfte halb so schnell (Bewegung und Schwerkraft), in der anderen normal; 3 s", () => {
  const left = { x: 400, y: 200, vx: 600, vy: 0 }, right = { x: C.W - 400, y: 200, vx: 600, vy: 0 };
  const n = oneStep(left), s = oneStep(left, st => give(st, 0, "time"));
  assert.ok(Math.abs(s.dx / n.dx - 0.5) < 0.01 && Math.abs(s.dvy / n.dvy - 0.5) < 1e-9, `${s.dx / n.dx}`);
  assert.deepEqual(oneStep(right, st => give(st, 0, "time")), oneStep(right), "andere Hälfte unverändert");
  const r = oneStep(right, st => give(st, 1, "time"));
  assert.ok(Math.abs(r.dx / oneStep(right).dx - 0.5) < 0.01, "Gegner: seine Hälfte");
  const st = setup(); give(st, 0, "time"); run(st, 361); assert.equal(st.slow2[0], 0);
});

test("Schwerelos: Schwerkraft des Balls ×0,4 für beide; 5 s", () => {
  for (const x of [400, C.W - 400]) {
    const n = oneStep({ x, y: 200, vx: 0, vy: 0 }), f = oneStep({ x, y: 200, vx: 0, vy: 0 }, st => give(st, 1, "float"));
    assert.ok(Math.abs(f.dvy / n.dvy - PU.floatG) < 1e-9);
  }
  const st = setup(); give(st, 0, "float"); run(st, 601); assert.equal(st.floatT, 0);
});

// Flugweite eines 45°-Schusses mit 1600 vom Boden (breites Feld, damit keine Wand im Weg ist)
function range(spin) {
  const st = setup({ rules: { field: 1.6 } }), b = st.b, a = Math.PI / 4;
  st.p.forEach(p => { p.x = -9999; });
  Object.assign(b, { x: 40, y: C.G - b.r, vx: 1600 * Math.cos(a), vy: -1600 * Math.sin(a), spin, lt: 0 });
  for (let k = 0; k < 4000; k++) { const vy0 = b.vy; ballPhysics(st, DT / 2, true); if (k > 5 && vy0 > 0 && b.y + b.r >= C.G - 0.01) return b.x - 40; }
  return NaN;
}
test("Effet: senkt die Flugbahn (45° mit 1600 fliegt etwa 25 % kürzer), Bodenberührung löscht ihn", () => {
  const r0 = range(0), r1 = range(1);
  setup();   // Feldbreite zurück
  assert.ok(r1 / r0 > 0.72 && r1 / r0 < 0.78, `kürzer um ${((1 - r1 / r0) * 100).toFixed(1)} % (SPIN_K ${SPIN_K})`);
  const a = oneStep({ x: 900, y: 200, vx: 1000, vy: -600, spin: 1 }), b = oneStep({ x: 900, y: 200, vx: 1000, vy: -600 });
  assert.ok(Math.abs(a.dvy - b.dvy - SPIN_K * Math.hypot(1000, -600) * DT) < 1, "Abwärtsbeschleunigung SPIN_K * Tempo");
  const st = setup(); Object.assign(st.b, { x: 900, y: 500, vx: 300, vy: 400, spin: 1 });
  for (let k = 0; k < 60 && st.b.spin; k++) ballPhysics(st, DT, true);
  assert.equal(st.b.spin, 0); assert.ok(st.b.y + st.b.r >= C.G - 1, "gelöscht am Boden");
});

// Schuss aus dem Stand auf einen ruhenden Ball (wie shoe.test.mjs); liefert das kick-Ereignis
function kickOnce(st, dx = 80, h = 0) {
  const p = st.p[0];
  for (let k = 0; k < 60; k++) {
    Object.assign(st.b, { x: p.x + dx, y: C.G - st.b.r - h, vx: 0, vy: 0 });
    P.step(st, DT, [{ k: k < 2 }, {}]);
    const e = st.ev.splice(0).find(x => x.t === "kick" || x.t === "super");
    if (e) { run(st, 30); return e; }
  }
  return null;
}
test("Effet: drei Schüsse mit Topspin, jeder zählt herunter; danach aus", () => {
  const st = setup(), p = st.p[0];
  give(st, 0, "spin"); assert.deepEqual([p.spinN, p.spinT], [3, 10]);
  for (let n = 3; n >= 1; n--) {
    p.x = 500; p.vx = 0; Object.assign(st.b, { spin: 0 });
    const pp = p.lgS; assert.equal(pp, 0);
    let spun = false;
    for (let k = 0; k < 60 && !spun; k++) {
      Object.assign(st.b, { x: p.x + 80, y: C.G - st.b.r, vx: 0, vy: 0 });
      P.step(st, DT, [{ k: k < 2 }, {}]);
      if (st.ev.splice(0).some(x => x.t === "kick")) { spun = true; assert.equal(st.b.spin, 1, "Ball mit Effet"); }
    }
    assert.ok(spun); assert.equal(p.spinN, n - 1);
    run(st, 40);
  }
  assert.equal(p.spinT, 0, "aufgebraucht");
  p.x = 500; kickOnce(st); assert.equal(st.b.spin, 0, "vierter Schuss ohne Effet");
});

test("Effet: jede Berührung (Kopf, Schuh, Latte, Wand, Hindernis) löscht ihn, Super auch und zählt nicht", () => {
  // Kopf
  let st = setup(); const p = st.p[0];
  Object.assign(st.b, { x: p.x + 70, y: p.y - 20, vx: -400, vy: 0, spin: 1 }); ballVsPlayer(st, st.b, p, DT);
  assert.equal(st.b.spin, 0, "Kopf");
  // gehaltener Schuh (kein Schuss)
  st = setup(); run(st, 40, () => [{ k: true }, {}]); const g = P.shoeGeo(st.p[0]);
  Object.assign(st.b, { x: g.x + 50, y: g.y - 5, vx: -900, vy: 0, spin: 1 }); run(st, 6, () => [{ k: true }, {}]);
  assert.equal(st.b.spin, 0, "Schuh");
  // Seitenwand und Latte
  st = setup(); Object.assign(st.b, { x: C.W - 30, y: 200, vx: 900, vy: 0, spin: 1 }); for (let k = 0; k < 5; k++) ballPhysics(st, DT, true);
  assert.equal(st.b.spin, 0, "Wand");
  st = setup(); const by = P.barY(st, 0); Object.assign(st.b, { x: C.GOAL_W / 2, y: by - 40, vx: 0, vy: 900, spin: 1 }); for (let k = 0; k < 10; k++) ballPhysics(st, DT, true);
  assert.equal(st.b.spin, 0, "Latte");
  // Hindernis
  st = setup({ rules: { obs: 0 } }); const o = st.obs.find(x => x.t === "plat");
  Object.assign(st.b, { x: o.x, y: o.y - 60, vx: 0, vy: 900, spin: 1 }); for (let k = 0; k < 10; k++) ballPhysics(st, DT, true);
  assert.equal(st.b.spin, 0, "Hindernis");
  // Feuer-Power-up und Effet: der Super-Schuss löscht den Effet und zählt nicht
  st = setup(); give(st, 0, "spin"); give(st, 0, "fire");
  const e = kickOnce(st);
  assert.equal(e.t, "super"); assert.equal(st.b.fx, "fire"); assert.equal(st.b.spin, 0); assert.equal(st.p[0].spinN, 3);
  assert.equal(st.p[0].fireT, 0, "Feuer verbraucht");
});

test("Portal: teleportiert einmal auf den Ausgang, Tempo, Richtung und Effet bleiben; danach weg", () => {
  const st = setup(); st.p[0].x = 900; st.p[1].x = 1050;
  give(st, 0, "portal"); const pt = { ...st.portal };
  assert.deepEqual([pt.i, pt.ax, pt.ay, pt.bx, pt.by], [0, C.W * 0.3, C.G - 110, C.W - C.GOAL_W - 230, C.G - 220]);
  Object.assign(st.b, { x: pt.ax + 80, y: pt.ay, vx: -900, vy: -50, spin: 1, lt: 0 });
  let tele = null;
  for (let k = 0; k < 30 && !tele; k++) {
    const v0 = [st.b.vx, st.b.vy]; ballPhysics(st, DT, false);
    tele = st.ev.splice(0).find(x => x.t === "portal");
    if (tele) {
      assert.deepEqual([st.b.x, st.b.y], [pt.bx, pt.by]);
      assert.ok(Math.abs(st.b.vx - v0[0]) < 2 && Math.abs(st.b.vy - v0[1]) < 12, "Tempo bleibt");
    }
  }
  assert.ok(tele); assert.equal(st.b.spin, 1, "Effet bleibt"); assert.equal(st.portal, null);
  Object.assign(st.b, { x: pt.ax + 80, y: pt.ay, vx: -900, vy: -50 });
  for (let k = 0; k < 30; k++) ballPhysics(st, DT, false);
  assert.ok(!st.ev.some(x => x.t === "portal"), "nur einmal");
  const s2 = setup(); give(s2, 0, "portal"); run(s2, 721); assert.equal(s2.portal, null, "Zeit um");
});

test("Portal: ein zweites ersetzt das erste", () => {
  const st = setup(); give(st, 0, "portal"); run(st, 60); give(st, 1, "portal");
  assert.deepEqual([st.portal.i, st.portal.ax, st.portal.bx, st.portal.t], [1, C.W * 0.7, C.GOAL_W + 230, 6]);
});

// ---------- Magnetschuh ----------
// Bein oben halten, Ball langsam an die Schuhspitze: gefangen
function caught(o = {}) {
  const st = setup(), p = st.p[0];
  give(st, 0, "magnet");
  run(st, 40, () => [{ k: true }, {}]);
  assert.equal(p.lgS, 2);
  const g = P.shoeGeo(p), k = g.hl + g.rs + st.b.r - 3;
  Object.assign(st.b, { x: g.x + g.ux * k, y: g.y + g.uy * k, vx: o.vx ?? -200, vy: 100, lt: 1 });
  const evs = run(st, 1, () => [{ k: true }, {}]);
  return { st, p, evs };
}
const tip = (st, p) => { const g = P.shoeGeo(p), k = g.hl + g.rs + st.b.r; return [g.x + g.ux * k, g.y + g.uy * k]; };
test("Magnet: hält einen langsamen Ball auf der Schuhspitze, er folgt ihr, Laufen ×0,8", () => {
  const { st, p, evs } = caught();
  assert.ok(evs.some(e => e.t === "magnet")); assert.deepEqual(st.b.stick, { i: 0, t: PU.magHold });
  assert.equal(st.b.lt, 0, "gehört dem Halter");
  run(st, 30, () => [{ k: true, r: true }, {}], s => { const [x, y] = tip(s, p); assert.ok(Math.abs(s.b.x - x) < 1e-6 && Math.abs(s.b.y - y) < 1e-6, "auf der Spitze"); });
  assert.ok(st.b.stick);
  const ref = setup(); run(ref, 30, () => [{ r: true }, {}]);
  assert.ok(Math.abs(p.vx / ref.p[0].vx - PU.magRun) < 0.02, `Laufen ×${(p.vx / ref.p[0].vx).toFixed(3)}`);
  // zu schnell (Relativtempo über PU.magRel): kein Fangen (prallt am weichen Bein ab)
  const f = caught({ vx: -PU.magRel - 300 });
  assert.equal(f.st.b.stick, null);
});

test("Magnet: Loslassen = Schuss (kick, PU.magShot = 2000 × PACE, Winkel nach Höhe)", () => {
  const { st, p } = caught();
  run(st, 10, () => [{ k: true }, {}]);
  const evs = run(st, 2, () => [{}, {}]);
  const k = evs.find(e => e.t === "kick");
  assert.ok(k && k.mag, "Schuss beim Loslassen");
  assert.equal(PU.magShot, 2000 * PACE);
  assert.ok(Math.abs(k.spd - Math.min(PU.magShot, T.KICK.cap)) < 1e-6);
  assert.equal(st.b.stick, null); assert.ok(st.b.vx > 1000, "nach vorne");
  assert.equal(st.stats[0].shots, 1); assert.equal(p.lgS, 3);
});

test("Magnet: nach PU.magHold (1 s) fällt der Ball (kein Schuss), Bein geht zurück; Ablauf des Power-ups löst ihn", () => {
  const { st, p } = caught();
  let n = 0;
  const evs = run(st, Math.ceil(PU.magHold / DT) + 20, () => [{ k: true }, {}], s => { if (s.b.stick) n++; });
  assert.ok(Math.abs((n + 1) * DT - PU.magHold) <= 2 * DT, `gehalten ${((n + 1) * DT).toFixed(3)} s`);
  assert.ok(!evs.some(e => e.t === "kick")); assert.equal(st.b.stick, null); assert.notEqual(p.lgS, 2, "Bein unten, neu drücken");
  const c2 = caught(); c2.p.magT = DT / 2; run(c2.st, 2, () => [{ k: true }, {}]);
  assert.equal(c2.st.b.stick, null);
});

test("Magnet: Gegner berührt den Ball, Grätsche, Schubser, Einfrieren, Super: Ball löst sich", () => {
  const cases = {
    gegner: ({ st }) => { Object.assign(st.p[1], { x: st.b.x + 60, y: st.b.y, vx: 0, vy: 0 }); },
    grätsche: ({ st }) => { st.p[1].slideDir = -1; slideTrip(st, st.p[1]); assert.equal(st.b.stick, null, "sofort"); },
    schubser: ({ st }) => { const p = st.p[1], o = st.p[0]; Object.assign(p, { x: o.x + 120, dir: -1, lgS: 1, lgV: 5, lgD: 0.5, kHitP: false }); const g = P.shoeGeo(p); Object.assign(o, { x: g.x + g.ux * g.hl }); shoePush(st, p); assert.equal(st.b.stick, null, "sofort"); },
    eis: ({ st }) => { give(st, 1, "ice"); assert.equal(st.b.stick, null, "sofort"); },
    super: ({ p }) => { p.full = true; },
  };
  for (const [name, f] of Object.entries(cases)) {
    const c = caught(); f(c);
    run(c.st, 2, () => [{ k: true, s: name === "super" }, {}]);
    assert.equal(c.st.b.stick, null, name);
    if (name === "super") assert.ok(c.st.b.fx, "Super läuft");
  }
});

// ---------- Eisblock, Erdbeben ----------
test("Eisblock: 2,2 s eingefroren; jeder neue Tastendruck taut 0,15 ab (icetap), vorzeitig frei (icebreak)", () => {
  const st = setup(), o = st.p[0], D = C.POWERUPS.ice.dur;
  assert.equal(D, 2.2);
  give(st, 1, "ice"); assert.equal(o.frz, D); assert.ok(o.iceB);
  let n = 0; run(st, 400, null, s => { if (s.p[0].frz > 0) n++; });
  assert.ok(Math.abs((n + 1) * DT - D) <= 2 * DT, "ohne Tasten ganz");
  const s2 = setup(), o2 = s2.p[0]; give(s2, 1, "ice");
  let m = 0; const evs = run(s2, 400, k => [{ l: k % 2 === 0, j: k % 4 === 1 }, {}], s => { if (s.p[0].frz > 0) m++; });
  assert.ok(m * DT < 0.5, `Hämmern: frei nach ${(m * DT).toFixed(2)} s`);
  assert.ok(evs.filter(e => e.t === "icetap").length >= 5); assert.equal(evs.filter(e => e.t === "icebreak").length, 1);
  assert.equal(o2.iceB, false);
  // gehaltene Taste zählt nur einmal
  const s3 = setup(); give(s3, 1, "ice"); const e3 = run(s3, 30, () => [{ r: true }, {}]);
  assert.equal(e3.filter(e => e.t === "icetap").length, 1);
  // Eis-Super (abgewehrt) lässt sich nicht freihämmern
  const s4 = setup(); Object.assign(s4.b, { fx: "ice", fxO: 1, fxT: 1 }); touch(s4, s4.b, s4.p[0], "head");
  const f0 = s4.p[0].frz; run(s4, 6, k => [{ l: k % 2 === 0 }, {}]);
  assert.ok(Math.abs(f0 - s4.p[0].frz - 6 * DT) < 1e-9);
});

test("Erdbeben: nur wer am Boden steht, hüpft und taumelt; liegender Ball springt, fliegender nicht", () => {
  const st = setup(), o = st.p[0];
  Object.assign(st.b, { y: C.G - st.b.r, vy: 0 });
  const e = give(st, 1, "quake");
  assert.ok(e.some(x => x.t === "quake" && x.i === 1));
  assert.ok(o.vy < 0 && !o.onG && Math.abs(o.stun - PU.quakeStun) < 1e-12);
  assert.ok(Math.abs(st.b.vy + T.bv(PU.quakeB)) < 1e-9);
  const s2 = setup(), q = s2.p[0]; run(s2, 10, k => [{ j: k < 3 }, {}]);
  const vy = q.vy, bvy = s2.b.vy; assert.ok(!q.onG && s2.b.y + s2.b.r < C.G - 2);
  give(s2, 1, "quake"); assert.equal(q.vy, vy); assert.equal(q.stun, 0);
  assert.equal(s2.b.vy, bvy, "Ball in der Luft unverändert");
});

// ---------- übrige Wirkungen ----------
test("Feuerschuss: nächster Schuss wird Feuer-Super; nach 10 s verfällt er", () => {
  const st = setup(), p = st.p[0];
  give(st, 0, "fire"); assert.ok(p.fireNext && p.fireT === 10);
  run(st, 1201); assert.equal(p.fireNext, false); assert.equal(p.fireT, 0);
  const s2 = setup(); give(s2, 0, "fire"); const e = kickOnce(s2);
  assert.equal(e.t, "super"); assert.equal(s2.b.fx, "fire"); assert.equal(s2.p[0].fireNext, false);
});

test("Riesenschuh: Kapsel ×1,6, Schwung nach oben ×1,25 langsamer, Schuss kräftiger; 6 s", () => {
  const st = setup(), p = st.p[0], d0 = shoeDims(p), u0 = tUpOf(p);
  give(st, 0, "boot");
  const d1 = shoeDims(p);
  assert.ok(Math.abs(d1.L / d0.L - 1.6) < 1e-12 && Math.abs(d1.rs / d0.rs - 1.6) < 1e-12);
  assert.ok(Math.abs(tUpOf(p) / u0 - PU.bootUp) < 1e-12);
  assert.equal(swingAt(SHOE.tUp), 1, "ohne Spieler (Bot): wie bisher"); assert.ok(swingAt(SHOE.tUp, p) < 1, "je Spieler langsamer");
  assert.equal(swingAt(SHOE.tUp * PU.bootUp, p), 1); assert.equal(swingVelAt(SHOE.tUp * PU.bootUp, p), 0);
  let up = 0; run(st, 40, k => [{ k: k < 2 }, {}], s => { if (s.p[0].lgS === 1) up++; });
  assert.ok(Math.abs(up * DT - SHOE.tUp * PU.bootUp) <= 2 * DT, `hoch in ${(up * DT).toFixed(3)} s`);
  // gleicher Treffpunkt: mit Riesenschuh schneller
  const a = kickOnce(setup()), b2 = setup(); give(b2, 0, "boot"); const b = kickOnce(b2);
  assert.ok(b.spd > a.spd, `${a.spd.toFixed(0)} → ${b.spd.toFixed(0)}`);
  const s3 = setup(); give(s3, 0, "boot"); run(s3, 721); assert.equal(s3.p[0].bootT, 0);
});

test("Riesentor: Tor des Gegners 120 px höher (PU.goalUp), 6 s", () => {
  assert.equal(PU.goalUp, 120);
  const st = setup(), b0 = P.barY(st, 1);
  give(st, 0, "goal"); assert.equal(P.barY(st, 1), b0 - PU.goalUp); assert.equal(P.barY(st, 0), P.barY(setup(), 0));
  run(st, 721); assert.equal(st.bigGoal[1], 0);
});

test("Flügelschuhe: Laufen ×1,2, Sprung ×1,1, ein Doppelsprung je Luftphase; 7 s", () => {
  const n = setup(), w = setup(); give(w, 0, "wings");
  run(n, 60, () => [{ r: true }, {}]); run(w, 60, () => [{ r: true }, {}]);
  assert.ok(Math.abs(w.p[0].vx / n.p[0].vx - PU.wingRun) < 1e-9);
  const n2 = setup(), w2 = setup(); give(w2, 0, "wings");
  run(n2, 1, () => [{ j: true }, {}]); run(w2, 1, () => [{ j: true }, {}]);
  assert.ok(Math.abs(w2.p[0].vy / n2.p[0].vy - PU.wingJump) < 0.01);
  const jumps = run(w2, 100, k => [{ j: (k > 30 && k < 34) || (k > 50 && k < 54) }, {}]).filter(e => e.t === "jump");
  assert.equal(jumps.length, 1, "genau ein Doppelsprung"); assert.ok(jumps[0].dbl);
  assert.equal(run(n2, 100, k => [{ j: k > 30 && k < 34 }, {}]).filter(e => e.t === "jump").length, 0, "ohne: keiner");
  run(w2, 841); assert.equal(w2.p[0].wingT, 0);
});

test("Riesenkopf: Kopf ×1,5, Kopfball-Wucht ×1,4 (PU.headSize, PU.headPow); 6 s", () => {
  assert.deepEqual([PU.headSize, PU.headPow], [1.5, 1.4]);
  const st = setup(), p = st.p[0]; give(st, 0, "head");
  run(st, 120); assert.ok(Math.abs(p.sc - PU.headSize) < 0.01);
  const hit = big => {
    const s = setup(), q = s.p[0]; Object.assign(q, { bigT: big ? 6 : 0, sc: 1, vy: -400, vx: 0, onG: false, y: 400 });
    Object.assign(s.b, { x: q.x, y: q.y - C.HR - s.b.r + 2, vx: 0, vy: 200 }); ballVsPlayer(s, s.b, q, DT); return s.b.vy;
  };
  const d = hit(false) - hit(true);
  assert.ok(Math.abs(d - T.bv(260) * (PU.headPow - 1)) < 1e-6, `Wucht ${d}`);
  run(st, 600); assert.equal(p.bigT, 0);
});

test("Mini-Gegner: Gegner ×0,7 für 8 s, Schuss −35 %, Laufen ×0,9; Rückenwind; Super voll", () => {
  assert.deepEqual([C.POWERUPS.mini.dur, PU.miniPow, PU.miniRun], [8, 0.65, 0.9]);
  const st = setup(), o = st.p[1];
  give(st, 0, "mini"); assert.equal(o.miniT, 8); run(st, 120); assert.ok(o.sc < 0.72);
  run(st, 841); assert.equal(o.miniT, 0);
  const n = setup(), m = setup(); give(m, 1, "mini");
  run(n, 60, () => [{ r: true }, {}]); run(m, 60, () => [{ r: true }, {}]);
  assert.ok(Math.abs(m.p[0].vx / n.p[0].vx - PU.miniRun) < 1e-9, "Mini läuft langsamer");
  const w = setup(); w.p[1].dir = -1; give(w, 1, "wind"); assert.deepEqual(w.wind, { t: 5, dir: -1 });
  const s = setup(); give(s, 0, "super"); assert.ok(s.p[0].full && s.p[0].meter === 100);
});

// ---------- Anstoß, Rollback ----------
test("Anstoß löscht alle Spieler- und Feldwirkungen, die Kugeln bleiben; Topf, Zähler und Gold bleiben", () => {
  const st = setup(); spawns(st, 12);
  const bag = [...st.puBag], n = st.puN, g = st.puGold;
  for (const k of C.PU_KEYS) { give(st, 0, k); give(st, 1, k); }
  st.b.spin = 1; st.b.stick = { i: 0, t: 0.3 };
  const orbs = J(st.pu);
  assert.ok(orbs.length > 0);
  for (const u of st.pu) u.x = 400;   // weit weg vom Anstoßpunkt
  orbs.forEach(u => { u.x = 400; });
  P.kickoff(st);
  const fresh = setup();
  for (const i of [0, 1]) for (const f of [...U.OWN, "spinN", "miniT", "frz", "fireNext", "iceB"]) assert.equal(st.p[i][f], fresh.p[i][f], `${i}.${f}`);
  for (const f of ["wall", "wallHp", "bigGoal", "wind", "clone", "slow2", "floatT", "portal"]) assert.deepEqual(st[f], fresh[f], f);
  assert.deepEqual(J(st.pu), orbs, "Kugeln bleiben mit Ort, Art und Restzeit");
  assert.equal(st.b.spin, 0); assert.equal(st.b.stick, null);
  assert.deepEqual([st.puBag, st.puN, st.puGold], [bag, n, g]);
});

test("Rollback: Klon mitten in jeder Wirkung rechnet gleich weiter (hashState); Korrektur-Prüfung nimmt ehrliche Stände", () => {
  for (const k of C.PU_KEYS) {
    const st = setup({ bots: [2, 2], seed: 3 }); st.puT = 2;
    run(st, 240); give(st, 0, k); give(st, 1, k); run(st, 30);
    const c = clone(st);
    for (let n = 0; n < 6; n++) { run(st, 60); run(c, 60); assert.equal(hashState(c), hashState(st), `${k}, Abschnitt ${n}`); }
    const j = J(st); assert.equal(fixOk(j, J(st)), true, `${k}: Stand im Rahmen`);
  }
  // mitten im Halten (Magnet) und mit Effet in der Luft
  const m = caught().st, mc = clone(m);
  const inp = k => [{ k: k < 20, r: k < 30 }, {}];
  const e1 = run(m, 90, inp), e2 = run(mc, 90, inp);
  assert.equal(hashState(m), hashState(mc)); assert.deepEqual(e1, e2);
  const s = setup(); Object.assign(s.b, { x: 900, y: 300, vx: 800, vy: -500, spin: 1 }); give(s, 0, "time"); give(s, 1, "float");
  const sc = clone(s); run(s, 120); run(sc, 120); assert.equal(hashState(s), hashState(sc));
});

// ---------- Grenzfälle: Klemme an Wand und Klon, Sperrzeit, Nachbarschaft ----------
// Spieler side ⇒ Wand/Klon vor dem eigenen Tor; der Gegner läuft mit dem Ball vor dem Kopf darauf zu (Klemme)
function clampRun(what, side, by, fx) {
  const st = setup(), p = st.p[1 - side], fd = side ? -1 : 1;
  st.p[side].x = side ? C.W - 900 : 900;
  give(st, side, what);
  if (fx === "head") give(st, 1 - side, "head");
  if (fx === "mini") give(st, side, "mini");
  run(st, 30);   // Größe stellt sich ein
  Object.assign(p, { x: side ? C.W - 380 : 380, dir: -fd, vx: 0 });
  Object.assign(st.b, { x: side ? C.W - 300 : 300, y: by, vx: 0, vy: 0, lt: 1 - side });
  let maxV = 0;
  const evs = run(st, 400, () => { const c = { [side ? "r" : "l"]: true }; return side ? [c, {}] : [{}, c]; }, s => { maxV = Math.max(maxV, Math.hypot(s.b.vx, s.b.vy)); });
  return { st, evs, maxV };
}
test("Torwand/Doppelgänger: Klemme zählt nicht als Treffer (Kopf schiebt den Ball dagegen, auch Mini und Riesenkopf, beide Seiten)", () => {
  for (const what of ["wall", "clone"]) for (const side of [0, 1]) for (const by of [C.G - 24, C.G - 60]) for (const fx of ["", "head", ...(what === "wall" ? ["mini"] : [])]) {
    const name = `${what} ${side} ${by} ${fx}`, { st, evs, maxV } = clampRun(what, side, by, fx);
    assert.ok(maxV > (what === "wall" ? PU.wallHard : PU.cloneHard), `${name}: Klemme erzeugt hohes Tempo (${maxV.toFixed(0)})`);
    assert.deepEqual(evs.filter(e => ["wallcrack", "wallbreak", "clonehit", "clonebreak"].includes(e.t)).map(e => e.t), [], name);
    assert.ok(!evs.some(e => e.t === "goal" && e.i === 1 - side), `${name}: kein Tor (Ball rutscht weder durch die Wand noch unter dem Klon durch)`);   // (abgeprallt ins andere Tor zählt nicht)
    if (what === "wall") assert.equal(st.wallHp[side], PU.wallHp, name); else assert.equal(st.clone[side].hp, PU.cloneHp, name);
  }
});

test("Torwand/Doppelgänger: zwei echte harte Schüsse brechen weiterhin; Sperrzeit 0,3 s zwischen zwei Treffern", () => {
  // Torwand: zwei Schüsse eines Spielers vom Boden aus 260 px
  const st = setup(); give(st, 0, "wall"); st.p[0].x = 900;
  const p = st.p[1], wx = C.GOAL_W + 10, evs = [];
  for (let shot = 0; shot < 2; shot++) {
    Object.assign(p, { x: wx + 330, dir: -1, vx: 0 }); Object.assign(st.b, { x: wx + 260, y: C.G - st.b.r, vx: 0, vy: 0 });
    evs.push(...run(st, 60, k => [{}, { k: k < 3 }]));
  }
  assert.equal(evs.filter(e => e.t === "kick" && e.spd >= PU.wallHard).length, 2, "zwei harte Schüsse");
  assert.deepEqual(evs.filter(e => ["wallcrack", "wallbreak"].includes(e.t)).map(e => e.t), ["wallcrack", "wallcrack", "wallbreak"]);
  assert.equal(st.wall[0], 0);
  // Doppelgänger: eben berührt, aber frei geflogen (länger als PU.hitGap) zählt
  const s2 = setup(), cx = C.GOAL_W + C.HR, cy = C.G - C.HR; give(s2, 0, "clone");
  for (let n = 0; n < 2; n++) { const e = shootAt(s2, cx + 200, cy, -1000); s2.b.tch = 0; Object.assign(s2.b, { x: cx + 200, y: cy, vx: -1000, vy: 0 }); assert.ok(e.some(x => x.t === "clonehit")); }
  assert.equal(s2.clone[0].t, 0, "zwei Treffer: weg");
  const s3 = setup(); give(s3, 0, "clone");
  Object.assign(s3.b, { x: cx + 200, y: cy, vx: -1000, vy: 0, tch: 0 });
  const e3 = []; for (let k = 0; k < 40; k++) { ballPhysics(s3, DT, false); U.fieldTimers(s3, DT); e3.push(...s3.ev.splice(0)); }
  assert.ok(e3.some(x => x.t === "clonehit"), "Berührung lange genug her");
  // gleich darauf ein zweiter harter Treffer: Sperrzeit, erst danach wieder
  const s4 = setup(); give(s4, 0, "wall");
  Object.assign(s4.b, { x: wx + 40, y: C.G - 80, vx: -1500, vy: 0, tch: 1 });
  ballPhysics(s4, DT, false); assert.equal(s4.wallHp[0], 1);
  Object.assign(s4.b, { x: wx + 40, y: C.G - 80, vx: -1500, vy: 0 });
  ballPhysics(s4, DT, false); assert.equal(s4.wallHp[0], 1, "Sperrzeit");
  for (let k = 0; k < Math.ceil(PU.hitCD / DT); k++) U.fieldTimers(s4, DT);
  Object.assign(s4.b, { x: wx + 40, y: C.G - 80, vx: -1500, vy: 0 });
  ballPhysics(s4, DT, false); assert.equal(s4.wall[0], 0, "nach der Sperrzeit zählt er");
  // eben vom Spieler berührt (Kopf schiebt): zählt nicht
  const s5 = setup(); give(s5, 0, "wall");
  Object.assign(s5.b, { x: wx + 40, y: C.G - 80, vx: -1500, vy: 0, tch: 0 });
  ballPhysics(s5, DT, false); assert.equal(s5.wallHp[0], 2);
});

test("Torwand/Doppelgänger im Torjubel: Ball prallt ab, aber kein Treffer und kein Ereignis", () => {
  const st = setup(); give(st, 0, "wall"); give(st, 0, "clone");
  let e = shootAt(st, C.GOAL_W + 90, C.G - 220, -1500, 40, true);
  assert.ok(st.b.vx > 0, "prallt ab"); assert.equal(st.wallHp[0], 2);
  assert.deepEqual(e.filter(x => ["wallhit", "wallcrack", "wallbreak"].includes(x.t)), []);
  e = shootAt(st, C.GOAL_W + C.HR + 200, C.G - C.HR, -1500, 40, true);
  assert.ok(st.b.vx > 0, "prallt ab"); assert.equal(st.clone[0].hp, 2);
  assert.deepEqual(e.filter(x => ["clonehit", "clonebreak"].includes(x.t)), []);
});

test("Torwand hält nur nach vorne: hineingedrückter Ball kommt auf die Feldseite; Doppelgänger drückt nie in den Boden", () => {
  for (const side of [0, 1]) {
    const st = setup(), fd = side ? -1 : 1, wx = side ? C.W - C.GOAL_W - 10 : C.GOAL_W + 10; give(st, side, "wall");
    Object.assign(st.b, { x: wx - fd * 3, y: C.G - 60, vx: 0, vy: 0 });
    ballPhysics(st, DT, false);
    assert.ok((st.b.x - wx) * fd >= 7 + st.b.r - 1e-9, `Seite ${side}: vor der Wand (${st.b.x.toFixed(1)})`);
    const s2 = setup(), cx = side ? C.W - C.GOAL_W - C.HR : C.GOAL_W + C.HR; give(s2, side, "clone");
    Object.assign(s2.b, { x: cx - fd * 20, y: C.G - s2.b.r, vx: 0, vy: 0 });
    ballPhysics(s2, DT, false);
    assert.ok((s2.b.x - cx) * fd > 0 && s2.b.y + s2.b.r <= C.G + 1e-9, `Seite ${side}: Klon schiebt zur Feldseite, nicht in den Boden`);
  }
});

test("Magnet: gehaltener Ball tunnelt nicht durch die Torwand (Ball löst sich an ihr, kein Tor)", () => {
  for (const side of [0, 1]) for (const d of [150, 200]) {
    const st = setup(), p = st.p[1 - side], fd = side ? -1 : 1, wx = side ? C.W - C.GOAL_W - 10 : C.GOAL_W + 10;
    Object.assign(p, { x: side ? C.W - C.GOAL_W - d : C.GOAL_W + d, dir: -fd }); st.p[side].x = side ? 300 : C.W - 300;
    give(st, 1 - side, "magnet"); give(st, side, "wall");
    const key = c => (side ? [c, {}] : [{}, c]);
    run(st, 40, () => key({ k: true }));
    const g = P.shoeGeo(p), k = g.hl + g.rs + st.b.r - 3;
    Object.assign(st.b, { x: g.x + g.ux * k, y: g.y + g.uy * k, vx: 0, vy: 50, lt: side });
    run(st, 1, () => key({ k: true }));
    assert.ok(st.b.stick, "gefangen");
    let front = Infinity;
    const evs = run(st, 90, () => key({ k: true, [side ? "r" : "l"]: true }), s => { front = Math.min(front, (s.b.x - wx) * fd); });
    assert.ok(!evs.some(e => e.t === "goal"), `Seite ${side}, ${d}: kein Tor`);
    assert.ok(front >= 7 + st.b.r - 1, `Seite ${side}, ${d}: Ball bleibt vor der Wand (${front.toFixed(1)})`);
    assert.ok(evs.some(e => e.t === "wallhit")); assert.equal(st.b.stick, null);
  }
});

test("Magnet: Latte, Pfosten, Torwand, Doppelgänger, Plattform, Bumper und Seitenwand lösen den gehaltenen Ball", () => {
  const b0 = C.BR;
  const cases = {
    latte: [{}, st => [C.GOAL_W / 2, barY(st, 0) + C.BAR_T / 2 + b0 - 4]],
    pfosten: [{}, st => [C.GOAL_W + 4 + b0 - 4, barY(st, 0) + 2]],
    torwand: [{}, st => { give(st, 0, "wall"); return [C.GOAL_W + 17 + b0 - 4, C.G - 120]; }],
    klon: [{}, st => { give(st, 0, "clone"); return [C.GOAL_W + 2 * C.HR + b0 - 4, C.G - C.HR]; }],
    plattform: [{ rules: { obs: 0 } }, st => { const o = st.obs.find(q => q.t === "plat"); return [o.x, o.y + o.h + b0 - 4]; }],
    bumper: [{ arena: "strand", rules: { obs: 2 } }, st => { const o = st.obs.find(q => q.t === "bump"); return [o.x + o.r + b0 - 4, o.y]; }],
    seitenwand: [{}, () => [b0 - 4, 300]],
  };
  for (const [name, [o, at]] of Object.entries(cases)) {
    const st = o.arena ? P.newMatch({ chars: ["kalle", "yuki"], arena: o.arena, dur: 90, pus: true, golden: false, rules: o.rules, seed: 11 }) : setup(o);
    st.ph = "play";
    const [x, y] = at(st);
    Object.assign(st.b, { x, y, vx: 0, vy: 0, r: b0, stick: { i: 1, t: PU.magHold } });
    st.p[0].x = 900; st.p[1].x = 1200;
    ballPhysics(st, DT, false);
    assert.equal(st.b.stick, null, name);
    assert.ok(st.b.magCD > 0, `${name}: Sperrzeit`);
  }
  // frei schwebend: bleibt gehalten
  const st = setup(); Object.assign(st.b, { x: 900, y: 300, vx: 0, vy: 0, stick: { i: 1, t: PU.magHold } }); st.p[0].x = 300; st.p[1].x = 1400;
  ballPhysics(st, DT, false); assert.ok(st.b.stick);
});

// Magnet-Duell: holder hält den Ball, der Gegner hält sein Bein ebenfalls oben (Magnet) und steht bei Abstand gap
function magnetDuel(holder, gap) {
  const st = setup(), a = st.p[holder], o = st.p[1 - holder], fd = holder ? -1 : 1;
  give(st, 0, "magnet"); give(st, 1, "magnet");
  Object.assign(a, { x: holder ? C.W - 800 : 800, dir: fd }); Object.assign(o, { x: holder ? C.W - 1000 : 1000, dir: -fd });
  run(st, 40, () => [{ k: true }, { k: true }]);
  const g = P.shoeGeo(a), k = g.hl + g.rs + st.b.r - 3;
  Object.assign(st.b, { x: g.x + g.ux * k, y: g.y + g.uy * k, vx: 0, vy: 50, lt: 1 - holder });
  run(st, 1, () => [{ k: true }, { k: true }]);
  assert.ok(st.b.stick && st.b.stick.i === holder, "gefangen");
  o.x = a.x + fd * gap;
  let run1 = 0, longest = 0, phantom = 0;
  const mags = [0, 0], held = [0, 0];
  for (let n = 0; n < 720; n++) {
    const before = st.b.stick ? st.b.stick.i : -1;
    P.step(st, DT, [{ k: true }, { k: true }]);
    for (const e of st.ev.splice(0)) if (e.t === "magnet") { mags[e.i]++; if (!st.b.stick || st.b.stick.i !== e.i || before >= 0) phantom++; }
    if (st.b.stick) { held[st.b.stick.i]++; run1++; longest = Math.max(longest, run1); } else run1 = 0;
  }
  return { mags, held, longest, phantom };
}
test("Magnet: zwei Magnetschuhe: der Gegner löst nur (kein Fangen, kein Ereignis), Sperrzeit, nie länger als 0,6 s; Reihenfolge egal", () => {
  for (const gap of [195, 185, 175]) {
    const r0 = magnetDuel(0, gap), r1 = magnetDuel(1, gap);
    for (const r of [r0, r1]) {
      assert.ok(r.longest * DT <= PU.magHold + DT, `Abstand ${gap}: am Stück gehalten ${(r.longest * DT).toFixed(2)} s`);
      assert.equal(r.phantom, 0, `Abstand ${gap}: Ereignis magnet nur, wenn wirklich gehalten wird`);
    }
    // gespiegelt (Halter rechts statt links): dasselbe Ergebnis
    assert.deepEqual([r1.mags[1], r1.mags[0], r1.held[1], r1.held[0], r1.longest], [r0.mags[0], r0.mags[1], r0.held[0], r0.held[1], r0.longest], `Abstand ${gap}`);
  }
  // Gegner berührt mit gehaltenem Magnetbein: löst, kein Ereignis magnet, keiner fängt in der Sperrzeit
  const { st } = caught(), o = st.p[1];
  give(st, 1, "magnet");
  Object.assign(o, { lgS: 2, lgD: 1, lgV: 0, lgK: true, dir: -1 });
  const g = P.shoeGeo(o), k = g.hl + g.rs + st.b.r - 3;
  Object.assign(o, { x: o.x + (st.b.x - (g.x + g.ux * k)), y: o.y + (st.b.y - (g.y + g.uy * k)) });
  const b = st.b; ballVsPlayer(st, b, o, DT);
  assert.equal(b.stick, null, "gelöst"); assert.ok(!st.ev.some(e => e.t === "magnet"), "kein Ereignis");
  assert.equal(b.magCD, PU.magLock);
  Object.assign(b, { vx: o.vx, vy: o.vy }); ballVsPlayer(st, b, o, DT);
  assert.equal(b.stick, null, "Sperrzeit: kein Fangen");
  b.magCD = 0; Object.assign(b, { vx: o.vx, vy: o.vy }); const g2 = P.shoeGeo(o); Object.assign(b, { x: g2.x + g2.ux * k, y: g2.y + g2.uy * k });
  ballVsPlayer(st, b, o, DT);
  assert.ok(b.stick && b.stick.i === 1, "nach der Sperrzeit fängt er");
});

test("Magnet: Sperrzeit nach jedem Lösen (Zeit um, Loslass-Schuss, Wand): kein sofortiges Wiederfangen", () => {
  const c1 = caught(); run(c1.st, Math.ceil(PU.magHold / DT) + 1, () => [{ k: true }, {}]);
  assert.equal(c1.st.b.stick, null); assert.ok(c1.st.b.magCD > 0 && c1.st.b.magCD <= PU.magLock, "Zeit um");
  const c2 = caught(); run(c2.st, 5, () => [{ k: true }, {}]); run(c2.st, 1, () => [{}, {}]);
  assert.equal(c2.st.b.stick, null); assert.ok(c2.st.b.magCD > 0, "Schuss");
  // an der Wand gelöst, Bein bleibt oben am Ball: fängt erst nach der Sperrzeit wieder (kein Flackern jeden Schritt)
  const st = setup(), p = st.p[1]; give(st, 1, "magnet"); give(st, 0, "wall");
  Object.assign(p, { x: C.GOAL_W + 150, dir: -1 }); st.p[0].x = C.W - 300;
  run(st, 40, () => [{}, { k: true }]);
  const g = P.shoeGeo(p), k = g.hl + g.rs + st.b.r - 3;
  Object.assign(st.b, { x: g.x + g.ux * k, y: g.y + g.uy * k, vx: 0, vy: 50, lt: 0 });
  const evs = run(st, 70, () => [{}, { k: true, l: true }]);
  const mags = evs.filter(e => e.t === "magnet").length;
  assert.ok(mags >= 1 && mags <= 1 + Math.ceil(70 * DT / PU.magLock), `Fänge ${mags}`);
});

test("Portal: Ein- und Ausgang frei von allen Hindernissen (alle Arenen × Layouts × Feldgrößen, bewegte über die ganze Bahn)", () => {
  const free = (o, x, y, m) => {
    if (o.t === "plat" || o.t === "portal") { const dx = Math.max(o.x - o.w / 2 - x, 0, x - o.x - o.w / 2), dy = Math.max(o.y - y, 0, y - o.y - o.h); return Math.hypot(dx, dy) >= m; }
    if (o.t === "bump") return Math.hypot(x - o.x, y - o.y) >= o.r + m;
    if (o.t === "geyser" || o.t === "bubbles") return Math.abs(x - o.x) >= o.w / 2 + m || y < o.top - 30 - m;   // Geysir hebt bis knapp über die Säule
    if (o.t === "ramp") { const a = o.x - o.top / 2 - o.L, z = o.x + o.top / 2 + o.R; return x <= a - m || x >= z + m || y < C.G - o.h - m; }
    return true;
  };
  const bad = [];
  for (const field of [0.82, 1, 1.18]) for (const ar of Object.keys(LY.LAYOUTS)) for (let idx = 0; idx < LY.LAYOUTS[ar].length; idx++) {
    const st = P.newMatch({ chars: ["kalle", "yuki"], arena: ar, dur: 90, pus: true, golden: false, rules: { field, obs: idx }, seed: 11 });
    const spots = [0, 1].map(i => { give(st, i, "portal"); return { ...st.portal }; });
    const [L, R] = spots;
    assert.ok(Math.abs(L.ax + R.ax - C.W) < 1e-6 && Math.abs(L.bx + R.bx - C.W) < 1e-6 && L.ay === R.ay && L.by === R.by, `${ar}#${idx} ${field}: spiegelbildlich`);
    assert.ok(L.ax < C.W / 2 && L.bx > C.W / 2 + 200 && L.bx < C.W - C.GOAL_W - 100, `${ar}#${idx} ${field}: Eingang eigene Hälfte, Ausgang vor dem Tor`);
    for (let t = 0; t < 12; t += 0.05) {
      LY.moveObstacles(st.obs, t, 0);
      for (const pt of spots) for (const o of st.obs) {
        if (!free(o, pt.ax, pt.ay, PU.portalR)) bad.push(`${ar}#${idx} ${field} i=${pt.i}: Eingang an ${o.t}`);
        if (!free(o, pt.bx, pt.by, C.BR + 10)) bad.push(`${ar}#${idx} ${field} i=${pt.i}: Ausgang an ${o.t}`);
      }
    }
  }
  assert.deepEqual([...new Set(bad)], []);
  // ohne Hindernisse: Platz der Spezifikation
  const st = setup(); give(st, 1, "portal");
  assert.deepEqual([st.portal.ax, st.portal.ay, st.portal.bx, st.portal.by], [C.W * 0.7, C.G - 110, C.GOAL_W + 230, C.G - 220]);
});

test("Portal: Ausgang neben der Noclip-Tür (Backrooms, kleines Feld): der Ball fliegt nach dem Portal weiter Richtung Tor", () => {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "backrooms", dur: 90, pus: true, golden: false, rules: { field: 0.82, obs: 2 }, seed: 11 });
  st.ph = "play"; st.puT = 999; st.p[0].x = 200; st.p[1].x = C.W - 150;
  give(st, 0, "portal"); const pt = { ...st.portal };
  Object.assign(st.b, { x: pt.ax - 60, y: pt.ay + 20, vx: 700, vy: -500, lt: 0 });
  const evs = run(st, 12);
  assert.ok(evs.some(e => e.t === "portal"));
  assert.ok(!evs.some(e => e.t === "noclip"), "nicht sofort durch die Tür zurück");
  assert.ok(st.b.x > C.W / 2);
});

test("Eisblock und Eis-Super zugleich: Hämmern taut nur das Eis des Power-ups ab, der Preis des Supers bleibt", () => {
  const st = setup(), o = st.p[0];
  give(st, 1, "ice");
  run(st, 4, k => [{ l: k % 2 === 0 }, {}]);
  o.frz = 0.2;                                                 // fast freigehämmert
  Object.assign(st.b, { fx: "ice", fxO: 1, fxT: 1 }); touch(st, st.b, o, "head");
  assert.equal(o.frz, 1.1); assert.equal(o.frzS, 1.1);
  let m = 0; const evs = run(st, 200, k => [{ l: k % 2 === 0 }, {}], s => { if (s.p[0].frz > 0) m++; });
  assert.ok(Math.abs((m + 1) * DT - 1.1) <= 2 * DT, `eingefroren ${(m * DT).toFixed(3)} s`);
  assert.equal(evs.filter(e => e.t === "icetap").length, 0, "Hämmern wirkt nicht");
  // umgekehrt: Super-Rest klein, Eisblock groß → bis auf den Rest des Supers abtaubar, dann icebreak
  const s2 = setup(), q = s2.p[0];
  Object.assign(s2.b, { fx: "ice", fxO: 1, fxT: 1 }); touch(s2, s2.b, q, "head");
  run(s2, 84);                                                 // Super-Rest ≈ 0,4 s
  give(s2, 1, "ice"); assert.equal(q.frz, C.POWERUPS.ice.dur);
  let n = 0; const e2 = run(s2, 300, k => [{ l: k % 2 === 0, j: k % 4 === 1 }, {}], s => { if (s.p[0].frz > 0) n++; });
  assert.equal(e2.filter(e => e.t === "icebreak").length, 1);
  assert.ok(Math.abs(n * DT - 0.4) < 0.05, `frei nach dem Rest des Supers (${(n * DT).toFixed(3)} s)`);
  assert.equal(q.frzS, 0);
});

// ---------- Kugeln über den Anstoß, Gold früher ----------
const orb = (k, x, y, t = 2, id = 50) => ({ id, k, x, y, t });
// Tor für Seite i: Ball vor dem Tor des Gegners, fliegt hinein
function scoreFor(st, i) {
  Object.assign(st.b, { x: i ? C.GOAL_W + 30 : C.W - C.GOAL_W - 30, y: C.G - 60, vx: i ? -900 : 900, vy: 0, lt: i, ltk: "kick" });
  for (let k = 0; k < 120 && st.ph === "play"; k++) P.step(st, DT, [{}, {}]);
}

test("Anstoß: Kugeln nah am Anstoßpunkt verschwinden (puGone), weiter weg bleiben sie; keine wird beim ersten Kontakt ungewollt eingesammelt", () => {
  const st = setup({ bots: [3, 3] });
  const near = PU.koClear + 36 + 10 + st.b.r;   // Säule um den Anstoßpunkt (koOrbs)
  st.pu = [orb("fire", C.W / 2, 265, 2, 1), orb("ice", C.W / 2 + near - 1, 370, 3, 2), orb("wings", C.W / 2 - near - 1, 290, 4, 3), orb("time", 300, 330, 5, 4)];
  P.kickoff(st);
  const gone = st.ev.splice(0).filter(e => e.t === "puGone");
  assert.deepEqual(gone.map(e => e.k).sort(), ["fire", "ice"]);
  assert.deepEqual(st.pu.map(u => [u.k, u.t]), [["wings", 4], ["time", 5]], "Rest bleibt mit seiner Zeit");
  // wie im Spiel: Anstoß-Phase (die Kugeln altern nicht), dann laufen beide Bots zum Ball; die erste Berührung
  // sammelt nichts ein
  st.ph = "ko"; st.pt = 1;
  const before = st.pu.map(u => u.t);
  let first = -1;
  const evs = [];
  for (let k = 0; k < 900 && st.ph !== "end"; k++) {
    P.step(st, DT, [{}, {}]);
    const e = st.ev.splice(0);
    if (st.ph === "ko") assert.deepEqual(st.pu.map(u => u.t), before, "altern nicht in der Anstoß-Phase");
    evs.push(...e);
    if (first < 0 && e.some(x => x.t === "kick" || x.t === "head")) first = k;
    if (first >= 0 && k > first + 12) break;
  }
  assert.ok(first > 0, "Ball wird gespielt");
  assert.equal(evs.filter(e => e.t === "pu").length, 0, "kein Einsammeln direkt beim Anstoß");
  // ganze Spiele (Regel many, viele Kugeln): keine wird innerhalb von 0,05 s nach der ersten Berührung nach einem
  // Anstoß eingesammelt (direkt neben dem Treffpunkt; später ist es der Schuss des Anstoß-Siegers, der zielt auch auf Kugeln)
  let bad = 0, kos = 0;
  for (const seed of [21, 22, 23, 24]) {
    const m = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, pus: true, golden: false, rules: { pu: "many" }, seed, bots: [3, 3] });
    let touchT = -1, armed = false;
    while (m.ph !== "end") {
      P.step(m, DT, [{}, {}]);
      for (const e of m.ev.splice(0)) {
        if (e.t === "ko") { armed = true; kos++; }
        if (armed && (e.t === "kick" || e.t === "head")) { touchT = m.el; armed = false; }
        if (e.t === "pu" && touchT >= 0 && m.el - touchT < 0.05) bad++;
      }
    }
  }
  assert.ok(kos >= 8, `Anstöße ${kos}`);
  assert.equal(bad, 0, "kein ungewolltes Einsammeln beim Anstoß");
});

test("Torjubel und Spielende: Kugeln altern nicht und werden nicht eingesammelt; nach dem Tor bleiben sie", () => {
  const st = setup();
  st.pu = [orb("boot", 600, 300, 3)];
  scoreFor(st, 0);
  assert.equal(st.ph, "goal");
  const t0 = st.pu[0].t;
  let n = 0;
  while (st.ph === "goal") {
    Object.assign(st.b, { x: 600, y: 300, vx: 0, vy: 0, lt: 1 });   // Ball mitten in der Kugel
    P.step(st, DT, [{}, {}]); n++;
    assert.equal(st.ev.splice(0).filter(e => e.t === "pu").length, 0, "kein Einsammeln im Torjubel");
  }
  assert.ok(n > 300);
  assert.equal(st.ph, "ko");
  assert.deepEqual(st.pu.map(u => [u.k, u.t]), [["boot", t0]], "bleibt über den Anstoß, ohne zu altern");
  // Spielende: bleibt liegen, nichts wird eingesammelt
  const e = setup(); e.pu = [orb("wings", 600, 300, 1)]; e.t = DT / 2;
  P.step(e, DT, [{}, {}]); assert.equal(e.ph, "end");
  for (let k = 0; k < 60; k++) { Object.assign(e.b, { x: 600, y: 300, lt: 0 }); P.step(e, DT, [{}, {}]); }
  assert.equal(e.ev.filter(x => x.t === "pu").length, 0);
  assert.equal(e.pu.length, 1);
});

test("Golden Goal: Kugeln bleiben in die Verlängerung (außer am Anstoßpunkt), Gold-Zähler läuft weiter", () => {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, pus: true, golden: true, seed: 5, bots: [3, 3] });
  st.ph = "play"; st.pt = 0; st.t = DT / 2; st.puN = 4;
  st.pu = [orb("spin", 500, 320, 6, 1), orb("goal", C.W / 2, 270, 1, 2)];
  P.step(st, DT, [{}, {}]);
  assert.equal(st.gold, true); assert.equal(st.ph, "cd");
  assert.deepEqual(st.pu.map(u => u.k), ["spin"]);
  assert.ok(st.ev.some(e => e.t === "puGone" && e.k === "goal"));
  st.ph = "play"; st.pt = 0; st.pu = []; st.puT = 0; U.powerups(st, DT);
  assert.ok(C.POWERUPS[st.pu[0].k].rare, "5. Erscheinen (in der Verlängerung) ist golden");
});

test("Rollback über Tor und Anstoß mit liegenden Kugeln: Klon rechnet gleich weiter, Korrektur-Prüfung nimmt ihn", () => {
  const st = setup({ bots: [3, 3], seed: 9 }); st.puT = 0.5;
  run(st, 240);
  st.pu.push(orb("head", 400, 330, 1, 77));
  const c = clone(st);
  scoreFor(st, 1); scoreFor(c, 1);
  for (let n = 0; n < 8; n++) { run(st, 60); run(c, 60); assert.equal(hashState(st), hashState(c), `Abschnitt ${n}`); }
  assert.ok(st.s[1] >= 1);
  assert.equal(fixOk(J(st), J(st)), true);
  const f = J(st); f.pu = [orb("head", 400, 330, PU.life + 1)];
  assert.equal(fixOk(J(st), f), false, "Kugel älter als PU.life ist kein ehrlicher Stand");
});

test("Ranked: ein Paar am Anstoßpunkt verschwindet gemeinsam, eines weiter weg bleibt gemeinsam; nie Gold", () => {
  const st = setup({ fair: true });
  st.pu = [orb("fire", C.W / 2 - 100, 300, 2, 1), orb("fire", C.W / 2 + 100, 300, 2, 2), orb("wings", 400, 300, 3, 3), orb("wings", C.W - 400, 300, 3, 4)];
  P.kickoff(st);
  assert.deepEqual(st.pu.map(u => u.id), [3, 4]);
  const s2 = setup({ fair: true }), sp = spawns(s2, 30).flat();
  assert.ok(!sp.some(k => C.POWERUPS[k].rare), "auch beim 5. und 15. Erscheinen kein Gold");
});
