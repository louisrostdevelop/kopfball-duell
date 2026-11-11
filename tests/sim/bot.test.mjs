// Neuer Bot (st.bot, läuft im Physikschritt): deterministisch und rollback-fest, fängt Bälle ab, klärt vor dem eigenen
// Tor, lenkt Bälle nicht ins eigene Tor, knackt einen Camper, Stufen in der richtigen Reihenfolge. Torwart fürs Training.
import { test } from "node:test";
import assert from "node:assert/strict";
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const { clone, hashState } = await import("../../js/core/rollback.js");
const { KEEPER_ZONE } = await import("../../js/core/bot/brain.js");
const DT = 1 / 120;

const match = (o = {}) => P.newMatch({ chars: o.chars || ["kalle", "yuki"], arena: o.arena || "stadion", dur: o.dur || 90, pus: o.pus ?? false, golden: false, rules: { ...(o.rules || {}) }, seed: o.seed ?? 7, bots: o.bots || [null, 3] });
// n Schritte; inp(st) liefert die Eingabe für Spieler 0 (der Bot rechnet selbst); Ereignisse gesammelt
function run(st, n, inp) {
  const evs = [];
  for (let k = 0; k < n; k++) { P.step(st, DT, [inp ? inp(st) : {}, {}]); evs.push(...st.ev.splice(0)); if (st.ph === "end") break; }
  return evs;
}
// Camper: steht vor dem eigenen Tor, springt bei hohen Bällen, schießt weg (mit menschlicher Pause zwischen Aktionen)
const camper = () => { let kt = 0, jt = 0; return st => { const p = st.p[0], b = st.b, c = {}; const home = C.GOAL_W + 60; if (home > p.x + 12) c.r = true; else if (home < p.x - 12) c.l = true; kt -= DT; jt -= DT; if (Math.abs(b.x - p.x) < 150 && b.x - p.x > -5 && kt <= 0) { c.k = true; kt = 0.3; } if (Math.abs(b.x - p.x) < 140 && b.y < p.y - 50 && p.onG && jt <= 0) { c.j = true; jt = 0.5; } return c; }; };

test("gleiche Eingaben, gleiches Spiel; Bot-Zustand reist im Spielzustand (Klon läuft gleich weiter)", () => {
  const a = match({ bots: [2, 3], pus: true }), b = match({ bots: [2, 3], pus: true });
  run(a, 1800); run(b, 1800);
  assert.equal(hashState(a), hashState(b), "zwei Läufe gleich");
  const c = clone(a);
  run(a, 1200); run(c, 1200);
  assert.equal(hashState(a), hashState(c), "Klon (wie beim Rollback) rechnet gleich weiter");
  assert.ok(a.s[0] + a.s[1] > 0, "es fallen Tore");
});

test("ohne o.bots kein Bot im Zustand (klassische Spiele unverändert)", () => {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, seed: 7 });
  assert.equal(st.bot, undefined);
});

test("Ball fliegt auf den Bot zu: er trifft fast immer, nie ins eigene Tor", () => {
  let hit = 0, n = 0, own = 0;
  for (const y of [600, 520, 440, 380]) for (const vx of [700, 1100, 1500]) for (const vy of [-300, 0, 200]) {
    const st = match(); st.ph = "play"; st.pt = 0; st.p[0].x = 150; st.p[1].x = 1250;
    Object.assign(st.b, { x: 700, y, vx, vy, lt: 0 });   // Schuss des Gegners (nicht der Anstoß)
    const evs = run(st, 300);
    n++; if (evs.some(e => (e.t === "head" || e.t === "kick") && e.i === 1)) hit++;
    if (evs.some(e => e.t === "goal" && e.i === 0)) own++;
  }
  assert.ok(hit >= n - 2, `Treffer ${hit}/${n}`);
  assert.equal(own, 0, "kein Ball ins eigene Tor");
});

