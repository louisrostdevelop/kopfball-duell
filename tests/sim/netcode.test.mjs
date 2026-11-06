// Kompakte Online-Zustände: verlustfrei genug (gleiche Werte wie der volle Zustand), deutlich kleiner,
// und der Empfangszeitplan passt den Puffer ans Netz an
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedRandom } from "../lib/rng.mjs";
const P = await import("../../js/core/physics.js");
const AI = await import("../../js/core/ai.js");
const { encodeState, decodeState, makeClock, pingStats, pingBars, netTooBad, NET_CHECK } = await import("../../js/app/netcode.js");
const { packState } = await import("../../js/app/online.js");

function near(a, b, path) {
  if (typeof a === "number" && typeof b === "number") { assert.ok(Math.abs(a - b) <= 0.06 + Math.abs(b) * 1e-9, `${path}: ${a} vs ${b}`); return; }
  if (Array.isArray(b)) { assert.equal(a.length, b.length, path); b.forEach((v, i) => near(a[i], v, path + "[" + i + "]")); return; }
  if (b && typeof b === "object") { for (const k of Object.keys(b)) near(a[k], b[k], path + "." + k); return; }
  assert.equal(a, b, path);
}

test("kodiert = voller Zustand (bis auf Rundung), viel kleiner", () => {
  seedRandom(7);
  const st = P.newMatch({ chars: ["kalle", "tank"], arena: "stadion", dur: 60, pus: true, rules: { pu: "many" } });
  const ai = [AI.makeAI(0, 2), AI.makeAI(1, 3)];
  let acc = 0, full = 0, small = 0, n = 0;
  for (let f = 0; f < 60 * 30; f++) {
    acc = P.advance(st, 1 / 60, [AI.aiInput(ai[0], st, 1 / 60), AI.aiInput(ai[1], st, 1 / 60)], acc); st.ev.length = 0;
    if (f % 2) continue;
    const ref = packState(st); delete ref.stats;
    const wire = JSON.stringify(encodeState(st, f, 1000 + f * 16.6));
    const back = decodeState(JSON.parse(wire));
    near(back, ref, "st");
    full += JSON.stringify(packState(st)).length; small += wire.length; n++;
  }
  const avg = small / n;
  console.log(`Zustand: ${(full / n).toFixed(0)} -> ${avg.toFixed(0)} Bytes`);
  assert.ok(avg < 360, "im Schnitt unter 360 Bytes: " + avg.toFixed(0));
  assert.ok(small < full / 3.5, `mindestens 3,5-mal kleiner: ${(full / n).toFixed(0)} -> ${avg.toFixed(0)} Bytes`);
});

test("Empfangszeitplan: ruhiges Netz = kleiner Puffer, wackliges Netz = größerer, Lücken vergrößern ihn", () => {
  const calm = makeClock(), shaky = makeClock();
  let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 200; i++) { const ht = i * 33.3; calm.arrive(ht, ht + 500 + 20 + rnd() * 3); shaky.arrive(ht, ht + 500 + 40 + rnd() * 60); }
  assert.ok(calm.delay() < 50, "ruhig: " + calm.delay().toFixed(0));
  assert.ok(shaky.delay() > calm.delay() + 30, "wacklig: " + shaky.delay().toFixed(0));
  const before = shaky.delay(); for (let i = 0; i < 5; i++) shaky.starved();
  assert.ok(shaky.delay() > before + 15);
  // Uhrversatz: gezeichnet wird knapp hinter der neuesten Host-Zeit
  const rt = calm.renderTime(199 * 33.3 + 520);
  assert.ok(rt < 199 * 33.3 && rt > 199 * 33.3 - 80, "Zeichenzeit " + rt.toFixed(0));
});

test("Ping: Median und Schwankung, Balken, Grenze für den Verbindungs-Check", () => {
  assert.equal(pingStats([]), null);
  assert.deepEqual(pingStats([40, 42, 300, 41, 43]), { ms: 42, jitter: 52 }, "ein Ausreißer verschiebt den Median nicht");
  assert.equal(pingBars({ ms: 30, jitter: 5 }), 4);
  assert.equal(pingBars({ ms: 90, jitter: 5 }), 3);
  assert.equal(pingBars({ ms: 90, jitter: 40 }), 2, "Schwankung kostet Balken");
  assert.equal(pingBars({ ms: 220, jitter: 0 }), 1);
  assert.equal(pingBars(null), 0);
  assert.equal(netTooBad(null), true, "keine Antwort = zu schlecht");
  assert.equal(netTooBad({ ms: NET_CHECK.badMs - 20, jitter: 10 }), false);
  assert.equal(netTooBad({ ms: NET_CHECK.badMs - 20, jitter: 30 }), true);
});
