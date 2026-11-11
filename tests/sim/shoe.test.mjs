// Schuh mit Kreisbahn: alle Regeln aus dem Sparring und die Randfälle (schnelle Wechsel, Grätsche, Bombe,
// Halten, Puffer, Super, Feuer, Schubser). Der Schuh hängt immer am Kopf und springt nie.
import { test } from "node:test";
import assert from "node:assert/strict";
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const DT = 1 / 120;
const { SHOE } = P;

function setup(o = {}) {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, pus: false, golden: false, rules: { ...(o.rules || {}) }, seed: 7 });
  st.ph = "play"; st.pt = 0; st.puT = 999;
  const p = st.p[0]; p.x = o.x ?? 600; st.p[1].x = o.ox ?? 1500;
  st.b.x = o.bx ?? 1100; st.b.y = o.by ?? C.G - st.b.r; st.b.vx = 0; st.b.vy = 0;
  return st;
}
// n Schritte; inp(k, st) liefert die Eingabe für Spieler 0; each(st) nach jedem Schritt; liefert alle Ereignisse
function run(st, n, inp, each) {
  inp ??= () => ({});
  const evs = [];
  for (let k = 0; k < n; k++) { P.step(st, DT, [inp(k, st) || {}, {}]); evs.push(...st.ev.splice(0)); if (each) each(st, k); }
  return evs;
}
const geo = st => P.shoeGeo(st.p[0]);
// Ball an einer Stelle festhalten, bis der Schuh ihn trifft (wie ein Zuspiel im richtigen Moment)
const pin = (x, y) => st => { if (!st._hit) { st.b.x = x; st.b.y = y; st.b.vx = 0; st.b.vy = 0; } };

test("Kopf steht auf dem Boden, Schuh mittig unten auf der Bodenlinie", () => {
  const st = setup(), p = st.p[0], g = geo(st);
  assert.equal(p.y, C.G - C.HR);
  assert.ok(Math.abs(g.x - p.x) < 1e-9 && Math.abs(g.y - (p.y + SHOE.ring * C.HR)) < 1e-9, "Ruhe: mittig unter dem Kopf");
  run(st, 60); assert.equal(st.p[0].y, C.G - C.HR, "bleibt stehen");
});

test("Tipp gibt den vollen Schwung (hoch in tUp, zurück in tDown); Halten lässt das Bein oben", () => {
  const st = setup(); let top = 0, upAt = -1, backAt = -1;
  run(st, 80, k => ({ k: k === 0 }), (s, k) => { const d = s.p[0].lgD; if (d > top) top = d; if (d >= 1 && upAt < 0) upAt = k; if (upAt >= 0 && d === 0 && backAt < 0) backAt = k; });
  assert.equal(top, 1, "ganz hoch");
  assert.ok(Math.abs((upAt + 1) * DT - SHOE.tUp) <= DT + 1e-9, `hoch nach ${(upAt + 1) * DT}`);
  assert.ok(Math.abs((backAt - upAt) * DT - SHOE.tDown) <= DT * 2, `zurück nach ${(backAt - upAt) * DT}`);
  const h = setup(); run(h, 90, () => ({ k: true }));
  assert.equal(h.p[0].lgS, 2); assert.equal(h.p[0].lgD, 1);
  run(h, 40); assert.equal(h.p[0].lgS, 0, "losgelassen: zurück in Ruhe");
});

test("Schuss nur im Schwung nach oben, genau einmal je Schwung, innerhalb der Leitplanken", () => {
  for (const [dx, h] of [[80, 0], [95, 0], [85, 40], [90, 75]]) {
    const st = setup(), p = st.p[0], bx = p.x + dx, by = C.G - st.b.r - h;
    const evs = run(st, 60, k => ({ k: k < 2 }), (s) => { pin(bx, by)(s); });
    const kicks = evs.filter(e => e.t === "kick");
    // Ball festgehalten: erster Treffer zählt, danach darf derselbe Schwung nicht noch einmal schießen
    assert.equal(kicks.length, 1, `${dx}/${h}: ${kicks.length} Schüsse`);
    assert.ok(kicks[0].spd >= SHOE.minShot - 1 && kicks[0].spd <= SHOE.maxShot + 1, `Tempo ${kicks[0].spd}`);
  }
});