test("Ball rollt aufs eigene Tor zu: der Bot steht davor und klärt ihn nach vorne", () => {
  for (const [bx, vx, y] of [[900, 520, 0], [1000, 700, 0], [800, 900, 120]]) {
    const st = match(); st.ph = "play"; st.pt = 0; st.p[0].x = 300; st.p[1].x = 1450;
    Object.assign(st.b, { x: bx, y: C.G - st.b.r - y, vx, vy: 0 });
    const evs = run(st, 480);
    assert.ok(!evs.some(e => e.t === "goal" && e.i === 0), `kein Gegentor (Ball von ${bx} mit ${vx})`);
    assert.ok(evs.some(e => (e.t === "kick" || e.t === "head") && e.i === 1), "Bot spielt den Ball");
  }
});

test("Profi knackt den Camper; Leicht bleibt unter Profi", () => {
  const CH = [["kalle", "yuki"], ["tank", "bolt"], ["nala", "rocco"], ["flummi", "max"], ["tina", "magnus"], ["yuki", "kalle"], ["bolt", "tank"], ["rocco", "nala"], ["max", "flummi"], ["magnus", "tina"]];
  let wins = 0, goalsP = 0, goalsL = 0;
  for (let k = 0; k < CH.length; k++) {
    const st = match({ seed: 50 + k, dur: 90, pus: true, chars: CH[k], bots: [null, 3] }), f = camper();
    run(st, 90 * 120 + 1800, f);
    if (st.s[1] > st.s[0]) wins++;
    goalsP += st.s[1] - st.s[0];
    const l = match({ seed: 50 + k, dur: 90, pus: true, chars: CH[k], bots: [null, 0] }), g = camper();
    run(l, 90 * 120 + 1800, g);
    goalsL += l.s[1] - l.s[0];
  }
  // Gegen den Camper (Kopf des Gegners vor seinem Tor als Hindernis, Konter-Risiko nur, wenn er kontern kann) gibt es viele
  // Unentschieden; die Siegzahl ist deshalb locker, die Tordifferenz unten die eigentliche Absicherung
  assert.ok(wins >= 4, `Profi gewinnt ${wins} von ${CH.length} gegen den Camper`);
  assert.ok(goalsP >= 5, `Tordifferenz Profi gegen Camper ${goalsP}`);
  assert.ok(goalsP > goalsL, `Tordifferenz Profi ${goalsP}, Leicht ${goalsL}`);
});

// Renner: läuft zum Ball, schießt, springt bei hohen Bällen
const rusher = () => { let kt = 0, jt = 0; return st => { const p = st.p[0], b = st.b, c = {}; const tx = b.x - 70; if (tx > p.x + 12) c.r = true; else if (tx < p.x - 12) c.l = true; kt -= DT; jt -= DT; if (b.x - p.x > -5 && Math.hypot(b.x - p.x, b.y - p.y) < 150 && kt <= 0) { c.k = true; kt = 0.35; } if (Math.abs(b.x - p.x) < 90 && b.y < p.y - 60 && b.y > p.y - 260 && p.onG && jt <= 0) { c.j = true; jt = 0.6; } return c; }; };

