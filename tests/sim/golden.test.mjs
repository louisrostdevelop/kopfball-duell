// Referenzaufnahme der Spiellogik: viele Computer-Spiele mit festem Zufall.
// Jeder Umbau, der das Verhalten nicht ändern soll, muss exakt dieselben Spiele ergeben.
// Bewusste Spieländerung: neu aufnehmen mit `npm run golden:update` und die Änderung im Commit begründen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { seedRandom } from "../lib/rng.mjs";

const P = await import("../../js/physics.js");
const AI = await import("../../js/ai.js");

const FILE = new URL("./golden.json", import.meta.url);
const DT = 1 / 60;

// Abdeckung: alle Arenen, Hindernis-Layouts, Regel-Varianten, Spielmodi, Schwierigkeiten
const CASES = [];
const arenas = ["stadion", "strand", "neon", "eis", "mond"];
arenas.forEach((arena, i) => {
  CASES.push({ arena, chars: ["kalle", "yuki"], diffs: [2, 2], rules: {} });
  for (let li = 0; li < 3; li++) CASES.push({ arena, chars: [["tank", "bolt", "nala"][li], ["rocco", "flummi", "max"][li]], diffs: [li % 4, (li + i) % 4], rules: { obs: li, field: [0.82, 1, 1.18][li] } });
});
CASES.push({ arena: "stadion", chars: ["bolt", "tank"], diffs: [3, 3], rules: { kick: 1.45, bounce: 1.4, pu: "many" } });
CASES.push({ arena: "neon", chars: ["nala", "kalle"], diffs: [1, 3], rules: { grav: 0.55, bounce: 1.2 } });
CASES.push({ arena: "eis", chars: ["flummi", "rocco"], diffs: [2, 1], rules: { floor: "ice", speed: 1.25, ball: 1.3, goal: 1.2 } });
CASES.push({ arena: "strand", chars: ["max", "yuki"], diffs: [3, 2], rules: { len: "w3", weight: "light", supers: false } });
CASES.push({ arena: "stadion", chars: ["kalle", "tank"], diffs: [2, 2], rules: { weight: "heavy", head: 1.3, pu: "off" } });
// Skript-Spieler: drückt wild Sprung, Bombe, Grätsche und Schuss (deckt Bewegungen ab, die die KI selten nutzt)
arenas.forEach((arena, i) => CASES.push({ arena, chars: [["kalle", "tank", "bolt", "nala", "max"][i], "yuki"], diffs: [2, 2], rules: i % 2 ? { obs: i % 3 } : {}, script: true }));
for (const mod of ["lowgrav", "bigball", "superfast"]) CASES.push({ arena: "stadion", chars: ["yuki", "bolt"], diffs: [2, 2], rules: {}, mod });

// kleine, stabile Prüfsumme
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); }
const r = v => (Math.round(v * 1000) / 1000).toString();

// Eingaben aus eigenem Zufallsgenerator: alle 0,1-0,4 s eine neue Absicht, Bombe/Grätsche als kurzer Druck
function scripted(idx) {
  let s = 77 + idx * 13; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let left = 0, cur = {};
  return st => {
    if ((left -= DT) <= 0) {
      left = 0.1 + rnd() * 0.3; const p = st.p[0], x = rnd();
      cur = { l: rnd() < 0.35, r: rnd() < 0.45 };
      if (x < 0.3) cur.j = true;                       // Sprung (Haltezeit = Dauer der Absicht)
      else if (x < 0.5) cur.d = true;                  // runter: am Boden Grätsche, in der Luft Bombe
      else if (x < 0.75) cur.k = true;                 // Schuss halten (lang = aufgeladen)
      if (!p.onG && rnd() < 0.5) cur = { ...cur, d: true, j: false };
    }
    return cur;
  };
}
function play(c, idx) {
  seedRandom(1000 + idx);
  const st = P.newMatch({ chars: c.chars, arena: c.arena, dur: 45, pus: true, golden: false, rules: c.rules, mod: c.mod });
  const ai = [AI.makeAI(0, c.diffs[0]), AI.makeAI(1, c.diffs[1])];
  const evCount = {}, trace = [], sp = c.script ? scripted(idx) : null;
  let acc = 0, frames = 0;
  while (st.ph !== "end" && frames < 60 * 70) {
    frames++;
    acc = P.advance(st, DT, [sp ? sp(st) : AI.aiInput(ai[0], st, DT), AI.aiInput(ai[1], st, DT)], acc);
    for (const e of st.ev.splice(0)) evCount[e.t] = (evCount[e.t] || 0) + 1;
    if (frames % 30 === 0) {
      const b = st.b;
      trace.push([st.ph, r(b.x), r(b.y), r(b.vx), r(b.vy), b.fx, ...st.p.flatMap(p => [r(p.x), r(p.y), r(p.vx), r(p.vy), p.full ? 1 : 0, p.slide > 0 ? 1 : 0, p.bomb ? 1 : 0])].join(","));
    }
  }
  return { score: st.s.join(":"), frames, events: Object.keys(evCount).sort().map(k => k + "=" + evCount[k]).join(" "), trace: fnv(trace.join("|")) };
}

const results = CASES.map((c, i) => ({ case: `${i} ${c.arena} ${JSON.stringify(c.rules)}${c.mod ? " " + c.mod : ""}${c.script ? " Skript" : ""}`, ...play(c, i) }));

if (process.env.UPDATE_GOLDEN || !existsSync(FILE)) {
  writeFileSync(FILE, JSON.stringify(results, null, 1) + "\n");
  console.log(`Referenz neu aufgenommen: ${results.length} Spiele`);
} else {
  const want = JSON.parse(readFileSync(FILE, "utf8"));
  test("gleiche Anzahl Referenzspiele", () => assert.equal(results.length, want.length));
  results.forEach((got, i) => test(`Referenzspiel ${got.case}`, () => assert.deepEqual(got, want[i])));
}
