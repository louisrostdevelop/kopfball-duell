// Netz-Hilfen: Ping-Auswertung, Grenze für den Verbindungs-Check, Statistik aus fremden Zuständen säubern
import { test } from "node:test";
import assert from "node:assert/strict";
const { cleanStats, pingStats, pingBars, netTooBad, NET_CHECK } = await import("../../js/app/netcode.js");
const P = await import("../../js/core/physics.js");

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

test("Statistik säubern: zwei Einträge, nur ganze Zahlen ≥ 0, kein HTML", () => {
  const keys = Object.keys(P.mkStats());
  const s = cleanStats([{ goals: "<img src=x>", shots: 3.7, heads: -2 }, null, { goals: 99 }]);
  assert.equal(s.length, 2);
  for (const e of s) { assert.deepEqual(Object.keys(e), keys); for (const k of keys) assert.ok(Number.isInteger(e[k]) && e[k] >= 0, k + " = " + e[k]); }
  assert.equal(s[1].goals, 0, "fehlender Eintrag = leer");
  assert.deepEqual(cleanStats("x"), [P.mkStats(), P.mkStats()]);
});
