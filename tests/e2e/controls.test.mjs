// Steuerung im echten Browser: Tastatur (allein und zu zweit) und Handy-Touch (Lauf-Feld links, Schuss rechts)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, quickMatch, logEvents, takeEvents, pointer, center, measureJump, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

const tap = async (page, key, ms = 60) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

test("Tastatur allein", async t => {
  const { page, errors } = await openPage(env, VIEW.desktop);
  await quickMatch(page); await logEvents(page);
  await t.test("S am Boden = Grätsche", async () => { await tap(page, "KeyS"); assert.deepEqual(await takeEvents(page, /^(slide|swing)0$/), ["slide0"]); });
  await page.waitForTimeout(600);
  await t.test("W halten, dann S = Sprung und Bombe", async () => {
    await page.keyboard.down("KeyW"); await page.waitForTimeout(320); await tap(page, "KeyS", 40); await page.keyboard.up("KeyW");
    assert.deepEqual(await takeEvents(page, /^(jump|bomb)0$/, 500), ["jump0", "bomb0"]);
  });
  await t.test("Leertaste = Schuss", async () => { await tap(page, "Space", 80); assert.deepEqual(await takeEvents(page, /^(swing|slide)0$/), ["swing0"]); });
  await page.waitForTimeout(600);
  await t.test("Pfeiltasten gehen allein auch", async () => {
    await tap(page, "ArrowDown"); assert.deepEqual(await takeEvents(page, /^(slide|swing)0$/), ["slide0"]);
    await page.waitForTimeout(700);
    await tap(page, "Enter", 80); assert.deepEqual(await takeEvents(page, /^(slide|swing)0$/), ["swing0"]);
  });
  await t.test("Bombe auf den Ball = quetschen", async () => {
    await page.evaluate(() => { const st = window.__kd.st, p = st.p[0]; p.x = 700; p.y = 250; p.onG = false; p.vy = 0; st.b.x = 735; st.b.y = 616; st.b.vx = 0; st.b.vy = 0; });
    await tap(page, "KeyS", 40);
    assert.deepEqual(await takeEvents(page, /^(bomb|squash)0$/), ["bomb0", "squash0"]);
  });
  assert.deepEqual(errors, []);
});

test("Tastatur zu zweit: S und Pfeil runter getrennt", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop);
  await click(page, "#modeCard", 200); await click(page, "#modeGrid .mcard:nth-child(4)", 200);
  await click(page, "#btnPlay", 200); await click(page, "#btnSelOk", 200); await click(page, "#btnKickoff", 3400);
  await logEvents(page);
  await tap(page, "ArrowDown"); assert.deepEqual(await takeEvents(page, /^(slide|swing)[01]$/, 200), ["slide1"]);
  await page.waitForTimeout(700);
  await tap(page, "KeyS"); assert.deepEqual(await takeEvents(page, /^(slide|swing)[01]$/, 200), ["slide0"]);
  await tap(page, "Enter"); assert.deepEqual(await takeEvents(page, /^(slide|swing)[01]$/, 200), ["swing1"]);
  assert.deepEqual(errors, []);
});

