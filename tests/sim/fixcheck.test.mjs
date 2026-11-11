// Angriffe eines manipulierten Hosts über eine Korrektur (rs): unter
// Freunden lehnt der Gast sie ab (fixOk), in der Gegnersuche gibt es keine Korrektur (strict: ungültig). Wiederaufnahme
// in der Gegnersuche: exakter Vergleich (tests/sim/rbstart.test.mjs). Ehrliche Abweichungen: tests/sim/rollback.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
const P = await import("../../js/core/physics.js");
const { gameTick } = await import("../../js/core/rbgame.js");
const { fixOk } = await import("../../js/core/rbfix.js");
const C = await import("../../js/content/config.js");
const J = o => JSON.parse(JSON.stringify(o));

// ein laufendes Spiel (Gast-Sicht), Stand 1:0
function midGame(seed = 5) {
  const st = P.newMatch({ chars: ["kalle", "tank"], arena: "stadion", dur: 90, pus: true, golden: true, rules: { obs: "off" }, seed });
  for (let f = 0; f < 900; f++) gameTick(st, [f % 50 < 25 ? 2 : 16, f % 40 < 20 ? 1 : 4]);
  const own = J(st); own.s = [1, 0]; own.ph = "play"; own.pt = 0; own.b.x = C.W / 2;
  return own;
}
const why = (own, fix, rec = []) => { const w = []; return fixOk(own, fix, rec, { why: w }) ? "ok" : w.join(","); };

test("Korrektur: Angriffe eines manipulierten Hosts werden abgelehnt", () => {
  const own = midGame(), W = C.W;
  const cases = {
    "Golden Goal und Torjubel kurz vor Schluss (sofortiges Ende)": f => { f.gold = true; f.ph = "goal"; f.pt = 0.01; },
    "Ende sofort": f => { f.ph = "end"; },
    "Gast-Tor weg": f => { f.s = [1, -1]; },
    "Gast-Tor weg, obwohl es nicht gerade fiel": () => {},   // (eigener Stand 1:1 unten)
    "Gast eingefroren 1e9 s": f => { f.p[1].frz = 1e9; },
    "Gast eingefroren 5 s": f => { f.p[1].frz = 5; },
    "Wand vor dem Host-Tor": f => { f.wall[0] = 1e9; },
    "großes Gast-Tor": f => { f.bigGoal[1] = 60; },
    "Hindernisse ersetzt": f => { f.obs = [{ t: "plat", x: 60, y: 300, w: 120, h: 300, block: true }]; },
    "Hit-Stop ewig": f => { f.hs = 1e9; },
    "Zeitlupe ewig": f => { f.slow = 50; },
    "Host-Kopf riesig": f => { f.p[0].bigT = 1e9; f.p[0].sc = 9; },
    "Restzeit −6 s": f => { f.t = own.t - 6; },
    "Restzeit −3 s": f => { f.t = own.t - 3; },
    "Restzeit über der Spieldauer": f => { f.t = 500; },
    "Spielzeit verschoben": f => { f.el += 30; },
    "Tor für beide Seiten": f => { f.s = [2, 1]; f.b.x = W - 40; f.ph = "goal"; f.pt = 3.5; },
    "zwei Tore": f => { f.s = [3, 0]; f.b.x = W - 40; f.ph = "goal"; f.pt = 3.5; },
    "Host-Tor, Ball nie an der Linie": f => { f.s = [2, 0]; f.ph = "goal"; f.pt = 3.5; },
    "Host-Tor ohne Jubel": f => { f.s = [2, 0]; f.b.x = W - 40; },
    "Phasen-Zeit zu groß": f => { f.ph = "ko"; f.pt = 50; },
    "unbekannte Phase": f => { f.ph = "pause"; },
    "Countdown mitten im Spiel": f => { f.ph = "cd"; f.pt = 3; f.s = [1, 1]; },
    "NaN im Ball": f => { f.b.vx = NaN; },
    "riesige Zahl": f => { f.b.vx = 1e300; },
    "Spieler kaputt": f => { f.p[1] = { ch: "tank" }; },
    "Ball weit außerhalb": f => { f.b.x = -5000; },
    "Ball mit 1e6 px/s": f => { f.b.vx = -1e6; },
    "Ball schneller als möglich": f => { f.b.vx = 9000; },
    "Figur rast": f => { f.p[0].vx = 6000; },
    "Zahl über 1e6": f => { f.puId = 1e8; },
    "Power-ups gefüllt": f => { f.pu = Array.from({ length: 9 }, (_, i) => ({ id: i, k: "big", x: 100, y: 300, t: 0 })); },
    "Bot eingeschmuggelt": f => { f.bot = [{ i: 0, lvl: 3 }, null]; },
    "Regeln": f => { f.rules.kick = 1.45; },
    "Level": f => { f.lv = [9, 1]; },
  };
  for (const [k, fn] of Object.entries(cases)) {
    let o = own;
    if (k.startsWith("Gast-Tor weg, obwohl")) { o = J(own); o.s = [1, 1]; }   // Gast führt nicht gerade durch ein frisches Tor
    const fx = J(o); fn(fx);
    if (k.startsWith("Gast-Tor weg, obwohl")) fx.s = [1, 0];
    assert.notEqual(why(o, fx), "ok", k);
  }
  // +1 für den Host, weil der Ball einmal im Feld vor dem Gast-Tor war (früher reichte 0,7 W): nein
  const rec = [J(own)]; rec[0].b.x = W * 0.75;
  const fx = J(own); fx.s = [2, 0]; fx.ph = "goal"; fx.pt = 3.4;
  assert.notEqual(why(own, fx, rec), "ok", "Tor ohne Ball an der Linie");
});