test("Torwart (Training, Stufe Mittel): wehrt Schüsse ab, bleibt vor dem eigenen Tor, rechnet nach dem Klonen gleich", () => {
  const keeper = o => match({ ...o, bots: [null, { level: 1, keeper: true }] });
  assert.equal(keeper().bot[1].keeper, true);
  assert.equal(match().bot[1].keeper, undefined, "normaler Bot ohne Torwart-Merker");
  // Schüsse aufs Tor aus dem Mittelfeld: er kommt fast immer an den Ball, kaum einer geht rein
  let hit = 0, n = 0, goals = 0;
  for (const y of [600, 500, 420]) for (const vx of [900, 1300]) for (const vy of [-250, 0]) {
    const st = keeper(); st.ph = "play"; st.pt = 0; st.p[0].x = 300; st.p[1].x = C.W - 200;
    Object.assign(st.b, { x: C.W - 750, y, vx, vy, lt: 0 });
    const evs = run(st, 240);
    n++; if (evs.some(e => (e.t === "head" || e.t === "kick") && e.i === 1)) hit++;
    if (evs.some(e => e.t === "goal" && e.i === 0)) goals++;
  }
  assert.ok(hit >= n - 2, `Ballkontakte ${hit}/${n}`);
  assert.ok(goals <= 2, `Gegentore ${goals}/${n}`);
  // gegen einen Renner (ohne Supers, die ihn verwirren könnten): nie weiter vor als sein Bereich, auch mit Hindernissen,
  // kleinem Feld und auf Eis (Bremsweg)
  let st;
  for (const rules of [{}, { obs: 1 }, { floor: "ice" }, { field: 0.82, obs: 2 }]) for (const seed of [11, 12, 13]) {
    st = keeper({ seed, dur: 40, rules: { supers: false, ...rules } });
    const f = rusher(), zone = C.W * KEEPER_ZONE;
    let far = 0, ko = 0, touches = 0, drift = false, back = 0;
    for (let k = 0; k < 40 * 120 && st.ph !== "end"; k++) {
      P.step(st, DT, [f(st), {}]);
      touches += st.ev.splice(0).filter(e => (e.t === "kick" || e.t === "head") && e.i === 1).length;
      ko = st.ph === "play" ? ko + DT : 0;
      // (nach dem Anstoß steht er erst weiter vorne; Schubser und Stolpern zählen nicht, auch nicht das Weiterfliegen und
      // Rutschen danach, bis er wieder steht, und eine Sekunde für den Rückweg: in der Luft kann er nicht bremsen, auf Eis kaum)
      const q = st.p[1];
      if (q.knock > 0 || q.stun > 0) { drift = true; back = 1; } else if (drift && q.onG && Math.abs(q.vx) < 60) drift = false;
      else if (!drift && back > 0) back -= DT;
      if (ko > 1.5 && !drift && back <= 0) far = Math.max(far, C.W - q.x);
    }
    const tag = JSON.stringify(rules) + " Seed " + seed;
    assert.ok(far < zone + 12, `${tag}: höchstens ${zone.toFixed(0)} px vor der Wand: ${far.toFixed(0)}`);
    assert.ok(touches >= 2, `${tag}: spielt den Ball weg: ${touches} Berührungen`);
  }
  const c = clone(st);
  run(st, 900); run(c, 900);
  assert.equal(hashState(st), hashState(c), "Klon rechnet gleich weiter");
});