test("Handy-Touch", async t => {
  const { page, errors } = await openPage(env, VIEW.phone);
  await quickMatch(page); await logEvents(page);
  // Ball weit weg halten, damit Schüsse nur Ausholbewegungen sind
  await page.evaluate(() => setInterval(() => { const s = window.__kd.st; s.b.x = 1300; s.b.y = 150; s.b.vx = 0; s.b.vy = 0; s.p[1].x = 1400; }, 10));
  const ev = () => takeEvents(page, /^(jump|slide|bomb|swing|kick)0$/);
  const [kx, ky] = await center(page, ".tbtn.kck"), [ux, uy] = await center(page, ".tbtn.sup");
  const tz = await page.locator(".tzone").boundingBox(), z = await page.locator(".stickzone").boundingBox();
  const sx = z.x + z.width * 0.4, sy = z.y + z.height * 0.55;
  const P = (sel, type, x, y, id) => pointer(page, sel, type, x, y, id);
  const stick = async (id, pts, dt = 30) => { await P(".stickzone", "pointerdown", sx, sy, id); for (const [a, b] of pts) { await page.waitForTimeout(dt); await P(".stickzone", "pointermove", sx + a, sy + b, id); } };
  const stickUp = (id, [a, b]) => P(".stickzone", "pointerup", sx + a, sy + b, id);

  await t.test("rechts nur Schuss und Super", async () => assert.equal(await page.locator(".tbtn.jmp, .tbtn.dwn").count(), 0));
  await t.test("Blitz-Tipp irgendwo rechts = Schuss", async () => {
    const x = tz.x + tz.width * 0.3, y = tz.y + tz.height * 0.3;
    await page.evaluate(([x, y]) => { const z = document.querySelector(".tzone"); for (const type of ["pointerdown", "pointerup"]) z.dispatchEvent(new PointerEvent(type, { pointerId: 9, clientX: x, clientY: y, bubbles: true, pointerType: "touch" })); }, [x, y]);
    assert.deepEqual(await ev(), ["swing0"]);
  });
  await page.waitForTimeout(400);
  await t.test("Schuss halten, Daumen wackelt = ein Schuss beim Loslassen", async () => {
    await P(".tzone", "pointerdown", kx, ky, 10);
    for (const [a, b] of [[-15, -8], [-28, -14], [-10, 0]]) { await page.waitForTimeout(60); await P(".tzone", "pointermove", kx + a, ky + b, 10); }
    await page.waitForTimeout(100); await P(".tzone", "pointerup", kx - 10, ky, 10);
    assert.deepEqual(await ev(), ["swing0"]);
  });
  await page.waitForTimeout(400);
  await t.test("Super-Taste (leer) schießt nicht", async () => {
    await P(".tzone", "pointerdown", ux, uy, 11); await page.waitForTimeout(70); await P(".tzone", "pointerup", ux, uy, 11);
    assert.deepEqual(await ev(), []);
  });
  await page.waitForTimeout(300);
  await t.test("Laufen mit leicht schrägem Daumen springt nicht", async () => {
    await stick(20, [[20, -5], [45, -18], [60, -30], [60, -36], [55, -28]]); await page.waitForTimeout(100); await stickUp(20, [55, -28]);
    assert.deepEqual(await ev(), []);
  });
  await page.waitForTimeout(300);
  await t.test("Laufen, Daumen rutscht langsam runter: keine Grätsche", async () => {
    await stick(21, [[20, 4], [40, 10], [60, 16], [70, 22], [80, 28], [85, 34], [90, 40]], 50); await stickUp(21, [90, 40]);
    assert.deepEqual(await ev(), []);
  });
  await page.waitForTimeout(500);
  await t.test("runter ziehen = Grätsche", async () => {
    await stick(22, [[5, 25], [6, 50]]); await page.waitForTimeout(60); await stickUp(22, [6, 50]);
    assert.deepEqual(await ev(), ["slide0"]);
  });
  await page.waitForTimeout(700);
  await t.test("hoch, dann runter = Sprung und Bombe", async () => {
    await stick(23, [[0, -55]], 20); await page.waitForTimeout(260);
    await P(".stickzone", "pointermove", sx, sy, 23); await page.waitForTimeout(20); await P(".stickzone", "pointermove", sx, sy + 50, 23);
    await page.waitForTimeout(60); await stickUp(23, [0, 50]);
    assert.deepEqual(await ev(), ["jump0", "bomb0"]);
  });
  await page.waitForTimeout(500);
  await t.test("hoch, Daumen schnell zurück: keine Bombe", async () => {
    await stick(24, [[0, -30], [0, -55]], 16); await page.waitForTimeout(150);
    for (const b of [-30, -5, 15]) { await P(".stickzone", "pointermove", sx, sy + b, 24); await page.waitForTimeout(16); }
    await page.waitForTimeout(300); await stickUp(24, [0, 15]);
    assert.deepEqual(await ev(), ["jump0"]);
  });
  await page.waitForTimeout(600);
  await t.test("kurzer Wisch hoch = halber Sprung", async () => {
    const h = await measureJump(page, async () => { await stick(25, [[0, -50], [0, -10]], 16); await stickUp(25, [0, -10]); await page.waitForTimeout(500); });
    assert.ok(h > 40 && h < 110, "Höhe " + h);
  });
  await page.waitForTimeout(500);
  for (const [name, path] of [["hoch halten = hoher Sprung", [[0, -50]]], ["im Laufen schräg hoch halten = hoher Sprung", [[40, 0], [60, -5], [60, -48]]], ["im Laufen schräg hoch, Daumen rutscht etwas zurück", [[40, 0], [60, -50], [60, -30], [58, -26]]]]) {
    await t.test(name, async () => {
      await page.evaluate(() => { window.__kd.st.p[0].x = 500; });
      const h = await measureJump(page, async () => { await stick(26, path, 40); await page.waitForTimeout(650); });
      await stickUp(26, path[path.length - 1]);
      assert.ok(h >= 150, "Höhe " + h);
      await takeEvents(page, /./, 700);
    });
  }
  await t.test("laufen + Schuss, dann im Laufen Sprung + Schuss", async () => {
    await stick(27, [[50, 0]]); await page.waitForTimeout(100);
    await P(".tzone", "pointerdown", kx, ky, 28); await page.waitForTimeout(80); await P(".tzone", "pointerup", kx, ky, 28); await page.waitForTimeout(100);
    await P(".stickzone", "pointermove", sx + 60, sy - 50, 27); await page.waitForTimeout(150);
    await P(".tzone", "pointerdown", kx, ky, 29); await page.waitForTimeout(60); await P(".tzone", "pointerup", kx, ky, 29);
    await page.waitForTimeout(100); await stickUp(27, [60, -50]);
    assert.deepEqual(await ev(), ["swing0", "jump0", "swing0"]);
  });
  assert.deepEqual(errors, []);
});
