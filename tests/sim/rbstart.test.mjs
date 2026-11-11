// Gegnersuche: Gast baut den Rollback-Startzustand des Hosts nach und vergleicht (core/rbstart.js)
import { test } from "node:test";
import assert from "node:assert/strict";
const P = await import("../../js/core/physics.js");
const R = await import("../../js/core/rbstart.js");

const MATCH = "3f2a9c1e-7b44-4d2e-9a10-5c6b7d8e9f01";
const seed = R.seedFrom(MATCH);
// so baut der Host (online.js hostStart, über beginMatch -> newMatch, dann netState): mit Kosmetik, Namen, Ball-Skin
const hostCfg = (o = {}) => ({ mode: "host", levels: [3, 5], cos: [{ shoes: "shoes:4", emotes: [] }, {}], chars: ["kalle", "yuki"], arena: "strand", dur: 90, rules: {}, mod: null, fair: true, golden: true, names: ["Host", "Gast"], labels: ["DU", null], ball: "neon", seed, ...o });
const sent = (o, patch) => { const st = JSON.parse(JSON.stringify(P.newMatch(hostCfg(o)))); if (patch) patch(st); return JSON.parse(JSON.stringify(st)); };
// was beim Gast ankommt (guestCfg): andere Beschriftung, sonst gleich
const guestCfg = (o = {}) => ({ ...hostCfg(o), mode: "guest", labels: [null, "DU"] });

test("Seed aus der Spiel-ID: fest, 32 Bit, je Spiel verschieden", () => {
  assert.equal(R.seedFrom(MATCH), seed);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
  assert.notEqual(R.seedFrom(MATCH.replace("01", "02")), seed);
});

test("frei gewählter Seed bestimmt Anstoß-Drift und erstes Power-up (deshalb aus der Spiel-ID)", () => {
  const first = s => { const st = P.newMatch({ ...hostCfg(), fair: false, seed: s }); return [Math.sign(st.b.vx), Math.round(st.puT)]; };
  const seen = new Set(); for (let s = 0; s < 64; s++) seen.add(first(s).join());
  assert.ok(seen.size >= 4, "verschiedene Seeds ergeben verschiedene Starts: " + [...seen]);
});

test("ehrlicher Start wird angenommen (Kosmetik, Namen, Ball-Skin, Beschriftung zählen nicht)", () => {
  const own = R.sameStart(guestCfg(), seed, sent());
  assert.deepEqual(own, sent(), "liefert den eigenen Nachbau");
  assert.notEqual(own, sent());
  assert.ok(R.sameStart(guestCfg({ names: ["X", "Y"], ball: "gold", cos: [{}, {}] }), seed, sent()));
  assert.ok(R.sameStart(guestCfg(), seed, sent({}, st => { st.ev = []; })));
  // Casual, Standardregeln mit „obs: off“ ausdrücklich
  assert.ok(R.sameStart(guestCfg({ fair: false, rules: { obs: "off" } }), seed, sent({ fair: false, rules: { obs: "off" } })));
});

test("manipulierter Start wird abgelehnt", () => {
  const bad = {
    ballPos: st => { st.b.x += 300; },
    ballVel: st => { st.b.vx = 900; },
    superLeiste: st => { st.p[0].meter = 100; st.p[0].full = true; },
    zeit: st => { st.t = 89; },
    zeitMehr: st => { st.t = 120; st.dur = 120; },
    stand: st => { st.s = [1, 0]; },
    level: st => { st.lv = [6, 5]; },
    powerup: st => { st.pu.push({ id: 1, k: "big", x: 300, y: 300, t: 8 }); },
    powerupZeit: st => { st.puT = 0.1; },
    powerupsAus: st => { st.pus = false; },
    spielerPos: st => { st.p[1].x -= 200; },
    spielerGross: st => { st.p[0].bigT = 10; st.p[0].sc = 1.4; },
    gegnerGefroren: st => { st.p[1].frz = 5; },
    zufall: st => { st.rng = (st.rng + 1) >>> 0; },
    phase: st => { st.ph = "play"; st.pt = 0; },
    regel: st => { st.rules.goal = 1.5; },
    bot: st => { st.bot = [{ level: 5 }, null]; },
    zusatzFeld: st => { st.p[0].extra = 1; },
    feldFehlt: st => { delete st.p[1].stun; },
    typ: st => { st.t = "90"; },
  };
  for (const [name, fn] of Object.entries(bad)) assert.equal(R.sameStart(guestCfg(), seed, sent({}, fn)), null, name);
  // anderer Seed (frei gewählt) oder anderer Kopf beim Host
  assert.equal(R.sameStart(guestCfg(), seed, sent({ seed: seed + 1 })), null, "seed");
  assert.equal(R.sameStart(guestCfg(), seed, sent({ chars: ["kalle", "kalle"] })), null, "kopf");
  // kaputte Daten
  for (const v of [null, 5, "x", [], {}]) assert.equal(R.sameStart(guestCfg(), seed, v), null, String(v));
  let deep = {}; const root = deep; for (let i = 0; i < 1e5; i++) deep = deep.b = {};
  assert.equal(R.sameStart(guestCfg(), seed, root), null, "sehr tief");
});

