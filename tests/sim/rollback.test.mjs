// Rollback-Netcode mit simuliertem Netz: Laufzeit, Schwankung, Verlust, Reihenfolge, Ausfälle, verschieden schnelle
// Uhren. Geprüft wird das Wichtigste: beide Geräte kommen zu exakt demselben Spiel, und das ist exakt das Spiel, das ein
// einzelnes Gerät mit denselben Eingaben ausrechnet. Dazu: keine Phantom-Tore, Zeitabgleich, Korrektur nach Abweichung.
import { test } from "node:test";
import assert from "node:assert/strict";

const P = await import("../../js/core/physics.js");
const RB = await import("../../js/core/rollback.js");
const { createPeer } = await import("../../js/core/rbpeer.js");
const { gameTick, cleanInput } = await import("../../js/core/rbgame.js");

// kleiner Zufallsgenerator (unabhängig von Math.random)
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Spieler-Skript: alle 0,1–0,5 s neue Absicht, gelegentlich Emote; liefert Eingabe pro Aufruf */
function player(seed, emotes = true) {
  const r = prng(seed); let left = 0, cur = 0, n = 0;
  return () => {
    n++;
    if (--left <= 0) {
      left = 6 + Math.floor(r() * 24);
      cur = 0;
      if (r() < 0.4) cur |= RB.BITS.l; else if (r() < 0.6) cur |= RB.BITS.r;
      const x = r();
      if (x < 0.25) cur |= RB.BITS.j; else if (x < 0.4) cur |= RB.BITS.d; else if (x < 0.7) cur |= RB.BITS.k;
      if (r() < 0.05) cur |= RB.BITS.s;
      if (r() < 0.02) cur |= RB.BITS.x;
    }
    if (emotes && n % 400 === 17) return { b: cur, e: "😀" };
    return cur;
  };
}

/** Netz zwischen zwei Seiten: lat (ms), jit (ms), loss (nur schneller Kanal), Ausfälle [von, bis] (ms) */
function network(o, r) {
  const q = [];
  const deliverAt = (now, safe) => now + o.lat + (o.jit ? r() * o.jit : 0) + (safe ? 2 : 0);
  const lastSafe = [0, 0];
  return {
    send(from, msg, now, safe) {
      const dead = (o.outages || []).some(([a, b]) => now >= a && now < b);
      if (!safe && (dead || r() < (o.loss || 0))) return;
      let at = deliverAt(now, safe);
      if (safe) { if (dead) at = Math.max(at, (o.outages.find(([a, b]) => now >= a && now < b) || [0, 0])[1] + o.lat); at = Math.max(at, lastSafe[from] + 0.01); lastSafe[from] = at; }   // zuverlässig: geordnet, kommt irgendwann an
      q.push({ at, to: 1 - from, msg: JSON.parse(JSON.stringify(msg)) });
    },
    due(now) { const out = []; for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= now) out.push(q.splice(i, 1)[0]); return out.sort((a, b) => a.at - b.at); },
  };
}

/**
 * Ein Online-Spiel simulieren. o: { secs, lat, jit, loss, outages, drift: [a, b], fps: [a, b], delay, seed, bugAt }
 * bugAt: Takt, an dem Seite B (einmalig pro Rechnung) falsch rechnet – simuliert ein nicht deterministisches Gerät
 */