test("Gehaltenes Bein ist weich: Ball prallt ab, kein Schuss, kein Schubser", () => {
  const st = setup(); run(st, 40, () => ({ k: true }));
  const g = geo(st); st.b.x = g.x + 60; st.b.y = g.y - 10; st.b.vx = -900; st.b.vy = 0;
  let back = null;
  const evs = run(st, 30, () => ({ k: true }), s2 => { if (back === null && s2.b.vx > 0) back = s2.b.vx; });
  assert.equal(evs.filter(e => e.t === "kick").length, 0, "kein Schuss");
  assert.ok(back > 0 && back < 900, `Ball abgeprallt und gebremst (${Math.round(back)})`);
});

test("Grätsche hat Vorrang: Schwung bricht ab (kraftlos), danach Bein unten, bis neu gedrückt wird", () => {
  const st = setup({ bx: 1400 });
  run(st, 5, () => ({ k: true }));
  assert.equal(st.p[0].lgS, 1);
  run(st, 2, () => ({ k: true, d: true }));
  assert.ok(st.p[0].slide > 0, "Grätsche startet sofort");
  run(st, 60, () => ({ k: true }));
  assert.equal(st.p[0].slide, 0); assert.equal(st.p[0].lgS, 0, "nach der Grätsche Bein unten trotz gehaltener Taste");
  run(st, 2); run(st, 4, () => ({ k: true }));
  assert.equal(st.p[0].lgS, 1, "neu gedrückt: neuer Schwung");
});

test("Puffer: Druck in den letzten 0,15 s der Grätsche wird beim Aufstehen ausgeführt, früher verfällt er", () => {
  for (const [left, want] of [[0.1, true], [0.25, false]]) {
    const st = setup({ bx: 1400 }), p = st.p[0];
    run(st, 2, () => ({ d: true }));
    while (p.slide > left) run(st, 1);
    run(st, 2, () => ({ k: true }));
    let swung = false; run(st, 60, () => ({}), s => { if (s.p[0].lgS === 1) swung = true; });
    assert.equal(swung, want, `Druck ${left} s vor Ende`);
  }
});

test("Schnell abwechselnd Grätsche und Springen (mit Schwüngen dazwischen): Schuh hängt immer am Kopf und springt nie", () => {
  const st = setup({ bx: 1400 }), p = st.p[0];
  let last = null, maxJump = 0, maxDist = 0;
  const seq = k => { const m = k % 26; return { r: true, d: m === 0 || m === 13, j: m === 3 || m === 16, k: m === 8 || m === 20 || m === 21 }; };
  run(st, 1200, seq, () => {
    const g = P.shoeGeo(p), rel = { x: g.x - p.x, y: g.y - p.y };
    maxDist = Math.max(maxDist, Math.hypot(rel.x, rel.y));
    if (last) maxJump = Math.max(maxJump, Math.hypot(rel.x - last.x, rel.y - last.y));
    last = rel;
  });
  assert.ok(maxDist <= SHOE.ring * C.HR + 2, `Abstand Schuh–Kopf höchstens ${maxDist.toFixed(1)}`);
  // pro Schritt (1/120 s) bewegt sich der Schuh relativ zum Kopf höchstens so weit wie beim schnellsten Schwung
  assert.ok(maxJump < 22, `größter Sprung relativ zum Kopf ${maxJump.toFixed(1)} px`);
});