test("Power-ups: Bot tippt sich aus dem Eisblock (Profi schneller als Leicht), fängt mit dem Magnetschuh und schießt", async () => {
  const U = await import("../../js/core/sim/powerups.js");
  const mk = (lv, seed) => { const st = match({ bots: [null, lv], pus: true, seed }); st.ph = "play"; st.pt = 0; st.puT = 999; return st; };
  // Eisblock: eingefroren tippt er im Wechsel (je Druck 0,15 s weniger), Profi etwa 9, Leicht etwa 4 Drücke je Sekunde
  const ice = lv => {
    let sum = 0, taps = 0;
    for (let s = 0; s < 6; s++) {
      const st = mk(lv, 30 + s); st.p[0].x = 300; st.p[1].x = C.W - 400; Object.assign(st.b, { x: 300, y: 300, vx: 0, vy: 0, lt: 0 });
      run(st, 30);
      U.applyPu(st, 0, "ice", 0, 0); st.ev.length = 0;
      let n = 0;
      while (st.p[1].frz > 0 && n < 400) { taps += run(st, 1).filter(e => e.t === "icetap" && e.i === 1).length; n++; }
      sum += n * DT;
    }
    return { t: sum / 6, taps: taps / 6 };
  };
  const easy = ice(0), pro = ice(3);
  // Grenzen relativ zur Dauer des Eisblocks (C.POWERUPS.ice.dur): der Profi befreit sich deutlich schneller als Leicht
  const D = C.POWERUPS.ice.dur;
  assert.ok(pro.t < 0.5 * D + 0.1 && pro.taps >= 4, `Profi frei nach ${pro.t.toFixed(2)} s, ${pro.taps.toFixed(1)} Drücke`);
  assert.ok(easy.t > pro.t + 0.2 && easy.t < 0.8 * D, `Leicht frei nach ${easy.t.toFixed(2)} s`);
  // Magnetschuh: langsame Bälle auf den Bot zu; er fängt viele und lässt sie mit Schuss wieder los (spätestens MAG.hold)
  const { MAG } = await import("../../js/core/bot/brain.js");
  let caught = 0, shots = 0, late = 0, n = 0, mid = null;
  for (const y of [500, 560, 600]) for (const vx of [150, 350]) for (const vy of [-300, -100, 100]) for (const dx of [250, 400]) {
    const st = mk(3, 7); st.p[0].x = 250; st.p[1].x = C.W - 500;
    U.applyPu(st, 1, "magnet", 0, 0); st.ev.length = 0; st.hs = 0;
    Object.assign(st.b, { x: C.W - 500 - dx, y, vx, vy, lt: 0 });
    let at = -1, c = false, s = false;
    // (lange genug, dass auch ein spät gefangener Ball MAG.hold lang gehalten wird: hält der Bot ihn noch, weiter bis zum
    // Loslassen; seit der Bot den Kopf des Gegners vor dem Tor kennt, hält er einen spät, nach 1,9 s, gefangenen Ball
    // länger, weil der Schuss nicht frei an ihm vorbeigeht)
    for (let k = 0; (k < 300 || st.b.stick) && k < 300 + 120 * MAG.hold + 12 && st.ph === "play"; k++) {
      for (const e of run(st, 1)) {
        if (e.t === "magnet" && e.i === 1) { c = true; at = k; }
        if (e.t === "kick" && e.mag && e.i === 1) { s = true; if ((k - at) * DT > MAG.hold + 0.05) late++; }
      }
      if (!mid && st.b.stick) mid = clone(st);
    }
    n++; caught += c; shots += s;
  }
  assert.ok(caught >= n / 3, `gefangen ${caught}/${n}`);
  assert.equal(shots, caught, "jeder gefangene Ball wird mit Schuss losgelassen");
  assert.equal(late, 0, `spätestens nach ${MAG.hold} s`);
  const a = mid, b = clone(mid);
  run(a, 240); run(b, 240);
  assert.equal(hashState(a), hashState(b), "Klon mit festgehaltenem Ball rechnet gleich weiter");
});