function simulate(o) {
  const r = prng(o.seed || 1);
  const st0 = P.newMatch({ chars: o.chars || ["kalle", "tank"], arena: o.arena || "stadion", dur: o.dur || 60, pus: true, golden: true, rules: o.rules || {}, seed: 4242 });
  st0.ph = o.ph || st0.ph;
  if (o.setup) o.setup(st0);
  const init = JSON.parse(JSON.stringify(st0));
  const net = network(o, r);
  const fin = [new Map(), new Map()], finEv = [[], []], spec = [[], []], peers = [];
  let now = 0;
  for (const me of [0, 1]) {
    const stepFn = (st, inputs, f) => {
      const ev = gameTick(st, inputs);
      if (me === 1 && o.bugAt !== undefined && f === o.bugAt) st.b.x += 0.5;   // Geräte-Abweichung
      return ev;
    };
    peers.push(createPeer({
      me, state: init, delay: o.delay ?? 2, maxPred: o.maxPred ?? 8, step: stepFn, mid: 1, ring: o.ring ?? 1e6,   // Standard alles behalten: Einzelrechnung von Takt 0 an
      send: m => net.send(me, m, now, false), sendSafe: m => net.send(me, m, now, true),
      onSpec: (e, f) => spec[me].push(e.t + "@" + f),
      onFinal: (evs, f, after) => { fin[me].set(f, RB.hashState(after)); for (const e of evs) finEv[me].push(e.t + "@" + f); },
    }));
  }
  const inp = [player(11 + (o.seed || 0)), player(29 + (o.seed || 0))];
  const fps = o.fps || [60, 60], drift = o.drift || [1, 1], nextT = [0, 0], maxGap = { v: 0 };
  const endT = (o.secs || 20) * 1000;
  while (now < endT) {
    // nächstes Ereignis: Bild einer Seite (mit etwas Schwankung) oder Paket
    const k = nextT[0] <= nextT[1] ? 0 : 1;
    now = nextT[k];
    for (const d of net.due(now)) peers[d.to].onMessage(d.msg);
    const dt = (1 / fps[k]) * drift[k] * (1 + (r() - 0.5) * 0.2);
    peers[k].update(dt, inp[k]);
    nextT[k] += dt * 1000 / drift[k];
    maxGap.v = Math.max(maxGap.v, Math.abs(peers[0].frame - peers[1].frame));
  }
  // Nachlauf: Netz ohne Ausfall, bis alles bestätigt ist
  for (let n = 0; n < 600; n++) { now += 8; for (const d of net.due(now)) peers[d.to].onMessage(d.msg); }
  return { peers, fin, finEv, spec, init, maxGap: maxGap.v };
}

/** gleiche Takte, gleiche Prüfsummen; dazu: einzelnes Gerät mit denselben Eingaben kommt zum selben Ergebnis */
function checkSame(res, label) {
  const [a, b] = res.fin; let n = 0, first = -1;
  for (const [f, h] of a) if (b.has(f)) { n++; if (b.get(f) !== h && first < 0) first = f; }
  assert.ok(n > 300, `${label}: genug gemeinsame endgültige Takte (${n})`);
  assert.equal(first, -1, `${label}: erste Abweichung bei Takt ${first}`);
  return n;
}
function checkReference(res, label) {
  const s = res.peers[0].session, st = RB.clone(res.init);
  const last = Math.max(...res.fin[0].keys());
  let bad = -1, n = 0;
  for (let f = 0; f <= last; f++) {
    const inputs = s.inputsAt(f);
    if (inputs[0] === undefined || inputs[1] === undefined) break;
    gameTick(st, inputs);
    const want = res.fin[0].get(f);
    if (want) { n++; if (want !== RB.hashState(st)) { bad = f; break; } }
  }
  assert.equal(bad, -1, `${label}: Rollback-Ergebnis = Einzelrechnung (Abweichung bei ${bad})`);
  assert.ok(n > 300 && n >= res.fin[0].size - 2, `${label}: Einzelrechnung über alle endgültigen Takte verglichen (${n} von ${res.fin[0].size})`);
}

test("Bausteine: Bits hin und zurück, Kopie exakt, Prüfsumme unabhängig von der Feldreihenfolge", () => {
  for (let n = 0; n < 128; n++) assert.equal(RB.packInput(RB.unpackInput(n)), n);
  const o = { a: -0, b: [1, { c: undefined, d: "x" }], e: null };
  const c = RB.clone(o);
  assert.ok(Object.is(c.a, -0)); assert.ok("c" in c.b[1]); assert.notEqual(c.b, o.b);
  assert.equal(RB.hashState({ x: 1, y: [2, 3] }), RB.hashState({ y: [2, 3], x: 1 }));
  assert.notEqual(RB.hashState({ x: 1 }), RB.hashState({ x: 1.0000001 }));
  assert.equal(RB.hashState({ x: 1, hitT: 5, ev: [1] }), RB.hashState({ x: 1 }), "Anzeige-Felder zählen nicht");
  // jedes NaN gleich (Prozessoren liefern verschiedene NaN-Bitmuster), -0 wie 0, aber 1 ≠ "1"
  const dv = new DataView(new ArrayBuffer(8)); dv.setUint32(0, 0xfff80000); dv.setUint32(4, 0); const nan2 = dv.getFloat64(0);
  dv.setUint32(0, 0x7ff80000); dv.setUint32(4, 12345); const nan3 = dv.getFloat64(0);
  assert.equal(RB.hashState({ v: NaN }), RB.hashState({ v: nan2 })); assert.equal(RB.hashState({ v: NaN }), RB.hashState({ v: nan3 }));
  assert.equal(RB.hashState({ v: -0 }), RB.hashState({ v: 0 })); assert.notEqual(RB.hashState({ v: 1 }), RB.hashState({ v: "1" }));
});

