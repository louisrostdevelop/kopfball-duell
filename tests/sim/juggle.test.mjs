// Kopfball-Jonglieren auf der Bühne: Timing, zu spätes Tippen, Ende erst am Boden, Tempo, Platz nach oben
import { test } from "node:test";
import assert from "node:assert/strict";
import { BALL_R, contactIn, createJuggle, juggleStep, juggleTap } from "../../js/ui/juggle.js";

const DT = 1 / 120, ROOM = { lim: 2.3, wx: 3 };
const fixed = () => 0.5;
const run = (j, sec, each = () => {}) => { for (let i = 0; i < sec / DT; i++) { each(j); juggleStep(j, DT, ROOM); } };
// tippt, sobald der Ball in `lead` Sekunden auf dem Kopf landet
const tapper = (lead = 0.06) => { let armed = true; return j => {
  const tc = contactIn(j);
  if (j.vy > 0 && tc !== null && armed && tc <= lead) { juggleTap(j); armed = false; }
  if (j.vy < 0) armed = true;
}; };
const hits = j => j.ev.filter(e => e.k === "hit");

test("ohne Antippen jongliert der Kopf allein und zählt nichts", () => {
  const j = createJuggle(fixed);
  run(j, 30);
  assert.equal(j.mode, "auto"); assert.equal(j.streak, 0); assert.ok(!j.ev.some(e => e.k === "miss"));
});

// Spiel übernehmen und ein paar Treffer machen
const playing = (rnd = fixed, sec = 3) => { const j = createJuggle(rnd); run(j, 0.5); juggleTap(j); run(j, sec, tapper()); return j; };
const until = (j, cond, sec = 5) => { for (let i = 0; i < sec / DT && !cond(j); i++) juggleStep(j, DT, ROOM); assert.ok(cond(j), "Zustand nicht erreicht"); };

test("gut getimt: Serie wächst, Ball bleibt oben, wird schneller", () => {
  const j = playing(fixed, 0);
  const times = []; let last = j.t, n = 0;
  run(j, 40, (() => { const tap = tapper(); return jj => { tap(jj); if (jj.streak > n) { n = jj.streak; times.push(jj.t - last); last = jj.t; } }; })());
  assert.ok(j.streak >= 30, "Serie " + j.streak); assert.equal(j.mode, "play");
  assert.ok(hits(j).every(e => e.q === "perfect"));
  assert.ok(times.at(-1) < times[2] * 0.8, `schneller: ${times[2].toFixed(2)} s -> ${times.at(-1).toFixed(2)} s`);
});

test("etwas zu spät tippen zählt noch, die Serie läuft weiter", () => {
  const j = playing(); const n = j.streak; assert.ok(n > 0);
  until(j, jj => jj.passive > 0);
  for (let i = 0; i < 0.08 / DT; i++) juggleStep(j, DT, ROOM);
  assert.equal(juggleTap(j), "good"); assert.equal(j.streak, n + 1);
});

test("nicht getippt: Ball hüpft, die Serie endet erst am Boden", () => {
  const j = playing(); const n = j.streak; assert.ok(n > 0);
  until(j, jj => jj.passive > 0);
  assert.equal(j.streak, n, "Hüpfer auf dem Kopf beendet nichts"); assert.equal(j.mode, "play");
  until(j, jj => jj.mode === "drop");
  assert.equal(j.streak, 0);
  assert.deepEqual(j.ev.filter(e => e.k === "miss").map(e => e.n), [n]);
});

test("zu früh: kein Treffer, danach kurze Sperre gegen Dauertippen", () => {
  const j = playing();
  until(j, jj => jj.vy > 0 && contactIn(jj) !== null && contactIn(jj) < 0.4 && contactIn(jj) > 0.3);
  assert.equal(juggleTap(j), "early");
  juggleStep(j, 0.15, ROOM);
  assert.equal(juggleTap(j), null, "gesperrt");
});

test("nach dem Runterfallen: Antippen startet neu, sonst jongliert er wieder allein", () => {
  const j = playing();
  until(j, jj => jj.mode === "drop");
  run(j, 0.2);
  assert.equal(juggleTap(j), "start"); assert.equal(j.mode, "play"); assert.equal(j.streak, 0);
  until(j, jj => jj.mode === "drop");
  until(j, jj => jj.mode === "auto", 2);
});

test("Ball fliegt nie höher als Platz da ist und landet immer auf dem Kopf", () => {
  for (const lim of [0.9, 1.5, 4]) {
    const j = createJuggle(), room = { lim, wx: 2.5 }; let top = 0;
    for (let i = 0; i < 0.5 / DT; i++) juggleStep(j, DT, room);
    juggleTap(j);
    const tap = tapper();
    for (let i = 0; i < 30 / DT; i++) { tap(j); juggleStep(j, DT, room); top = Math.min(top, j.y); }
    assert.ok(-top - 1 - BALL_R <= Math.min(lim, 2.3) + 1e-6, `lim ${lim}: Höhe ${(-top - 1 - BALL_R).toFixed(2)}`);
    assert.equal(j.mode, "play", `lim ${lim}: nie runtergefallen`);
  }
});

test("Gut statt Perfekt: Ball fliegt schräg, bleibt aber auf dem Kopf", () => {
  const j = createJuggle(); run(j, 0.5); juggleTap(j);
  run(j, 30, tapper(0.15));
  assert.equal(j.mode, "play"); assert.ok(hits(j).filter(e => e.q === "good").length > 10);
});
