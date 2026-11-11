// Kopf-Level: Level 1 ändert nichts, Level 10 = +25 % Schuss und Super-Ladung, +5 % Tempo, Sprung gleich
import { test } from "node:test";
import assert from "node:assert/strict";
const C = await import("../../js/content/config.js");
const P = await import("../../js/core/physics.js");

test("Level-Bonus: 0 bei Level 1, 25 % bei Level 10, dazwischen gleichmäßig, nie darüber", () => {
  assert.equal(C.headBonus(1), 0); assert.equal(C.headBonus(10), 0.25);
  assert.ok(Math.abs(C.headBonus(4) - 0.25 / 3) < 1e-9);
  assert.equal(C.headBonus(99), 0.25); assert.equal(C.headBonus(undefined), 0);
});
test("Werte im Spiel: Level aus dem Spiel, Grundwerte bei Level 1", () => {
  const st = P.newMatch({ chars: ["kalle", "kalle"], arena: "stadion", levels: [10, 1] });
  const a = P.headStats(st, st.p[0]), b = P.headStats(st, st.p[1]), k = C.charById("kalle");
  assert.equal(b, k);
  assert.ok(Math.abs(a.pow - k.pow * 1.25) < 1e-9); assert.ok(Math.abs(a.spd - k.spd * 1.05) < 1e-9); assert.equal(a.jmp, k.jmp);
  assert.equal(P.headStats(P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion" }), st.p[0]), k, "ohne Angabe Level 1");
});
