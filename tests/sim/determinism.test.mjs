// Determinismus für den Rollback-Netcode: dieselben Eingaben ergeben auf jedem Gerät bit-genau denselben Zustand.
// 1. Wächter: die Physik nutzt nur exakt festgelegte Rechenarten (keine Math.sin & Co., kein Math.random, keine Uhr).
// 2. Gegenprobe in einer zweiten JavaScript-Engine (QuickJS, eigene Mathe-Bibliothek) gegen V8: gleiche Prüfsummen.
// 3. Eigene Mathe-Funktionen genau genug.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SIM = [...readdirSync(ROOT + "js/core/sim").map(f => "js/core/sim/" + f), "js/content/layouts.js", "js/content/dmath.js", "js/core/rbgame.js", "js/core/rollback.js"];

test("Physik nutzt nur deterministische Rechenarten", () => {
  const bad = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|random|fround)\b|\bDate\b|\bperformance\b|\*\*|crypto\./;
  const hits = [];
  for (const f of SIM) readFileSync(ROOT + f, "utf8").split("\n").forEach((l, i) => {
    if (/^\s*\*/.test(l)) return;   // Zeile in einem Doku-Kommentar
    const code = l.replace(/\/\/.*$/, "").replace(/\/\*.*?(\*\/|$)/g, "");
    if (bad.test(code) && !/det-ok/.test(l)) hits.push(`${f}:${i + 1}: ${l.trim()}`);
  });
  assert.deepEqual(hits, [], "nicht deterministisch (ggf. dmath.js nutzen):\n" + hits.join("\n"));
});

const D = await import("../../js/content/dmath.js");
test("eigene Mathe-Funktionen: genau, Sonderfälle wie Math", () => {
  let s = 1; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20000; i++) {
    const x = (r() - 0.5) * 400, y = (r() - 0.5) * 400, z = (r() - 0.5) * 80;
    assert.ok(Math.abs(D.dsin(x) - Math.sin(x)) < 1e-14, "sin " + x);
    assert.ok(Math.abs(D.dcos(x) - Math.cos(x)) < 1e-14, "cos " + x);
    assert.ok(Math.abs(D.datan2(y, x) - Math.atan2(y, x)) < 1e-14, "atan2 " + y + "," + x);
    assert.ok(Math.abs(D.dexp(z) / Math.exp(z) - 1) < 1e-14, "exp " + z);
    assert.ok(Math.abs(D.dtanh(z / 10) - Math.tanh(z / 10)) < 1e-14, "tanh " + z);
    assert.ok(Math.abs(D.dhypot(x, y) - Math.hypot(x, y)) < 1e-12, "hypot");
  }
  for (const [a, b] of [[0, 0], [0, -0], [-0, 0], [-0, -0], [1, 0], [-1, 0], [0, 1], [0, -1], [5, -3], [-5, -3]]) assert.ok(Object.is(D.datan2(a, b), Math.atan2(a, b)), `atan2(${a}, ${b})`);
  assert.ok(Number.isNaN(D.dsin(Infinity)) && Number.isNaN(D.dcos(NaN)) && Number.isNaN(D.datan2(NaN, 1)));
  assert.equal(D.dexp(800), Infinity); assert.equal(D.dexp(-800), 0); assert.equal(D.dtanh(50), 1); assert.equal(D.dtanh(-50), -1);
  // Zufall im Zustand: gleicher Start, gleiche Folge; Bereich [0, 1)
  const a = { rng: 42 }, b = { rng: 42 };
  for (let i = 0; i < 1000; i++) { const v = D.rnd(a); assert.equal(v, D.rnd(b)); assert.ok(v >= 0 && v < 1); }
});

// Szenen: Arenen mit Hindernissen, Regeln, viele Supers (Taste s), Power-ups, Zufall im Zustand
const SCENES = [
  { chars: ["kalle", "tank"], arena: "stadion", rules: { obs: 1 } },
  { chars: ["yuki", "bolt"], arena: "eis", rules: { floor: "ice", pu: "many" } },
  { chars: ["tina", "magnus"], arena: "mond", rules: { grav: 0.55, obs: 2 } },
  { chars: ["emo", "sigma"], arena: "neon", rules: { obs: 0, field: 1.18 } },
  { chars: ["crypto", "moai"], arena: "vulkan", rules: { obs: 1, kick: 1.45 } },
  { chars: ["max", "phantom"], arena: "backrooms", rules: { obs: 0 } },
];
// läuft wörtlich in beiden Engines (eigener Zufall für die Eingaben, Supers immer wieder aufgeladen)
const RUN = (n, sc) => `
const P = await import(ROOT + "js/core/physics.js"), { gameTick } = await import(ROOT + "js/core/rbgame.js"), { hashState } = await import(ROOT + "js/core/rollback.js");
const st = P.newMatch({ chars: ${JSON.stringify(sc.chars)}, arena: "${sc.arena}", dur: 90, pus: true, rules: ${JSON.stringify(sc.rules)}, seed: ${n * 977 + 13} });
let s = ${n + 5}; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
const out = []; let a = 0, b = 0;
for (let f = 0; f < 2400; f++) {
  if (f % 9 === 0) { a = Math.floor(r() * 64); b = Math.floor(r() * 64); }
  if (f % 400 === 0) st.p.forEach(p => { p.meter = 100; p.full = true; });
  gameTick(st, [a, f % 400 === 7 ? { b, e: "GG" } : b]);
  if (f % 300 === 299) out.push(hashState(st));
}
out.push(st.s.join(":"));
return out;`;

test("gleiches Ergebnis in zwei JavaScript-Engines (V8 und QuickJS)", async () => {
  let getQuickJS;
  try { ({ getQuickJS } = await import("quickjs-emscripten")); } catch (_) { assert.fail("quickjs-emscripten fehlt (npm ci)"); }
  const QJS = await getQuickJS();
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  for (const [n, sc] of SCENES.entries()) {
    const v8 = await new AsyncFn("ROOT", RUN(n, sc))(ROOT);
    const rt = QJS.newRuntime();
    rt.setMemoryLimit(256 * 1024 * 1024);
    rt.setModuleLoader(name => readFileSync(name, "utf8"), (base, name) => resolve(dirname(base), name));
    const vm = rt.newContext();
    const src = `const ROOT = ${JSON.stringify(ROOT)};\nglobalThis.__out = await (async () => {${RUN(n, sc)}})();`;
    const res = vm.evalCode(src, ROOT + "qjs-run.mjs", { type: "module" });
    if (res.error) { const e = vm.dump(res.error); res.error.dispose(); vm.dispose(); rt.dispose(); assert.fail("QuickJS: " + JSON.stringify(e)); }
    res.value.dispose();
    for (let k = 0; k < 100 && rt.hasPendingJob(); k++) rt.executePendingJobs();
    const h = vm.getProp(vm.global, "__out"), qjs = vm.dump(h); h.dispose(); vm.dispose(); rt.dispose();
    assert.deepEqual(qjs, v8, `Szene ${n} (${sc.arena}, ${sc.chars.join("/")})`);
  }
});
