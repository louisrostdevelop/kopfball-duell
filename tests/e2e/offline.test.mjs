// Ohne Netz: Nach dem ersten Besuch startet das Spiel aus dem Zwischenspeicher (Service Worker) und spielt gegen den Computer
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

test("Offline starten und spielen", async () => {
  const { page, ctx, errors } = await openPage(env, VIEW.desktop, { query: "?sw=1" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  // warten, bis alles zwischengespeichert ist
  const cached = async () => page.evaluate(async () => { const k = await caches.keys(); return k.length ? (await (await caches.open(k[0])).keys()).length : 0; });
  for (let i = 0; i < 40 && await cached() < 60; i++) await page.waitForTimeout(250);
  assert.ok(await cached() >= 60, "Dateien im Zwischenspeicher: " + await cached());

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("#loading.done", { state: "attached", timeout: 8000 });
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await click(page, "#modeCard"); await click(page, "#modeGrid [data-mode=quick]"); await click(page, "#btnPlay", 400);
  if (await page.locator("#btnSelOk").isVisible()) await click(page, "#btnSelOk", 300);
  if (await page.locator("#btnKickoff").isVisible()) await click(page, "#btnKickoff", 600);
  await page.waitForTimeout(3500);
  assert.equal(await page.evaluate(() => window.__kd.mode), "cpu");
  assert.ok(await page.evaluate(() => window.__kd.st.ph !== "end"));
  assert.deepEqual(errors.filter(e => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e)), []);
});