test("Bombe und Einfrieren: Bein geht kraftlos zurück, kein Schuss in der Bombe", () => {
  const st = setup(), p = st.p[0];
  run(st, 20, k => ({ j: k < 15 }));
  run(st, 4, () => ({ k: true }));
  assert.equal(p.lgS, 1);
  const evs = run(st, 3, () => ({ k: true, d: true }));
  assert.ok(p.bomb, "Bombe startet"); assert.equal(p.lgS, 3, "Bein geht zurück");
  run(st, 60, () => ({ k: true }));
  assert.equal(evs.filter(e => e.t === "kick").length, 0);
  const f = setup(); f.p[0].frz = 0.5; run(f, 10, () => ({ k: true }));
  assert.equal(f.p[0].lgS, 0, "eingefroren: kein Schwung");
});

test("Schubser nur im Schwung, einmal je Schwung; gehaltenes Bein am Gegner schubst nicht", () => {
  const st = setup({ ox: 680, bx: 1400 }); st.p[1].dir = -1;
  const evs = run(st, 40, k => ({ k: k < 2 }));
  assert.equal(evs.filter(e => e.t === "bump").length, 1);
  const h = setup({ bx: 1400 }); run(h, 40, () => ({ k: true }));   // Bein oben, dann läuft der Gegner hinein
  h.p[1].x = h.p[0].x + 110; h.p[1].pushCD = 0;
  const ev2 = run(h, 30, () => ({ k: true }));
  assert.equal(ev2.filter(e => e.t === "bump").length, 0);
});

test("Scharfer Super zündet bei jeder Berührung, auch am gehaltenen Bein; Feuer-Power-up nur im Schwung", () => {
  const st = setup(), p = st.p[0]; run(st, 40, () => ({ k: true }));
  p.armed = 2; const g = geo(st); st.b.x = g.x + 40; st.b.y = g.y; st.b.vx = -500; st.b.vy = 0;
  run(st, 10, () => ({ k: true }));
  assert.ok(st.b.fx, "Super gezündet am gehaltenen Bein");
  const f = setup(), q = f.p[0]; run(f, 40, () => ({ k: true }));
  q.fireNext = true; const g2 = geo(f); f.b.x = g2.x + 40; f.b.y = g2.y; f.b.vx = -500; f.b.vy = 0;
  run(f, 10, () => ({ k: true }));
  assert.equal(q.fireNext, true, "Feuer nicht am gehaltenen Bein");
  const h = setup(), r = h.p[0]; r.fireNext = true; const bx = r.x + 80, by = C.G - h.b.r;
  run(h, 30, k => ({ k: k < 2 }), s => { if (!s.b.fx) pin(bx, by)(s); });
  assert.equal(r.fireNext, false, "Feuer im Schwung"); assert.equal(h.b.fx, "fire");
});

test("Tor in der Bewegung: Bein entspannt sich im Jubel, Anstoß beginnt in Ruhe", () => {
  const st = setup(); run(st, 30, () => ({ k: true }));
  st.ph = "goal"; st.pt = 0.4;
  run(st, 30, () => ({ k: true }));
  assert.equal(st.p[0].lgS, 0, "im Jubel zurück in Ruhe");
  run(st, 60);
  assert.equal(st.ph === "ko" || st.ph === "play", true);
  assert.equal(st.p[0].lgD, 0); assert.equal(st.p[0].y, C.G - C.HR);
});

