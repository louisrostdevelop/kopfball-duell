// Ranked: Power-ups erscheinen immer als Paar, spiegelbildlich zur Mitte (gleiche Art, gleiche Höhe)
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedRandom } from "../lib/rng.mjs";
const P = await import("../../js/core/physics.js");
const AI = await import("../../js/core/ai.js");
const C = await import("../../js/content/config.js");

function run(fair, arena = "stadion", rules = {}) {
  seedRandom(77);
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena, dur: 60, pus: true, golden: false, fair, rules });
  const ai = [AI.makeAI(0, 2), AI.makeAI(1, 2)];
  const seen = new Map();
  let acc = 0;
  for (let f = 0; f < 60 * 65 && st.ph !== "end"; f++) {
    acc = P.advance(st, 1 / 60, [AI.aiInput(ai[0], st, 1 / 60), AI.aiInput(ai[1], st, 1 / 60)], acc);
    st.ev.length = 0;
    for (const u of st.pu) if (!seen.has(u.id)) seen.set(u.id, { k: u.k, x: u.x, y: u.y, W: C.W });
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
}

test("Ranked: jedes Power-up hat ein Spiegelbild", () => {
  for (const [arena, rules] of [["stadion", {}], ["mond", { field: 0.82, obs: 0 }], ["eis", { pu: "many", obs: 1 }]]) {
    const pus = run(true, arena, rules);
    assert.ok(pus.length >= 4, `${arena}: genug Power-ups (${pus.length})`);
    assert.equal(pus.length % 2, 0);
    for (let i = 0; i < pus.length; i += 2) {
      const a = pus[i], b = pus[i + 1];
      assert.equal(a.k, b.k); assert.equal(a.y, b.y);
      assert.ok(Math.abs(a.x + b.x - a.W) < 1e-9, `${arena}: gespiegelt`);
      assert.ok(a.x < a.W / 2 && b.x > a.W / 2, "je eins pro Hälfte");
    }
  }
});

test("Sonst unverändert: einzeln, beliebige Seite", () => {
  const pus = run(false);
  assert.ok(pus.length >= 3);
  assert.ok(pus.some((u, i) => i > 0 && Math.abs(u.x + pus[i - 1].x - u.W) > 1));
});