test("Takt-Funktion: Hit-Stop und Zeitlupe zählen in Takten, Schritte ganzzahlig", () => {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 60, seed: 3 }); st.ph = "play"; st.pt = 0;
  let steps = 0; const el = () => st.el;
  // normal: 2 Physikschritte je Takt
  let e0 = el(); P.tick(st, [{}, {}]); assert.equal(Math.round((el() - e0) * 120), 2); steps += 2;
  // Hit-Stop 0,1 s: 6 Takte ohne Schritt, dann geht es weiter
  st.hs = 0.1; e0 = el(); for (let k = 0; k < 6; k++) P.tick(st, [{}, {}]);
  assert.equal(el(), e0, "Hit-Stop: steht"); assert.ok(st.hs <= 1e-9, "Hit-Stop (fast) abgelaufen: " + st.hs);
  let n = 6; while (el() === e0 && n < 10) { P.tick(st, [{}, {}]); n++; }
  assert.ok(n <= 8, `nach 0,1 s (6 Takte, mit Rundung höchstens 8) geht es weiter (${n})`); assert.equal(Math.round((el() - e0) * 120), 2, "danach wieder 2 Schritte");
  // Zeitlupe 0,5 s = 30 Takte: je Takt 0,56 Schritte, zusammen 16 (Rest bleibt ganzzahlig in st.tq)
  st.slow = 0.5; st.tq = 0; e0 = el();
  for (let k = 0; k < 30; k++) P.tick(st, [{}, {}]);
  assert.equal(Math.round((el() - e0) * 120), 16, "Zeitlupe: 30 × 0,56 = 16 Schritte"); assert.equal(st.tq, 80);
  void steps;
});

test("Eingaben säubern: nur 7 Bits, unbekannte Emotes weg, kaputte Typen werden gültig", () => {
  const ok = e => e === "GG";
  assert.equal(cleanInput(255, ok), 127); assert.equal(cleanInput(-1, ok), 127); assert.equal(cleanInput("x", ok), 0);
  assert.equal(cleanInput(null, ok), 0); assert.equal(cleanInput(undefined, ok), 0); assert.equal(cleanInput(3.7, ok), 3);
  assert.deepEqual(cleanInput({ b: 5, e: "GG", z: 1 }, ok), { b: 5, e: "GG" });
  assert.equal(cleanInput({ b: 5, e: "<img>" }, ok), 5); assert.equal(cleanInput({ b: 999 }, ok), 999 & 127); assert.equal(cleanInput([], ok), 0);
});

test("Takt-Funktion: festes Raster, deterministisch, auch nach Übertragung", () => {
  const mk = () => { const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 60, seed: 7 }); return st; };
  const a = mk(), b = mk(), pl = player(3, false);
  for (let f = 0; f < 3000; f++) { const v = pl(); gameTick(a, [v, 0]); gameTick(b, [v, 0]); }
  assert.equal(RB.hashState(a), RB.hashState(b));
  // nach JSON (wie übers Netz) rechnet es genauso weiter
  const c = JSON.parse(JSON.stringify(a)), pl2 = player(5, false), pl3 = player(5, false);
  for (let f = 0; f < 2000; f++) { gameTick(a, [pl2(), 0]); gameTick(c, [pl3(), 0]); }
  assert.equal(RB.hashState(a), RB.hashState(c), "nach Übertragung weiter gleich");
});