test("Schussrichtung: nie nach hinten, vom Boden gelupft, in Kopfhöhe nicht steil, Timing bestimmt den Winkel mit", () => {
  // Winkel direkt nach dem Schuss messen (Ereignis kick)
  const shotAng = (dx, h, bvx, delay) => {
    const st = setup(), p = st.p[0];
    st.b.x = p.x + dx; st.b.y = p.y + h; st.b.vx = bvx || 0;
    for (let k = 0; k < 90; k++) {
      if (!bvx) { st.b.x = p.x + dx; st.b.y = p.y + h; st.b.vx = 0; st.b.vy = 0; }
      P.step(st, DT, [{ k: k >= (delay || 0) && k < (delay || 0) + 2 }, {}]);
      if (st.ev.splice(0).some(e => e.t === "kick")) return Math.atan2(-st.b.vy, st.b.vx) * 180 / Math.PI;
    }
    return null;
  };
  const all = [];
  for (const h of [0.95, 0.6, 0.3, 0, -0.3, -0.6]) for (const dx of [0.9, 1.2, 1.5]) { const a = shotAng(dx * C.HR, h * C.HR); assert.ok(a !== null, `trifft ${dx}/${h}`); all.push([h, a]); }
  const timed = {};
  for (const h of [0.9, -0.2]) for (let d = 0; d < 40; d += 4) { const a = shotAng(4 * C.HR, h * C.HR, -500, d); if (a !== null) { all.push([h, a]); (timed[h] ||= []).push(a); } }
  for (const [h, a] of all) assert.ok(a >= SHOE.angMin - 0.5 && a <= SHOE.angMax + 0.5, `Höhe ${h}: ${a.toFixed(1)}° (nie nach hinten)`);
  const ground = shotAng(1.2 * C.HR, 0.95 * C.HR), mid = shotAng(1.2 * C.HR, 0);
  // Grenze ist der Lupfer-Winkel KICK.lobAng: gelupft heißt steiler als der (eine feste Gradzahl knapp darunter würde
  // bei jeder kleinen Änderung an Zielhilfe oder angLow kippen)
  assert.ok(ground > P.KICK.lobAng, `ruhender Ball am Boden gelupft: ${ground.toFixed(1)}°`);
  assert.ok(mid < 45, "Kopfhöhe geht nach vorne, nicht steil nach oben: " + mid.toFixed(0));
  // beim zugespielten Ball bestimmt der Zeitpunkt des Drückens den Winkel spürbar mit (Zielhilfe < 1)
  for (const h of [0.9, -0.2]) { const a = timed[h]; assert.ok(a && a.length >= 4 && Math.max(...a) - Math.min(...a) >= 15, `Höhe ${h}: Winkel je nach Timing ${a && a.map(x => x.toFixed(0)).join(" ")}`); }
});

test("Ball hinter der Kopfmitte: Ferse schießt nicht", () => {
  const st = setup(), p = st.p[0];
  const evs = run(st, 40, k => ({ k: k < 2 }), s => { s.b.x = p.x - 8; s.b.y = p.y + C.HR * 1.1; s.b.vx = 0; s.b.vy = 0; });
  assert.equal(evs.filter(e => e.t === "kick").length, 0);
});

// flacher Bogen für Abstände 0,8–1,45 r (für alle Köpfe gleich); die Grenzen 24–29° lassen etwas Luft und liegen weit
// weg von einem steilen Bogen über 30° und vom flachen Schuss
test("Ruhender Ball am Boden, sauber getroffen: Bogen um 26° (nicht flach)", () => {
  for (const dx of [0.9, 1.1, 1.3]) {
    const st = setup(), p = st.p[0];
    let ang = null, kind = null;
    for (let k = 0; k < 60 && ang === null; k++) {
      st.b.x = p.x + dx * C.HR; st.b.y = C.G - st.b.r; st.b.vx = 0; st.b.vy = 0;
      P.step(st, DT, [{ k: k < 2 }, {}]);
      const e = st.ev.splice(0).find(x => x.t === "kick");
      if (e) { ang = Math.atan2(-st.b.vy, st.b.vx) * 180 / Math.PI; kind = e.kind; }
    }
    assert.ok(ang !== null && ang > 24 && ang < 29, `Abstand ${dx} r: ${ang && ang.toFixed(1)}°`);
    assert.equal(kind, "lob", `Abstand ${dx} r: Lupfer (Schwelle KICK.lobAng)`);
  }
});
