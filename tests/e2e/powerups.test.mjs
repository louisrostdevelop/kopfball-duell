// Power-ups im echten Browser (Darstellung und Ton): alle 18 im laufenden Spiel über den echten Weg
// einsammeln (Ball trifft Kugel), Banner und Wirkung sichtbar, Folge-Ereignisse (Risse, Splitter, Platzen, Portal,
// Erdbeben, Doppelsprung), Ankündigung und Ablauf der Kugel, Wiederholung mit Feldwirkungen. Keine Konsolenfehler,
// save/restore immer ausgeglichen, Teilchen gedeckelt. Am Handy quer und mit „weniger Bewegung“ ebenso.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, quickMatch, logEvents, takeEvents, VIEW, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

const KEYS = ["fire", "boot", "spin", "goal", "wall", "bubble", "clone", "time", "wings", "head", "magnet", "mini", "ice", "quake", "float", "wind", "super", "portal"];
// Zählt save/restore je Zeichenfläche; zwischen zwei Bildern muss die Tiefe 0 sein
const DEPTH = () => {
  const P = CanvasRenderingContext2D.prototype, sv = P.save, rs = P.restore;
  window.__depth = new WeakMap(); window.__depthBad = 0;
  P.save = function () { window.__depth.set(this, (window.__depth.get(this) || 0) + 1); return sv.call(this); };
  P.restore = function () { window.__depth.set(this, (window.__depth.get(this) || 0) - 1); return rs.call(this); };
  setInterval(() => { const c = document.querySelector("canvas#game, canvas"); const x = c && c.getContext("2d"); if (x && (window.__depth.get(x) || 0) !== 0) window.__depthBad++; }, 37);
};

// Feld, Spieler und Ball in Ruhe (keine Tore, keine alten Wirkungen); nach einem Tor erst den Anstoß abwarten
const reset = async page => { await page.waitForFunction(() => window.__kd.st.ph === "play", null, { timeout: 9000 }); await settle(page); };
const settle = page => page.evaluate(async () => {
  const { resetField, puFields } = await import("/js/core/sim/powerups.js");
  const st = window.__kd.st; resetField(st); st.t = 999; st.puT = 99;
  st.p.forEach((p, i) => Object.assign(p, puFields(), { fireNext: false, miniT: 0, bigT: 0, frz: 0, stun: 0, vx: 0, x: i ? 1080 : 520 }));
  Object.assign(st.b, { x: 800, y: 640 - st.b.r, vx: 0, vy: 0, spin: 0, stick: null, lt: -1, fx: null });
});
// Kugel hinlegen und den Ball von Spieler i hineinschicken
const collect = (page, key, who) => page.evaluate(([k, i]) => {
  const st = window.__kd.st; st.pu.push({ id: st.puId++, k, x: 800, y: 320, t: 3 });
  Object.assign(st.b, { x: 730, y: 350, vx: 900, vy: -300, lt: i, fx: null, spin: 0 });
}, [key, who]);
const calmBall = page => page.evaluate(() => { const b = window.__kd.st.b; Object.assign(b, { x: 800, y: 640 - b.r, vx: 0, vy: 0 }); });
const ball = (page, set) => page.evaluate(o => Object.assign(window.__kd.st.b, o), set);
const banner = page => page.evaluate(async () => (await import("/js/ui/render/powerup-fx.js")).puBannerInfo());
const health = page => page.evaluate(async () => ({ bad: window.__depthBad, n: (await import("/js/ui/render/powerup-fx.js")).puParticles() }));

