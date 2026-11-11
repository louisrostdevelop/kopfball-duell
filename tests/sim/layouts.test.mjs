// Arenen und Hindernisse: Design-Regeln (auch fürs Handy), neue Arten (Rampe, Geysir, Blasen, Noclip-Tür), Freischalten
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seedRandom } from "../lib/rng.mjs";
seedRandom(99);
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const LY = await import("../../js/content/layouts.js");
const A = await import("../../tools/balance/arenas.mjs");
const { W, G } = C;
const DT = 1 / 120;

function setup(arena, obs, o = {}) {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena, dur: 90, pus: false, golden: false, rules: { obs } });
  st.ph = "play"; st.pus = false; st.puT = 999;
  st.p[0].x = o.ax ?? 120; st.p[1].x = o.bx ?? W - 120;
  return st;
}

test("jede Arena hat 3 Layouts, alle halten die Design-Regeln ein (sichtbar auf dem Handy, Torraum, Anstoß, Startplätze)", () => {
  const bad = [];
  for (const a of C.ARENAS) {
    assert.equal(LY.layoutsFor(a.id).length, 3, a.id);
    LY.layoutsFor(a.id).forEach((_, i) => bad.push(...A.violations(a.id, i)));
  }
  assert.deepEqual(bad, []);
});

test("auf jedem Handy liegt der sichere Bereich unter der Anzeige", () => {
  for (const [name, w, h] of A.PHONES) assert.ok(A.hudBottom(w, h).hud < A.RULE_TOP, name);
});

test("Rampen sind nie steiler als 45°, Türen haben ein Gegenstück", () => {
  for (const a of C.ARENAS) LY.layoutsFor(a.id).forEach((l, i) => {
    for (const it of l.items) if (it.t === "ramp") assert.ok(it.inR >= it.h && it.outR >= it.h, `${a.id}.${i}`);
    for (const o of LY.buildObstacles(a.id, i)) if (o.t === "portal") assert.ok(o.to >= 0, `${a.id}.${i}`);
  });
});

test("Rampe: rollender Ball läuft hoch und hebt ab, steckt nie in der Rampe", () => {
  const st = setup("skate", 1);
  const r = st.obs.find(o => o.t === "ramp" && o.x < W / 2);
  // Ball rollt von der Mitte her auf den Kicker zu
  const b = st.b; b.x = r.x + r.top / 2 + r.R + 160; b.y = G - b.r; b.vx = -950; b.vy = 0;
  let air = 0, inside = 0;
  for (let k = 0; k < 240; k++) {
    P.step(st, DT, [{}, {}]); st.ev.length = 0; st.p[0].x = 120; st.p[1].x = W - 120;
    const ys = LY.rampY(r, b.x);
    if (ys !== null && b.y + b.r > ys + 6) inside++;
    if (ys === null && b.y + b.r < G - 25) air++;
  }
  assert.ok(air > 5, "hebt hinter der Rampe ab: " + air);
  assert.equal(inside, 0);
});

test("Rampe: Spieler läuft drüber, bleibt dabei am Boden und steht danach wieder unten", () => {
  const st = setup("skate", 0, { ax: 500 });
  const p = st.p[0]; let air = 0, maxUp = 0;
  for (let k = 0; k < 150; k++) {
    P.step(st, DT, [{ r: true }, {}]); st.ev.length = 0; st.b.x = 200; st.b.y = 120; st.b.vx = 0; st.b.vy = 0;
    if (!p.onG) air++;
    maxUp = Math.max(maxUp, G - P.footH(p) - p.y);
  }
  assert.ok(maxUp > 50, "ist oben auf der Funbox gewesen: " + maxUp.toFixed(0));
  assert.ok(air <= 4, "kein Hüpfen auf der Schräge: " + air + " Schritte in der Luft");
  assert.ok(p.onG && Math.abs(p.y - (G - P.footH(p))) < 1, "steht danach am Boden");
});

test("Geysir: kündigt sich an, bricht im Takt aus, schießt Ball und Spieler hoch; beide Seiten gleichzeitig", () => {
  const st = setup("vulkan", 0);
  const gs = st.obs.filter(o => o.t === "geyser");
  assert.equal(gs.length, 2);
  const g = gs[0], per = g.per;
  // Zeit kurz vor dem Ausbruch
  let t0 = 0; while (!LY.geyserState(g, t0).warn) t0 += 0.05;
  assert.ok(!LY.geyserState(g, t0).active, "Ankündigung vor dem Ausbruch");
  assert.deepEqual(LY.geyserState(gs[0], t0 + 1.3), LY.geyserState(gs[1], t0 + 1.3), "beide Seiten im gleichen Takt");
  let erupt = 0; for (let t = 0; t < per * 3; t += DT) if (LY.geyserState(g, t).active && !LY.geyserState(g, t - DT).active) erupt++;
  assert.equal(erupt, 3, "einmal pro Takt");
  // Ball und Spieler über dem Geysir, dann bis zum Ausbruch laufen lassen
  st.el = t0; st.b.x = g.x; st.b.y = G - st.b.r; st.b.vx = 0; st.b.vy = 0; st.p[0].x = gs[1].x + 4;
  let minY = G, pUp = 0, ev = 0;
  for (let k = 0; k < 320; k++) { P.step(st, DT, [{}, {}]); for (const e of st.ev.splice(0)) if (e.t === "geyser") ev++; minY = Math.min(minY, st.b.y); pUp = Math.min(pUp, st.p[0].vy); }
  assert.ok(minY < g.top + 20, "Ball fliegt bis über die Fontäne: " + minY.toFixed(0));
  assert.ok(minY > A.RULE_TOP - 30, "aber nicht aus dem Bild: " + minY.toFixed(0));
  assert.ok(pUp < -700, "Spieler fliegt hoch: " + pUp.toFixed(0));
  assert.ok(ev >= 2, "Ausbruch gemeldet (beide Geysire)");
});

