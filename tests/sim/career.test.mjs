// Karriere: Inhalte gültig, Sterne, Freischalten, nie Sterne verlieren
import { test } from "node:test";
import assert from "node:assert/strict";
const { CAREER, careerStars } = await import("../../js/content/career.js");
const C = await import("../../js/content/config.js");
const K = await import("../../js/core/career.js");
const P = await import("../../js/core/physics.js");

test("Inhalte: Köpfe, Arenen, Regelsätze und Stufen gibt es", () => {
  assert.equal(CAREER.length, 4);
  for (const [li, l] of CAREER.entries()) {
    assert.equal(l.games.length, 5);
    for (const [gi, g] of l.games.entries()) {
      assert.ok(C.charById(g.ch).id === g.ch && C.arenaById(g.arena).id === g.arena && C.DIFFS[g.diff], `${l.id}.${gi}`);
      if (g.set) assert.ok(C.CHALLENGE_SETS.some(s => s.id === g.set), g.set);
      const ml = P.matchLen(K.gameRules(li, gi));
      assert.ok(ml.win || ml.dur >= 60);
    }
  }
  assert.equal(K.MAX_STARS, 60);
});

test("Sterne: Sieg 1, zwei Tore Abstand 2, zu null 3, sonst 0", () => {
  assert.deepEqual([[1, 0], [2, 1], [3, 1], [4, 2], [3, 0], [1, 1], [0, 2]].map(([a, b]) => careerStars(a, b)), [3, 1, 2, 2, 3, 0, 0]);
});

test("Freischalten: Spiel für Spiel, Liga für Liga; schlechter spielen nimmt nichts weg", () => {
  let prog = {};
  assert.deepEqual(K.nextGame(prog), { li: 0, gi: 0 });
  assert.ok(K.gameOpen(prog, 0, 0) && !K.gameOpen(prog, 0, 1) && !K.leagueOpen(prog, 1));
  let r = K.recordResult(prog, 0, 0, 0, 1);
  assert.equal(r.gained, 0); assert.deepEqual(r.prog, {});
  r = K.recordResult(prog, 0, 0, 2, 1); prog = r.prog;
  assert.equal(r.gained, 1); assert.ok(K.gameOpen(prog, 0, 1));
  r = K.recordResult(prog, 0, 0, 0, 5); assert.equal(K.starsOf(r.prog, 0, 0), 1, "Niederlage behält den Stern");
  r = K.recordResult(prog, 0, 0, 3, 0); assert.equal(r.gained, 2); prog = r.prog;
  for (let gi = 1; gi < 4; gi++) prog = K.recordResult(prog, 0, gi, 1, 0).prog;
  assert.ok(!K.leagueOpen(prog, 1));
  r = K.recordResult(prog, 0, 4, 2, 1);
  assert.ok(r.leagueDone); assert.equal(r.unlocked, 1); assert.ok(K.leagueOpen(r.prog, 1));
  assert.deepEqual(K.nextGame(r.prog), { li: 1, gi: 0 });
  assert.equal(K.leagueStars(r.prog, 0), 3 + 3 * 3 + 1);
  // letzte Liga: kein weiteres Freischalten
  let all = {};
  for (const [li, l] of CAREER.entries()) for (let gi = 0; gi < l.games.length; gi++) { const x = K.recordResult(all, li, gi, 1, 0); all = x.prog; if (li === 3 && gi === 4) assert.equal(x.unlocked, -1); }
  assert.equal(K.nextGame(all), null); assert.equal(K.totalStars(all), 60);
});