test("Bot-Vorhersage der Ballbahn rechnet wie die echte Ballphysik (alle Arenen, Regeln)", async () => {
  const { ballPhysics } = await import("../../js/core/sim/ball.js");
  const W0 = await import("../../js/core/bot/world.js");
  let worst = 0;
  for (const ar of C.ARENAS.map(a => a.id)) for (const rules of [{}, { bounce: 1.4, grav: 0.55 }, { weight: "heavy", floor: "ice" }, { weight: "light", ball: 1.3 }]) {
    for (const [x, y, vx, vy] of [[300, 200, 900, -300], [900, 500, -1400, 400], [1200, 600, 400, 0], [700, 100, -300, 900]]) {
      const st = match({ arena: ar, rules, bots: [null, null] }); st.ph = "play";
      Object.assign(st.b, { x, y, vx, vy, lt: 0 });
      const P1 = W0.ballPath(W0.ballEnv(st), st.b, 0.8, DT);
      for (let k = 0; k < P1.pts.length; k++) {
        ballPhysics(st, DT, true);
        worst = Math.max(worst, Math.hypot(st.b.x - P1.pts[k].x, st.b.y - P1.pts[k].y));
      }
    }
  }
  assert.ok(worst < 0.5, `größte Abweichung ${worst.toFixed(3)} px`);
  // Power-ups: Effet, Schwerelos, Zeitblase, Torwand mit Treffern, Doppelgänger, Portal, Riesentor, Wind,
  // festgehaltener Ball (Magnetschuh). Zeiten laufen unterwegs ab (wie nach jedem Schritt im Spiel), deshalb mit dem
  // echten Ablauf: Spieler weit weg (die Bahn rechnet ohne Spieler), kein Tor-Zählen (Phase cd), Zeiten wie in step
  const U = await import("../../js/core/sim/powerups.js");
  const tail = st => {
    for (const k of ["wall", "bigGoal"]) { st[k][0] = Math.max(0, st[k][0] - DT); st[k][1] = Math.max(0, st[k][1] - DT); }
    if (st.wind.t > 0) st.wind.t = Math.max(0, st.wind.t - DT);
    U.fieldTimers(st, DT);
  };
  const far = st => st.p.forEach(p => { p.y = -5000; });
  const ST = [[300, 200, 900, -300], [900, 500, -1400, 400], [1200, 600, 400, 0], [700, 100, -300, 900], [500, 600, -1500, -100], [C.W - 500, 560, 1500, 0]];
  const PT = [[C.W * 0.3 - 200, C.G - 110, 1000, -150], [C.W * 0.7 + 200, C.G - 110, -1000, -150]];
  const CASES = {
    effet: [st => { st.b.spin = 1; }, ST],
    schwerelos: [st => { st.floatT = 0.4; }, ST],
    zeitblase: [st => { st.slow2 = [0.5, 0.3]; }, ST],
    torwand: [st => { st.wall = [0.6, 5]; st.wallHp = [2, 1]; }, ST],
    doppelgaenger: [st => { st.clone = [{ t: 0.5, hp: 2 }, { t: 6, hp: 1 }]; }, ST],
    // eben berührt (Klemm-Regel b.tch) und laufende Sperrzeit zwischen zwei Treffern
    klemme: [st => { st.b.tch = 0; st.wall = [5, 0]; st.wallHp = [1, 0]; st.clone = [{ t: 0, hp: 0 }, { t: 6, hp: 1 }]; }, ST],
    sperrzeit: [st => { st.wall = [5, 5]; st.wallHp = [1, 1]; st.wallCD = [0.2, 0]; st.clone = [{ t: 6, hp: 1 }, { t: 6, hp: 1 }]; st.cloneCD = [0, 0.25]; }, ST],
    portal: [st => { U.applyPu(st, st.b.x < C.W / 2 ? 0 : 1, "portal", 0, 0); st.ev.length = 0; }, PT],
    portalAus: [st => { U.applyPu(st, st.b.x < C.W / 2 ? 0 : 1, "portal", 0, 0); st.portal.t = 0.1; st.ev.length = 0; }, PT],
    alles: [st => { st.b.spin = 1; st.floatT = 5; st.slow2 = [0.2, 3]; st.wind = { t: 0.3, dir: -1 }; st.bigGoal = [0.4, 6]; st.wall = [5, 0]; st.wallHp = [1, 0]; st.clone = [{ t: 0, hp: 0 }, { t: 6, hp: 2 }]; }, ST],
  };
  let worstPu = 0, hits = 0;
  for (const ar of C.ARENAS.map(a => a.id)) for (const rules of [{}, { bounce: 1.4, grav: 0.55 }]) for (const [name, [set, starts]] of Object.entries(CASES)) {
    for (const [x, y, vx, vy] of starts) {
      const st = match({ arena: ar, rules, bots: [null, null] }); st.ph = "cd"; far(st);
      Object.assign(st.b, { x, y, vx, vy, lt: 0 });
      set(st);
      const P1 = W0.ballPath(W0.ballEnv(st), st.b, 0.8, DT);
      for (let k = 0; k < P1.pts.length; k++) {
        ballPhysics(st, DT, false); tail(st);
        hits += st.ev.splice(0).filter(e => ["wallcrack", "wallbreak", "clonehit", "clonebreak", "portal"].includes(e.t)).length;
        const d = Math.hypot(st.b.x - P1.pts[k].x, st.b.y - P1.pts[k].y);
        if (d > worstPu) worstPu = d;
        assert.ok(d < 1, `${ar} ${JSON.stringify(rules)} ${name} Start ${x},${y}: nach ${k + 1} Schritten ${d.toFixed(3)} px daneben`);
      }
    }
  }
  assert.ok(hits > 100, `Torwand, Doppelgänger und Portal werden getroffen (${hits})`);
  // festgehaltener Ball: sitzt auf der Schuhspitze, bis die Haltezeit um ist, dann fällt er (Halter steht still)
  for (const ar of C.ARENAS.map(a => a.id)) {
    const st = match({ arena: ar, bots: [null, null] }); st.ph = "cd";
    const p = st.p[0]; st.p[1].y = -5000;
    Object.assign(p, { x: 600, magT: 3, lgS: 2, lgD: 1, lgDir: 1, lgK: true });
    U.pinBall(st.b, p); st.b.stick = { i: 0, t: 0.3 }; st.b.lt = 0;
    const P1 = W0.ballPath(W0.ballEnv(st), st.b, 0.8, DT);
    for (let k = 0; k < P1.pts.length; k++) {
      U.magnetStep(st, p, { k: true }, DT);
      if (!st.b.stick) p.y = -5000;   // losgelassen: Spieler aus dem Weg
      ballPhysics(st, DT, false); tail(st);
      const d = Math.hypot(st.b.x - P1.pts[k].x, st.b.y - P1.pts[k].y);
      if (d > worstPu) worstPu = d;
      assert.ok(d < 1, `${ar} Magnetschuh: nach ${k + 1} Schritten ${d.toFixed(3)} px daneben`);
    }
    assert.equal(P1.pts[30].y, P1.pts[0].y, `${ar}: sitzt still auf dem Schuh`);
    assert.ok(Math.max(...P1.pts.map(q => q.y)) > P1.pts[0].y + 20, `${ar}: fällt nach der Haltezeit`);
  }
  assert.ok(worstPu < 1, `größte Abweichung mit Power-ups ${worstPu.toFixed(3)} px`);
});