test("Arena aus der Spiel-ID wie in der Gegnersuche", () => {
  assert.equal(R.mmArena("01ab"), "strand");
  assert.equal(R.mmArena("02ab"), "stadion");
});

// Wiederaufnahme: Host schickt einen Stand mitten im Spiel (nach seinem Neustart)
function midGame() {
  const st = sent(); let acc = 0;
  for (let f = 0; f < 60 * 30; f++) { acc = P.advance(st, 1 / 60, [{ r: f % 90 < 40 }, { l: f % 70 < 30, j: f % 50 === 0 }], acc); st.ev.length = 0; }
  return JSON.parse(JSON.stringify(st));
}
test("Wiederaufnahme: nur genau der eigene Stand (exakt, ohne Ereignisse und Aufleuchten), jede Abweichung abgelehnt", () => {
  const own = midGame();
  assert.ok(own.t < 85, "Spiel läuft: " + own.t + " " + own.ph);
  const fix = patch => { const s2 = JSON.parse(JSON.stringify(own)); patch(s2); return s2; };
  assert.equal(R.sameState(own, fix(() => {})), true, "gleich");
  assert.equal(R.sameState(own, fix(s2 => { s2.ev = [{ t: "goal" }]; })), true, "Ereignisliste zählt nicht");
  const ok = fix(() => {}); if (ok.obs && ok.obs[0]) ok.obs[0].hitT = 0.3;
  assert.equal(R.sameState(own, ok), true, "Aufleuchten zählt nicht");
  // grobe Manipulationen: Ball mit 1e6 px/s, Figuren frei gesetzt, Tore, Zeit; dazu jede kleinste Abweichung
  const bad = {
    ballTempo: s2 => { s2.b.vx = -1e6; },
    figur: s2 => { s2.p[1].x += 300; },
    winzig: s2 => { s2.b.x += 1e-9; },
    tor: s2 => { s2.s = [own.s[0] + 1, own.s[1]]; },
    zeit: s2 => { s2.t -= 0.1; },
    feldDazu: s2 => { s2.extra = 1; },
    feldWeg: s2 => { delete s2.wind; },
    zufall: s2 => { s2.rng ^= 1; },
    kaputt: s2 => { s2.s = "x"; },
  };
  for (const [name, fn] of Object.entries(bad)) assert.equal(R.sameState(own, fix(fn)), false, name);
  for (const v of [null, 5, {}, []]) assert.equal(R.sameState(own, v), false, String(v));
  assert.equal(R.sameState(null, own), false, "ohne eigenen Stand: nein");
});

test("Wiederaufnahme mit Zurückdrehen: nur ohne Tor, Golden Goal und Abpfiff dazwischen (sameMoment)", () => {
  const a = { s: [1, 0], ph: "play", gold: false, t: 40 };
  assert.equal(R.sameMoment(a, { ...a, t: 39.5 }), true, "nur Zeit vergangen");
  assert.equal(R.sameMoment(a, { ...a, gold: undefined }), true, "gold fehlt = false");
  for (const ph of ["ko", "goal", "cd"]) assert.equal(R.sameMoment(a, { ...a, ph }), true, "Phasenwechsel " + ph + " zählt nicht");
  assert.equal(R.sameMoment({ ...a, ph: "goal" }, { ...a, ph: "ko" }), true, "Torjubel -> Anstoß");
  for (const [name, b] of Object.entries({ Tor: { ...a, s: [1, 1] }, Torjubel: { ...a, s: [2, 0], ph: "goal" }, Golden: { ...a, gold: true }, Ende: { ...a, ph: "end" } })) assert.equal(R.sameMoment(a, b), false, name);
  for (const v of [null, {}, { s: 3 }]) assert.equal(R.sameMoment(a, v), false, String(v));
});