test("Korrektur: was ein ehrlicher Resync ändert, geht durch", () => {
  const own = midGame(), W = C.W;
  const ok = {
    "Positionen, Zufall, Statistik": f => { f.b.x += 300; f.p[0].x -= 80; f.rng ^= 5; f.stats[0].shots += 3; },
    "Restzeit 2 s anders (Torjubel)": f => { f.t -= 2; },
    "Power-up-Zeiten im Rahmen": f => { f.p[0].bigT = 4; f.p[1].frz = 1.2; f.wall[1] = 3; },
    "Host hatte ein Tor, der Ball liegt im Tor": f => { f.s = [2, 0]; f.b.x = W - 50; f.ph = "goal"; f.pt = 3.3; f.slow = 0.9; },
  };
  for (const [k, fn] of Object.entries(ok)) { const fx = J(own); fn(fx); assert.equal(why(own, fx), "ok", k); }
  // Gast hatte ein Tor, das der Host nicht hatte (frisch: Jubel läuft erst kurz)
  const g = J(own); g.s = [1, 1]; g.ph = "goal"; g.pt = 3.2;
  const fx = J(own); fx.s = [1, 0];
  assert.equal(why(g, fx), "ok", "frisches Gast-Tor zurückgenommen");
  // dasselbe Tor, Anstoß verschoben (goal → ko), und Golden Goal kurz vor Schluss
  const a = J(own); a.ph = "goal"; a.pt = 0.4; const b = J(a); b.ph = "ko"; b.pt = 0.8;
  assert.equal(why(a, b), "ok", "Jubel zu Ende, Anstoß");
  const e = J(own); e.s = [1, 1]; e.t = 0.6; const gfx = J(e); gfx.t = 0; gfx.gold = true; gfx.ph = "cd"; gfx.pt = 2.2;
  assert.equal(why(e, gfx), "ok", "Golden Goal beginnt beim Host");
});

test("Korrektur: zu weit in der Zukunft oder veraltet; Limit je Minute in echter Zeit (rbpeer.js, rbnet.js)", async () => {
  const { createPeer } = await import("../../js/core/rbpeer.js");
  const st = midGame(), out = [];
  const peer = createPeer({ me: 1, state: J(st), delay: 3, maxPred: 10, mid: 1, step: (s, inp) => gameTick(s, inp), send: () => {}, checkFix: () => true, onBadFix: () => out.push("bad") });
  for (let k = 0; k < 20; k++) peer.update(1 / 60, () => 0);   // läuft voraus, wartet dann auf den Host
  const f = peer.frame;
  peer.onMessage({ t: "rs", mid: 1, f: f + 50, st: J(st) });
  assert.deepEqual(out, ["bad"], "Takt weit voraus: abgelehnt");
  peer.onMessage({ t: "rs", mid: 1, f: -400, st: J(st) });
  assert.equal(peer.metrics.staleFixes, 1, "veraltet: verworfen, kein Abbruch");
  assert.deepEqual(out, ["bad"]);
});

test("Gegnersuche (strict): eine Korrektur des Hosts macht das Spiel ungültig, statt angenommen zu werden", async () => {
  const { createPeer } = await import("../../js/core/rbpeer.js");
  const st = midGame(), out = [];
  const peer = createPeer({ me: 1, state: J(st), delay: 3, maxPred: 10, mid: 1, step: (s, inp) => gameTick(s, inp), send: () => {}, checkFix: () => true, strict: () => true, onDesync: () => out.push("desync") });
  peer.update(1 / 60, () => 0);
  const fx = J(st); fx.s = [0, 0];
  peer.onMessage({ t: "rs", mid: 1, f: 0, st: fx });
  assert.deepEqual(out, ["desync"]);
  assert.deepEqual(peer.state().s, st.s, "Stand nicht übernommen");
});
