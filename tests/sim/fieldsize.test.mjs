// Feldgröße: Power-ups und Hindernisse richten sich nach der Feldbreite (fw()), auf jedem Feld spielt der Bot gleich gut
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedRandom } from "../lib/rng.mjs";
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const L = await import("../../js/content/layouts.js");

const FIELDS = [0.82, 1, 1.18];   // Regel „Feldgröße“: Klein, Normal, Groß (Faktor auf den Standard)
const DT = 1 / 60;

// d0 < 0: links steht still; untilTouch: nur bis zur ersten Berührung
function match(field, d0, d1, seed, each, { dur = 40, untilTouch = false } = {}) {
  seedRandom(seed);
  const st = P.newMatch({ chars: ["kalle", "kalle"], arena: "stadion", dur, pus: true, golden: false, rules: { field }, seed, bots: [d0 < 0 ? null : d0, d1] });
  let acc = 0, t = 0, first = -1;
  for (let f = 0; f < 60 * (dur + 10) && st.ph !== "end"; f++) {
    acc = P.advance(st, DT, [{}, {}], acc);
    st.ev.length = 0;
    if (st.ph === "play") { t += DT; if (first < 0 && st.b.lt !== -1) first = t; }
    if (each) each(st);
    if (untilTouch && first >= 0) break;
  }
  return { s: st.s, first };
}

test("Feldbreite: fw() wächst mit, Standard = Bezugsgröße", () => {
  for (const f of FIELDS) {
    P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 60, rules: { field: f }, seed: 1 });
    assert.equal(C.W, Math.round(C.W0 * f));
    assert.ok(Math.abs(C.fw(C.FIELD_REF) - C.W) < 1e-9);
  }
  assert.equal(C.W0, Math.round(C.FIELD_REF * C.STD_FIELD));
  assert.equal(C.GOAL_H, Math.round(C.GOAL_REF * C.STD_GOAL));
});

for (const f of FIELDS) test(`Feld ${f}: Profi schlägt Leicht, Power-ups mit Abstand zu den Toren, Anstoß umkämpft`, () => {
  let wins = 0, lost = 0, touch = 0;
  const N = 4;   // (der Bot rechnet im Physikschritt viel: wenige, kürzere Spiele)
  for (let s = 1; s <= N; s++) {
    const sw = s % 2 === 0;   // Seiten tauschen
    const r = match(f, sw ? 0 : 3, sw ? 3 : 0, 500 + s, st => {
      for (const u of st.pu) assert.ok(u.x >= C.fw(360) - 1e-6 && u.x <= C.W - C.fw(360) + 1e-6, `Power-up bei ${u.x} (Feld ${C.W})`);
    });
    const [pro, easy] = sw ? [r.s[1], r.s[0]] : r.s;
    if (pro > easy) wins++; else if (pro < easy) lost++;
    touch += r.first;
  }
  // der Profi gewinnt fast jedes Spiel, aber nicht jedes (Power-ups, Unentschieden): über 4 Spiele mindestens 2 Siege,
  // höchstens eine Niederlage
  assert.ok(wins >= N - 2 && lost <= 1, `Profi gegen Leicht: ${wins} Siege, ${lost} Niederlagen`);
  assert.ok(touch / N < 1.2, `Ball nach dem Anstoß im Schnitt nach ${(touch / N).toFixed(2)} s berührt`);
});

for (const f of FIELDS) test(`Feld ${f}: Bot holt sich den Anstoß, wenn der Gegner stehen bleibt`, () => {
  for (let s = 1; s <= 5; s++) {
    const r = match(f, -1, 2, 900 + s, null, { untilTouch: true });
    assert.ok(r.first > 0 && r.first < 1.6, `erste Berührung nach ${r.first.toFixed(2)} s`);
  }
});

test("Hindernisse: auf jedem Feld im Feld, vor den Toren frei und spiegelbildlich", () => {
  for (const f of FIELDS) for (const arena of ["stadion", "strand", "neon", "eis", "mond"]) {
    P.newMatch({ chars: ["kalle", "yuki"], arena, dur: 60, rules: { field: f }, seed: 1 });
    L.layoutsFor(arena).forEach((_, i) => {
      const obs = L.buildObstacles(arena, i);
      for (const o of obs) {
        const half = (o.w || 2 * o.r || 0) / 2;
        assert.ok(o.cx - half > C.GOAL_W && o.cx + half < C.W - C.GOAL_W, `${arena}/${i} Feld ${f}: Hindernis bei ${Math.round(o.cx)} (Breite ${C.W})`);
        assert.ok(obs.some(q => q.t === o.t && Math.abs(q.cx + o.cx - C.W) < 1), `${arena}/${i} Feld ${f}: Spiegelbild fehlt`);
      }
    });
  }
});