const NETS = [
  { name: "LAN", lat: 5, jit: 2 },
  { name: "normal 40 ms", lat: 40, jit: 15 },
  { name: "mobil 90 ms, Schwankung, 5 % Verlust", lat: 90, jit: 60, loss: 0.05 },
  { name: "schlecht 160 ms, 15 % Verlust (Verzögerung 4, Vorhersage 10)", lat: 160, jit: 80, loss: 0.15, delay: 4, maxPred: 10 },
  { name: "Ausfall 2 s mitten im Spiel", lat: 50, jit: 20, outages: [[8000, 10000]] },
  { name: "Uhren verschieden schnell, 120 Hz gegen 60 Hz", lat: 60, jit: 20, drift: [1.004, 0.997], fps: [120, 60] },
  { name: "ohne Eingabeverzögerung", lat: 30, jit: 10, delay: 0 },
];
for (const n of NETS) test(`gleiches Spiel auf beiden Seiten: ${n.name}`, () => {
  const res = simulate({ secs: 25, ...n, seed: n.lat });
  checkSame(res, n.name);
  checkReference(res, n.name);
  const [ma, mb] = res.peers.map(p => p.metrics);
  assert.equal(ma.desyncs + mb.desyncs, 0, "keine Abweichung");
  assert.ok(Math.min(res.peers[0].frame, res.peers[1].frame) > 25 * 60 * 0.85 - (n.outages ? 150 : 0), `Spiel läuft flüssig weiter (${res.peers[0].frame}/${res.peers[1].frame} Takte)`);
  assert.ok(res.maxGap < (n.outages ? 200 : 30), `Seiten bleiben zeitlich beieinander (max. ${res.maxGap} Takte)`);
  // endgültige Ereignisse (Tore, Ende) auf beiden Seiten gleich und in gleicher Reihenfolge
  const cut = Math.min(res.peers[0].session.sync, res.peers[1].session.sync);
  const fe = res.finEv.map(l => l.filter(x => +x.split("@")[1] < cut));
  assert.deepEqual(fe[0], fe[1]);
  if (n.lat >= 90) assert.ok(ma.rollbacks + mb.rollbacks > 0, "es wurde wirklich zurückgespult");
});

test("Abweichung eines Geräts wird erkannt und vom Host korrigiert", () => {
  const res = simulate({ secs: 20, lat: 40, jit: 10, bugAt: 400, seed: 9 });
  const [ma, mb] = res.peers.map(p => p.metrics);
  assert.ok(ma.desyncs >= 1, "Host bemerkt die Abweichung");
  assert.ok(ma.resyncs >= 1 && mb.resyncs >= 1, "beide übernehmen den Host-Stand");
  // nach der Korrektur wieder gleich (nur noch prüfen, was nach der letzten Korrektur endgültig wurde)
  const [a, b] = res.fin; let n = 0, diff = 0;
  for (const [f, h] of a) if (f > 600 && b.has(f)) { n++; if (b.get(f) !== h) diff++; }
  assert.ok(n > 300); assert.equal(diff, 0, "danach keine Abweichung mehr");
});

test("keine Phantom-Tore: jedes endgültige Tor ist auf beiden Seiten und in der Einzelrechnung", () => {
  let goals = 0;
  for (const seed of [1, 2, 3]) {
    const res = simulate({ secs: 40, lat: 120, jit: 70, loss: 0.08, seed, rules: { goal: 1.4 } });
    const cut = Math.min(res.peers[0].session.sync, res.peers[1].session.sync);
    const g = res.finEv.map(l => l.filter(x => x.startsWith("goal@") && +x.split("@")[1] < cut));
    assert.deepEqual(g[0], g[1], "gleiche Tore zur gleichen Zeit");
    goals += g[0].length;
    checkReference(res, "Seed " + seed);
  }
  assert.ok(goals >= 2, `es fielen Tore (${goals})`);
});

test("Stau statt Davonlaufen: ohne Eingaben der Gegenseite höchstens maxPred Takte voraus", () => {
  const init = P.newMatch({ chars: ["kalle", "tank"], arena: "stadion", seed: 1 });
  const peer = createPeer({ me: 0, state: init, delay: 2, maxPred: 8, step: (st, i) => gameTick(st, i), send: () => {} });
  for (let i = 0; i < 120; i++) peer.update(1 / 60, () => 0);
  assert.ok(peer.frame <= 2 + 8 + 1, `bleibt stehen (${peer.frame})`);
  assert.ok(peer.metrics.stalls > 0);
});