test("Magnetschuh im Spiel (Profi gegen Profi): fängt auch im Lauf und im Sprung, hält nie zu lange, schießt nach vorne, kein Eigentor", async () => {
  const U = await import("../../js/core/sim/powerups.js");
  const { MAG } = await import("../../js/core/bot/brain.js");
  const { PU } = await import("../../js/core/sim/tuning.js");
  let catches = 0, moving = 0, air = 0, shots = 0, back = 0, own = 0, maxHold = 0, held = 0, steps = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const st = match({ seed, dur: 40, bots: [3, 3], chars: [["kalle", "yuki"], ["tank", "bolt"], ["nala", "rocco"]][seed % 3] });
    let next = 3, hold = 0;
    const lastMag = [-9, -9];
    while (st.ph !== "end") {
      if (st.ph === "play" && st.el > next) { next = st.el + 4; U.applyPu(st, 0, "magnet", 0, 0); U.applyPu(st, 1, "magnet", 0, 0); }
      P.step(st, DT, [{}, {}]);
      const evs = st.ev.splice(0);
      for (const e of evs) {
        if (e.t === "magnet") { catches++; const p = st.p[e.i]; if (Math.abs(p.vx) > 60) moving++; if (!p.onG) air++; }
        // nach vorne geschossen; schlägt der Gegner im selben Schritt zurück (z. B. sein Superschuss), zählt das nicht
        const hit = evs.some(x => x.i === 1 - e.i && ["kick", "head", "soft", "super", "save"].includes(x.t));
        if (e.t === "kick" && e.mag) { shots++; lastMag[e.i] = st.el; if (st.b.vx * st.p[e.i].dir <= 0 && !hit) back++; }
        if (e.t === "goal" && e.kind === "own" && st.el - lastMag[1 - e.i] < 1.5) own++;
      }
      if (st.b.stick) { hold += DT; held += DT; } else hold = 0;
      maxHold = Math.max(maxHold, hold); steps++;
    }
  }
  assert.ok(catches >= 15, `gefangen ${catches}`);
  assert.ok(moving + air >= 3, `im Lauf ${moving}, im Sprung ${air}`);
  assert.ok(shots >= catches * 0.8, `Magnet-Schüsse ${shots} bei ${catches} Fängen`);
  assert.equal(back, 0, "Loslass-Schuss immer nach vorne");
  assert.equal(own, 0, "kein Eigentor nach dem Loslass-Schuss");
  assert.ok(maxHold <= Math.min(PU.magHold, MAG.hold + 0.1) + 1e-9, `höchstens ${maxHold.toFixed(2)} s am Stück`);
  assert.ok(held / (steps * DT) < 0.15, `Ball nur ${(100 * held / (steps * DT)).toFixed(1)} % der Zeit festgehalten`);
});