test("Blasensäule: hebt den Ball im Takt, er bleibt nie oben hängen", () => {
  const st = setup("tiefsee", 0);
  const o = st.obs.find(q => q.t === "bubbles" && q.x < W / 2);
  st.b.x = o.x; st.b.y = G - st.b.r; st.b.vx = 0; st.b.vy = 0;
  let minY = G, high = 0;
  for (let k = 0; k < 120 * 12; k++) { P.step(st, DT, [{}, {}]); st.ev.length = 0; st.p[0].x = 120; st.p[1].x = W - 120; st.b.vx = 0; st.b.x = o.x; minY = Math.min(minY, st.b.y); if (st.b.y < 420) high += DT; }
  assert.ok(minY < 520, "Ball steigt: " + minY.toFixed(0));
  assert.ok(high < 6, "nicht die halbe Zeit oben: " + high.toFixed(1) + " s");
});

test("Noclip-Tür: Richtung eigenes Tor kommt der Ball aus der anderen Tür, Richtung Mitte geht er durch", () => {
  const st = setup("backrooms", 0);
  const left = st.obs.find(o => o.t === "portal" && o.x < W / 2), right = st.obs[left.to];
  const b = st.b;
  b.x = left.x + 40; b.y = G - b.r; b.vx = -700; b.vy = 0;
  let noclip = 0;
  for (let k = 0; k < 30; k++) { P.step(st, DT, [{}, {}]); for (const e of st.ev.splice(0)) if (e.t === "noclip") noclip++; st.p[0].x = 120; st.p[1].x = W - 120; }
  assert.equal(noclip, 1);
  assert.ok(b.x > W / 2 && b.x < right.x && b.vx < 0, "kommt rechts raus, fliegt weiter nach links: x " + b.x.toFixed(0));
  const st2 = setup("backrooms", 0), l2 = st2.obs.find(o => o.t === "portal" && o.x < W / 2);
  st2.b.x = l2.x - 40; st2.b.y = G - st2.b.r; st2.b.vx = 700; st2.b.vy = 0;
  let n2 = 0; for (let k = 0; k < 30; k++) { P.step(st2, DT, [{}, {}]); for (const e of st2.ev.splice(0)) if (e.t === "noclip") n2++; st2.p[0].x = 120; st2.p[1].x = W - 120; }
  assert.equal(n2, 0, "Richtung Mitte kein Noclip");
  assert.ok(st2.b.x > l2.x, "einfach durchgerollt");
});

test("Fuzz mit den neuen Arenen: kein NaN, Ball nie in einer Rampe", () => {
  let bad = 0, inside = 0, rs = 7; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  for (const ar of ["vulkan", "skate", "tiefsee", "backrooms"]) for (let li = 0; li < 3; li++) {
    const st = P.newMatch({ chars: ["tank", "flummi"], arena: ar, dur: 30, pus: true, rules: { obs: li } }); st.ph = "play";
    let i0 = {}, i1 = {};
    for (let k = 0; k < 120 * 10; k++) {
      if (k % 6 === 0) { i0 = { l: rnd() < 0.3, r: rnd() < 0.3, j: rnd() < 0.25, d: rnd() < 0.1, k: rnd() < 0.2 }; i1 = { l: rnd() < 0.3, r: rnd() < 0.3, j: rnd() < 0.25, d: rnd() < 0.1, k: rnd() < 0.2 }; }
      P.step(st, DT, [i0, i1]); st.ev.length = 0;
      if (st.ph !== "play") { st.ph = "play"; P.kickoff(st); }
      const v = [st.b.x, st.b.y, st.b.vx, st.b.vy, ...st.p.flatMap(p => [p.x, p.y])];
      if (v.some(x => !isFinite(x)) || st.b.y > G + 5) bad++;
      for (const o of st.obs) if (o.t === "ramp") { const ys = LY.rampY(o, st.b.x); if (ys !== null && st.b.y + st.b.r > ys + 8) inside++; }
    }
  }
  assert.equal(bad, 0); assert.equal(inside, 0);
});

test("Freischalten: alte Arenen über das Level, neue je Saison im Pass (Vorlage passt zu den Inhalten)", () => {
  const sql = readFileSync(new URL("../../supabase/ops/new-season.sql", import.meta.url), "utf8");
  const seasons = C.ARENAS.filter(a => a.season);
  assert.deepEqual(seasons.map(a => a.season), seasons.map((_, i) => i + 1), "Saisons 1, 2, 3 … ohne Lücke");
  for (const a of seasons) assert.match(sql, new RegExp(`when ${a.season} then '\\{"item":"arena:${a.id}"\\}'`), a.id);
  assert.ok(C.arenaFree(C.arenaById("stadion"), 1) && !C.arenaFree(C.arenaById("neon"), 4) && C.arenaFree(C.arenaById("neon"), 5));
  for (const a of seasons) assert.ok(!C.arenaFree(a, 99), a.id + " nie einfach frei");
});