test("Zufallsprüfung: 24 Spiele mit zufälligem Netz, Köpfen, Arenen und Regeln", () => {
  const r = prng(2026), pick = a => a[Math.floor(r() * a.length)];
  const heads = ["kalle", "yuki", "bolt", "tank", "flummi", "tina", "magnus", "emo", "sigma", "crypto", "moai", "rapper"];
  const arenas = ["stadion", "strand", "neon", "eis", "mond", "vulkan", "skate", "backrooms"];
  const rules = [{}, { obs: 0 }, { obs: 1 }, { obs: 2, field: 1.18 }, { pu: "many" }, { grav: 0.55 }, { floor: "ice" }, { kick: 1.45, bounce: 1.4 }];
  for (let k = 0; k < 24; k++) {
    const n = { lat: 5 + Math.floor(r() * 150), jit: Math.floor(r() * 80), loss: r() < 0.5 ? 0 : r() * 0.15, delay: 1 + Math.floor(r() * 5), maxPred: 8 + Math.floor(r() * 4) };
    const o = { secs: 9, ...n, seed: 100 + k, chars: [pick(heads), pick(heads)], arena: pick(arenas), rules: pick(rules), ph: r() < 0.5 ? "play" : undefined };
    const label = `#${k} ${JSON.stringify(n)} ${o.arena} ${o.chars.join("/")} ${JSON.stringify(o.rules)}`;
    const res = simulate(o);
    checkSame(res, label);
    checkReference(res, label);
    assert.equal(res.peers[0].metrics.desyncs + res.peers[1].metrics.desyncs, 0, label);
  }
});

test("kleiner Speicher (Ringpuffer 24 Takte) mit Ausfall: trotzdem gleich", () => {
  const res = simulate({ secs: 20, lat: 70, jit: 40, loss: 0.1, outages: [[6000, 12000]], ring: 24, delay: 2, maxPred: 8, seed: 77 });
  checkSame(res, "Ring 24");
  assert.equal(res.peers[0].metrics.desyncs + res.peers[1].metrics.desyncs, 0);
  assert.ok(res.peers[0].session.stateAt(0) === null, "alte Zustände wirklich verworfen");
});

test("Spielende: genau ein endgültiger Abpfiff je Seite, im selben Takt, mit gleichem Ergebnis", () => {
  const res = simulate({ secs: 20, lat: 100, jit: 60, loss: 0.08, dur: 8, seed: 5, ph: "play", setup: st => { st.s = [1, 0]; } });   // mit Führung: kein Golden Goal
  const ends = res.finEv.map(l => l.filter(x => x.startsWith("end@")));
  assert.equal(ends[0].length, 1, "Host: " + ends[0]); assert.deepEqual(ends[1], ends[0], "Gast gleich");
  const f = +ends[0][0].split("@")[1];
  assert.equal(res.fin[0].get(f), res.fin[1].get(f), "gleicher Zustand beim Abpfiff");
});

test("Korrektur: zu alter Takt wird abgelehnt (kein Stillstand), Takt in der Zukunft springt vor", () => {
  const init = P.newMatch({ chars: ["kalle", "tank"], arena: "stadion", seed: 2 });
  const s = RB.createSession({ me: 1, state: init, delay: 2, maxPred: 8, ring: 16, tick: (st, i) => gameTick(st, i) });
  for (let f = 0; f < 100; f++) { s.setLocal(0); s.addRemote(f + 2, [0]); s.advance(); }
  assert.equal(s.frame, 100);
  assert.equal(s.resync(40, RB.clone(init)), false, "Takt 40 liegt vor dem Speicher");
  s.setLocal(0); assert.notEqual(s.advance(), null, "läuft weiter");
  const st = RB.clone(s.state());
  assert.equal(s.resync(s.frame + 3, st), true, "Zukunft: übernimmt");
  assert.ok(s.frame >= 101, "springt auf den späteren Takt: " + s.frame);
  s.setLocal(0); s.addRemote(s.remoteTop + 1, [0, 0, 0, 0, 0, 0]);
  assert.notEqual(s.advance(), null, "läuft nach dem Sprung weiter");
});
