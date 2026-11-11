// Meme-Supers: jeder trifft frei ins Tor, jeder ist abwehrbar, und wer abwehrt, zahlt den Preis seines Supers
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedRandom } from "../lib/rng.mjs";
seedRandom(31);
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const DT = 1 / 120;

// Super -> Zustand, den der Abwehrende danach hat (null: nur Abwehr, kein Preis)
const BLOCK = { sad: "sadT", flex: "confT", bassdrop: "knock", aimbot: "stun", copypaste: null, stone: "stun", crypto: "stun", ghosting: null, rizz: "charmT", brezel: "stun" };
const MEME = ["emo", "rapper", "raver", "gamer", "npc", "moai", "crypto", "sigma", "chad", "brezel"];

function setup(ch, defX) {
  const st = P.newMatch({ chars: [ch, "yuki"], arena: "stadion", dur: 90, pus: false, golden: false, rules: {} });
  st.ph = "play"; st.pus = false; st.puT = 999;
  st.p[0].x = 600; st.p[1].x = defX;
  st.b.x = 670; st.b.y = 520; st.b.vx = 0; st.b.vy = 0;
  return st;
}
function run(st, secs, each) {
  for (let k = 0; k < secs / DT && st.ph === "play"; k++) {
    P.step(st, DT, [{}, {}]);
    if (each && each(st, st.ev.splice(0)) === false) break;
    st.ev.length = 0;
  }
}

test("jeder Meme-Kopf hat einen eigenen Super mit Farbe", () => {
  const supers = MEME.map(id => C.charById(id).super);
  assert.equal(new Set(supers).size, MEME.length);
  for (const s of supers) { assert.ok(C.SUPERS[s]?.col, s); assert.ok(s in BLOCK, s); }
});

for (const id of MEME) {
  const sup = C.charById(id).super;

  test(`${sup}: trifft frei ins Tor und endet sauber`, () => {
    const st = setup(id, 150);
    P.fireSuper(st, st.p[0], sup);
    let goal = null;
    run(st, 4, (s, evs) => {
      assert.ok(Number.isFinite(s.b.x) && Number.isFinite(s.b.y), "Ball bleibt endlich");
      for (const e of evs) if (e.t === "goal") goal = e;
      return !goal;
    });
    assert.ok(goal, "Tor gefallen");
    assert.deepEqual(st.s, [1, 0]);
  });

  test(`${sup}: abwehrbar${BLOCK[sup] ? ` (danach ${BLOCK[sup]})` : ""}`, () => {
    const st = setup(id, 150);
    const d = st.p[1];
    P.fireSuper(st, st.p[0], sup);
    let placed = false, saved = false, paid = 0;
    run(st, 4, (s, evs) => {
      const b = s.b;
      // Gegner einmal direkt in die Flugbahn stellen, sobald der Ball unterwegs und im Bild ist
      if (!placed && b.fx && b.fxT > 0.2 && b.y > 140 && b.y < 610) { placed = true; d.x = b.x + 20; d.y = b.y; d.vx = 0; d.vy = 0; d.onG = false; }
      if (evs.some(e => e.t === "save" && e.i === 1)) saved = true;
      if (BLOCK[sup]) paid = Math.max(paid, d[BLOCK[sup]] || 0);
      return !(saved && s.b.fx === "");
    });
    assert.ok(placed, "Ball kam ins Bild");
    assert.ok(saved, "abgewehrt");
    if (BLOCK[sup]) assert.ok(paid > 0, `${BLOCK[sup]} gesetzt`);
  });
}

test("Rizz-Ball: beim Abschuss behält der Gegner die Steuerung, verliebt läuft er dem Ball hinterher", () => {
  const st = setup("chad", 1200);
  P.fireSuper(st, st.p[0], "rizz");
  assert.equal(st.p[1].charmT || 0, 0, "Abschuss allein nimmt keine Steuerung");
  st.p[1].charmT = 0.6; // so wie nach dem Abwehren
  const x0 = st.p[1].x;
  run(st, 0.4);
  assert.ok(st.p[1].x < x0 - 40, `läuft Richtung Ball (${x0.toFixed(0)} -> ${st.p[1].x.toFixed(0)})`);
});

test("Sad-Ball: traurig ist langsamer", () => {
  // Spieler 0 läuft eine halbe Sekunde nach rechts, der Ball bleibt aus dem Weg
  const go = sad => {
    const st = setup("emo", 300); st.p[0].sadT = sad ? 5 : 0; const x0 = st.p[0].x;
    for (let k = 0; k < 0.5 / DT; k++) { P.step(st, DT, [{ r: true }, {}]); st.b.x = 1400; st.b.y = 100; st.b.vx = 0; st.b.vy = 0; st.ev.length = 0; }
    return st.p[0].x - x0;
  };
  assert.ok(go(true) < go(false) * 0.7, "deutlich langsamer");
});

// Alle 22 Supers (auch die klassischen): treffen ein leeres Tor von überall, von beiden Seiten, ohne Eigentor,
// und fliegen für links und rechts spiegelbildlich (besonders heikel: Meteor, Flummi über der Latte und vor dem eigenen Tor,
// Rizz, Donnerkeil, Bass-Drop und Tornado je nach Seite)
function freeShot(kind, side, x, y) {
  seedRandom(3);
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, pus: false }); st.ph = "play";
  const p = st.p[side], o = st.p[1 - side], d = side ? -1 : 1;
  p.x = side ? C.W - x : x; p.dir = d; st.b.x = p.x + d * 40; st.b.y = y; st.b.vx = 0; st.b.vy = 0;
  o.x = side ? -300 : C.W + 300; o.y = -600;
  P.fireSuper(st, p, kind);
  const path = [];
  for (let f = 0; f < 120 * 4 && st.ph === "play"; f++) {
    P.step(st, DT, [{}, {}]); st.ev.length = 0; o.x = side ? -300 : C.W + 300; o.y = -600;
    if (f < 180) path.push([side ? C.W - st.b.x : st.b.x, st.b.y]);
  }
  return { goal: st.s[side], own: st.s[1 - side], path };
}
for (const kind of [...new Set(C.CHARS.map(c => c.super))]) test(`Super ${kind}: trifft das leere Tor von beiden Seiten, spiegelbildlich`, () => {
  for (const x of [250, 450, 650, 900]) for (const y of [560, 420]) {
    const a = freeShot(kind, 0, x, y), b = freeShot(kind, 1, x, y);
    assert.equal(a.goal + b.goal, 2, `${kind} von x ${x}, y ${y}`);
    assert.equal(a.own + b.own, 0, "kein Eigentor");
    for (let i = 0; i < Math.min(a.path.length, b.path.length); i++) assert.ok(Math.hypot(a.path[i][0] - b.path[i][0], a.path[i][1] - b.path[i][1]) < 2, `${kind}: links und rechts gleich (Schritt ${i})`);
  }
});
