// Browser-Tests starten: Online-Tests nacheinander, alle übrigen gleichzeitig daneben (spart gut die Hälfte der Zeit).
//   node tools/e2e.mjs                  alle
//   node tools/e2e.mjs --changed [ref]  nur die zu geänderten Dateien (gegen ref, Standard origin/main, dazu Ungespeichertes)
//   node tools/e2e.mjs --list ...       nur anzeigen, was liefe
//   node tools/e2e.mjs --serial         alles nacheinander (Fehlersuche)
//   node tools/e2e.mjs online modes     bestimmte Testdateien
// Gleichzeitige Oberflächen-Tests: KD_E2E_WORKERS (Standard: Kerne - 2, mindestens 1).
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NET, testsFor, changedFiles } from "./test-map.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALL = readdirSync(join(ROOT, "tests/e2e")).filter(f => f.endsWith(".test.mjs")).map(f => f.replace(".test.mjs", "")).sort();
const args = process.argv.slice(2);
const flag = f => { const i = args.indexOf(f); if (i < 0) return false; args.splice(i, 1); return true; };
const list = flag("--list"), serial = flag("--serial"), changed = flag("--changed");

let tests;
if (changed) {
  const files = changedFiles(ROOT, args[0] && !ALL.includes(args[0]) ? args.shift() : undefined);
  const r = testsFor(files, ALL);
  console.log(`Geändert: ${files.length} Dateien`); r.why.forEach(w => console.log("  " + w));
  tests = r.tests;
} else tests = args.length ? args.filter(a => ALL.includes(a)) : ALL;
const bad = args.filter(a => !ALL.includes(a) && !changed);
if (bad.length) { console.error("Unbekannte Tests: " + bad.join(", ")); process.exit(2); }
console.log(`Browser-Tests: ${tests.length ? tests.join(", ") : "keine"}`);
if (list || !tests.length) process.exit(0);

const file = t => `tests/e2e/${t}.test.mjs`;
const workers = Math.max(1, Number(process.env.KD_E2E_WORKERS) || cpus().length - 2);
const groups = serial
  ? [{ name: "alle nacheinander", files: tests, n: 1 }]
  : [{ name: "Online (nacheinander)", files: tests.filter(t => NET.includes(t)), n: 1 },
     { name: `Oberfläche (${workers} gleichzeitig)`, files: tests.filter(t => !NET.includes(t)), n: workers }].filter(g => g.files.length);

const t0 = Date.now();
// Jede Gruppe in einem eigenen Prozess; Ausgabe gesammelt und am Ende je Gruppe gezeigt (sonst durcheinander)
const run = g => new Promise(res => {
  const p = spawn(process.execPath, ["--test", `--test-concurrency=${g.n}`, "--test-reporter=spec", ...g.files.map(file)], { cwd: ROOT, env: process.env });
  let out = ""; p.stdout.on("data", d => { out += d; }); p.stderr.on("data", d => { out += d; });
  p.on("close", code => res({ ...g, code, out, s: Math.round((Date.now() - t0) / 1000) }));
});
const res = await Promise.all(groups.map(run));
let fail = 0;
for (const r of res) {
  console.log(`\n===== ${r.name}: ${r.files.join(", ")} (${r.s} s) =====\n` + r.out.trimEnd());
  if (r.code) fail++;
}
console.log(`\n${fail ? "FEHLER" : "Alles grün"} nach ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(fail ? 1 : 0);
