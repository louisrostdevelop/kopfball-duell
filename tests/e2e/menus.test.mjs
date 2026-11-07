// Menüs: Profil mit Konto-Stand, Hinweis-Zahlen nur für Abholbares, Shop springt beim Tab-Wechsel nicht,
// Kisten-Chancen scrollen nur in der Liste, Vollbild-Knopf, Hintergrund in allen Menüs wie auf der Startseite
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

for (const [name, view] of [["Desktop", VIEW.desktop], ["Handy quer", VIEW.phone], ["Handy hoch", VIEW.portrait]]) test(`Menüs (${name})`, async () => {
  const { page, errors } = await openPage(env, view, { save: { coins: 9000, level: 12 } });

  // Hinweis-Zahlen: Aufgaben werden automatisch gutgeschrieben -> keine Zahl ohne Server
  assert.equal(await page.isHidden("#taskBadge"), true, "keine Zahl an Aufgaben, wenn nichts abzuholen ist");

  // Profil: Tipp auf den Namen, Konto-Stand ist sichtbar (ohne Server: Spielstand auf diesem Gerät)
  await click(page, "#btnProfile", 400);
  assert.equal(await page.evaluate(() => window.__kd.screen), "player");
  assert.match(await page.textContent("#pcAcc"), /diesem Gerät/);
  assert.equal(await page.locator("#pcStats .pstat").count(), 6);
  await click(page, "#pcEdit", 200); await page.fill("#pcNameIn", "Louis"); await page.press("#pcNameIn", "Enter"); await page.waitForTimeout(200);
  assert.match(await page.textContent("#pcNameBox"), /Louis/, "Name im Profil geändert");

  // Menü-Hintergrund: Live-Spiel dahinter unscharf, wie auf der Startseite
  assert.match(await page.evaluate(() => getComputedStyle(document.getElementById("cv")).filter), /blur/);

  // Shop: Tagesangebot steht auf jedem Tab, das Raster beginnt immer an derselben Stelle
  await page.evaluate(async () => (await import("/js/ui/nav.js")).showScreen("shop", true)); await page.waitForTimeout(300);
  const tops = [];
  for (const tab of ["chars", "balls", "arenas", "cos"]) { await click(page, `#shopTabs [data-tab="${tab}"]`, 250); tops.push(await page.evaluate(() => Math.round(document.getElementById("shopGrid").getBoundingClientRect().top))); }
  assert.equal(new Set(tops).size, 1, "Raster springt nicht: " + tops.join(", "));
  assert.doesNotMatch(await page.textContent("#scr-shop"), /Kisten gibt es nie/);

  // Kisten-Chancen: eine Karte je Kiste, die Liste scrollt, das Fenster passt auf den Bildschirm
  await page.evaluate(async () => (await import("/js/ui/nav.js")).showScreen("chests", true)); await page.waitForTimeout(300);
  await click(page, "#btnChestOdds", 400);
  assert.equal(await page.locator(".odds .ocard").count(), 4);
  const card = await page.locator("#modalCard").boundingBox(), vh = view.viewport.height;
  assert.ok(card.y >= 0 && card.y + card.height <= vh + 1, `Chancen-Fenster passt: ${Math.round(card.y)}–${Math.round(card.y + card.height)} von ${vh}`);
  await click(page, "#modalOk", 200);

  // Vollbild-Knopf oben rechts auf der Startseite
  await page.evaluate(async () => (await import("/js/ui/nav.js")).showScreen("home", true)); await page.waitForTimeout(200);
  assert.equal(await page.isVisible("#btnFullHome"), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "kein seitliches Scrollen");
  assert.deepEqual(errors, []);
});