let W = 0;
async function allEighteen(page, i) {
  W = await page.evaluate(async () => (await import("/js/content/config.js")).W);
  for (const k of KEYS) {
    await reset(page); await page.waitForTimeout(80);
    await collect(page, k, i);
    const got = await takeEvents(page, /^pu\d$/, 250);
    assert.deepEqual(got, ["pu" + i], `${k}: eingesammelt von ${i}`);
    await calmBall(page);
    await page.waitForTimeout(200);
    const bn = await banner(page);
    assert.equal(bn && bn.k, k, `${k}: Banner zeigt das Power-up`);
    // Folge-Ereignisse, damit jede Darstellung einmal läuft
    const me = i, op = 1 - i, dx = i ? 1 : -1;   // eigenes Tor links (Spieler 0) bzw. rechts
    if (k === "wall") {
      for (let n = 0; n < 2; n++) {
        await ball(page, { x: i ? W - 330 : 330, y: 560, vx: dx * 1700, vy: 0, lt: op });
        await page.waitForFunction(([j, hp]) => window.__kd.st.wallHp[j] < hp, [me, 2 - n], { timeout: 3000 });
        await calmBall(page); await page.waitForTimeout(380);   // Sperrzeit der Torwand (PU.hitCD)
      }
      assert.deepEqual(await takeEvents(page, /^wall(crack|break)\d$/, 50), [`wallcrack${me}`, `wallcrack${me}`, `wallbreak${me}`], "Torwand: zwei Risse, dann bricht sie");
    }
    if (k === "clone") {
      await ball(page, { x: i ? W - 420 : 420, y: 560, vx: dx * 1300, vy: 0, lt: op });
      await page.waitForFunction(j => window.__kd.st.clone[j].hp < 2, me, { timeout: 3000 });
      assert.ok((await takeEvents(page, /^clonehit\d$/, 50)).length, "Doppelgänger getroffen");
    }
    if (k === "bubble") { await page.evaluate(async ([j]) => { const { applyPu } = await import("/js/core/sim/powerups.js"); applyPu(window.__kd.st, j, "ice", 800, 320); }, [op]); assert.deepEqual(await takeEvents(page, /^shield\d$/, 150), ["shield" + me], "Schutzblase fängt ab"); }
    if (k === "portal") {
      await page.evaluate(() => { const st = window.__kd.st, pt = st.portal; st.p[0].x = 200; st.p[1].x = 1500; Object.assign(st.b, { x: pt.ax - (pt.i ? -50 : 50), y: pt.ay, vx: pt.i ? -700 : 700, vy: 0 }); });
      await page.waitForFunction(() => !window.__kd.st.portal, null, { timeout: 3000 });
      assert.ok((await takeEvents(page, /^portal\d$/, 50)).length, "Ball durchs Portal");
      await calmBall(page);
    }
    if (k === "ice" && i === 1) {   // Spieler 0 eingefroren: freihämmern bis das Eis springt
      // (langsame Bilder: Eis wieder auf volle Dauer, damit das Hämmern sicher in die Eiszeit fällt)
      const was0 = await page.evaluate(() => { const p = window.__kd.st.p[0], was = p.frz; if (p.iceB) p.frz = 1.5; return JSON.stringify({ frz: was, iceB: p.iceB }); });
      for (let n = 0; n < 4; n++) {   // hämmern (je Taste ein Bild lang gedrückt, damit die Flanke ankommt)
        const key = n % 2 ? "KeyA" : "KeyD"; await page.keyboard.down(key); await page.waitForTimeout(34); await page.keyboard.up(key); await page.waitForTimeout(22);
      }
      // letztes Stück so knapp, dass der nächste Tastendruck das Eis sicher bricht (sonst entscheidet ein Wettlauf
      // zwischen Abtauen und Tippen, ob es bricht oder nur taut)
      await page.evaluate(() => { const p = window.__kd.st.p[0]; if (p.iceB) p.frz = 0.14; });
      await page.keyboard.down("KeyD"); await page.waitForTimeout(34); await page.keyboard.up("KeyD");
      const ev = await takeEvents(page, /^ice(tap|break)0$/, 150);
      assert.ok(ev.includes("icetap0") && ev.includes("icebreak0"), "Eisblock: Tippen und Zerspringen " + ev.join() + " " + was0);
    }
    if (k === "wings" && i === 0) { await page.keyboard.press("KeyW"); await page.waitForTimeout(220); await page.keyboard.press("KeyW"); assert.ok((await takeEvents(page, /^jump0$/, 250)).length >= 2, "Doppelsprung"); }
    if (k === "spin") { await ball(page, { x: 700, y: 380, vx: 600, vy: -500, spin: 1 }); await page.waitForTimeout(200); }
    if (k === "magnet" && i === 0) {
      await page.keyboard.down("Space"); await page.waitForTimeout(260);
      await page.evaluate(async () => { const { shoeGeo } = await import("/js/core/sim/shoe.js"); const st = window.__kd.st, g = shoeGeo(st.p[0]), d = g.hl + g.rs + st.b.r + 2; Object.assign(st.b, { x: g.x + g.ux * d, y: g.y + g.uy * d, vx: 0, vy: 0, lt: 1 }); });
      await page.waitForTimeout(120); await page.keyboard.up("Space");
    }
    await page.waitForTimeout(250);
  }
}

test("Power-ups: alle 18 einsammeln, Wirkungen, Folge-Ereignisse, Kugel-Ablauf, Wiederholung", async () => {
  const { page, errors } = await openPage(env, { ...VIEW.desktop, viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" }, { init: [DEPTH] });
  await quickMatch(page); await logEvents(page);
  await allEighteen(page, 0);
  await allEighteen(page, 1);
  // Kugel: Ankündigung (nicht einsammelbar), Erscheinen, Ablauf mit puGone
  await reset(page);
  await page.evaluate(() => { const st = window.__kd.st; st.pu.push({ id: st.puId++, k: "portal", x: 800, y: 320, t: -0.6 }); Object.assign(st.b, { x: 800, y: 320, vx: 0, vy: 0, lt: 0 }); });
  await page.waitForTimeout(120);
  assert.equal((await takeEvents(page, /^pu\d$/, 0)).length, 0, "angekündigte Kugel ist nicht einsammelbar");
  await calmBall(page);
  await page.evaluate(() => { window.__kd.st.pu[0].t = 9.7; });
  assert.deepEqual(await takeEvents(page, /^puGone$/, 450), ["puGone"], "Kugel läuft ab");
  // Erdbeben gegen einen stehenden Gegner: hüpft hoch
  await reset(page); await page.waitForTimeout(100);
  await page.evaluate(async () => { const { applyPu } = await import("/js/core/sim/powerups.js"); applyPu(window.__kd.st, 0, "quake", 800, 320); });
  assert.deepEqual(await takeEvents(page, /^quake\d$/, 150), ["quake0"]);
  // Wiederholung mit Feldwirkungen (Torwand, Doppelgänger, Zeitblase, Portal, Schwerelos, Effet): Tor schießen
  await reset(page);
  await page.evaluate(async () => {
    const { applyPu } = await import("/js/core/sim/powerups.js"); const st = window.__kd.st;
    for (const k of ["clone", "time", "portal", "float", "spin", "bubble", "boot"]) applyPu(st, 1, k, 800, 320);
    applyPu(st, 0, "wall", 800, 320); applyPu(st, 0, "goal", 800, 320); st.p[1].x = 700;
    Object.assign(st.b, { x: 1300, y: 500, vx: 1400, vy: -100, lt: 0, spin: 1 });
  });
  await page.waitForFunction(() => window.__kd.st.ph === "goal", null, { timeout: 4000 });
  await page.waitForTimeout(3200);   // Wiederholung läuft
  const h = await health(page);
  assert.equal(h.bad, 0, "save/restore zwischen zwei Bildern immer ausgeglichen");
  assert.ok(h.n <= 260, "Teilchen gedeckelt: " + h.n);
  assert.deepEqual(errors, []);
});

test("Power-ups am Handy quer mit weniger Bewegung: Banner unter dem HUD, keine Fehler", async () => {
  const { page, errors } = await openPage(env, VIEW.phone, { init: [DEPTH] });
  await quickMatch(page); await logEvents(page);
  for (const k of ["wall", "quake", "portal", "super", "wind", "float"]) {
    await reset(page); await collect(page, k, 0);
    assert.deepEqual(await takeEvents(page, /^pu\d$/, 250), ["pu0"], k);
    await calmBall(page); await page.waitForTimeout(250);
  }
  // Banner (das letzte: Schwerelos) liegt im Bild, nicht über Pause- und Emote-Knopf
  const geo = await page.evaluate(async () => {
    const { puBannerInfo } = await import("/js/ui/render/powerup-fx.js"), { viewInfo } = await import("/js/ui/render/render.js");
    const b = puBannerInfo(), v = viewInfo(), r = id => document.getElementById(id).getBoundingClientRect();
    const box = b && b.box && { l: b.box.x0 * v.s + v.ox, r: b.box.x1 * v.s + v.ox, t: b.box.y0 * v.s + v.oy, b: b.box.y1 * v.s + v.oy };
    return { box, k: b && b.k, btn: ["btnPause", "btnEmote"].map(r).map(q => ({ l: q.left, r: q.right, t: q.top, b: q.bottom })), w: innerWidth };
  });
  assert.equal(geo.k, "float");
  assert.ok(geo.box.l >= 0 && geo.box.r <= geo.w && geo.box.t >= 0, "Banner im Bild: " + JSON.stringify(geo.box));
  for (const q of geo.btn) assert.ok(geo.box.r < q.l || geo.box.l > q.r || geo.box.t > q.b, "Banner frei von den Knöpfen: " + JSON.stringify([geo.box, q]));
  const h = await health(page);
  assert.equal(h.bad, 0, "save/restore ausgeglichen");
  assert.ok(h.n <= 160, "weniger Teilchen bei weniger Bewegung: " + h.n);
  assert.deepEqual(errors, []);
});

test("Power-ups: Pause hält die Abläufe an, am Spielende blenden Feldwirkungen und Abzeichen aus", async () => {
  const { page, errors } = await openPage(env, { ...VIEW.desktop, viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" }, { init: [DEPTH] });
  await quickMatch(page); await logEvents(page);
  await reset(page);
  await page.evaluate(async () => { const { applyPu } = await import("/js/core/sim/powerups.js"); const st = window.__kd.st; for (const k of ["float", "wind", "fire"]) applyPu(st, 0, k, 800, 320); });
  await takeEvents(page, /^pu\d$/, 50);   // die drei direkt gesetzten
  await collect(page, "bubble", 0);
  assert.deepEqual(await takeEvents(page, /^pu\d$/, 250), ["pu0"]);
  await page.waitForTimeout(150);
  const fx = () => page.evaluate(async () => { const P = await import("/js/ui/render/powerup-fx.js"), b = P.puBannerInfo(); return { n: P.puParticles(), bt: b && b.t, end: P.puEndFade() }; });
  await page.evaluate(async () => (await import("/js/app/game.js")).pause(true));
  await page.waitForTimeout(150);
  const a = await fx(); await page.waitForTimeout(600); const b = await fx();
  assert.ok(a.n > 0, "Teilchen vorhanden: " + a.n);
  assert.deepEqual(b, a, "in der Pause steht alles (Teilchen, Banner)");
  await page.evaluate(async () => (await import("/js/app/game.js")).pause(false));
  await page.waitForTimeout(200);
  assert.equal((await fx()).end, 1);
  await page.evaluate(() => { const st = window.__kd.st; st.s[0] = 1; st.t = 0.2; });   // kein Unentschieden (Golden Goal)
  await page.waitForFunction(() => window.__kd.st.ph === "end", null, { timeout: 4000 });
  await page.waitForTimeout(700);
  assert.equal((await fx()).end, 0, "am Spielende ausgeblendet");
  assert.equal((await health(page)).bad, 0, "save/restore ausgeglichen");
  assert.deepEqual(errors, []);
});
