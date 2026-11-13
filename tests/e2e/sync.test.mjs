import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, VIEW, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

// Ohne echten Server: ein Platzhalter-Server, dessen Antworten der Test steuert
const plug = page => page.evaluate(async () => {
  const svc = await import("/js/app/services.js"), acc = await import("/js/app/account.js");
  const w = window.__fake = { next: null };
  svc.provide({ server: { state: () => new Promise((ok, no) => { w.next = { ok, no }; }), pending: () => 0 } });
  acc.initAccount();
});
const badge = page => page.evaluate(() => { const b = document.getElementById("pfSync"); return b.hidden ? "hidden" : b.dataset.s; });

test("Profilbild: Ring beim Abgleich, Offline-Symbol mit Erklärung, danach weg; Münzen zählen zum Server-Stand", async () => {
  const { page, errors } = await openPage(env, VIEW.phone, { save: { coins: 150 } });
  assert.equal(await badge(page), "hidden", "ohne Server keine Anzeige");
  await plug(page);
  assert.equal(await badge(page), "syncing");

  await page.evaluate(async () => { const acc = await import("/js/app/account.js"); acc.syncOnStart().catch(() => {}); });
  await page.evaluate(() => window.__fake.next.no(Object.assign(new Error("offline"), { code: "offline" })));
  await page.waitForFunction(() => document.getElementById("pfSync").dataset.s === "offline");
  await page.locator("#pfSync").click();
  await page.waitForSelector(".toast", { state: "visible" });
  assert.match(await page.locator(".toast").last().innerText(), /Offline/);
  assert.equal(await page.evaluate(() => document.getElementById("scr-home").hidden), false, "Tipp öffnet nicht das Profil");

  await page.evaluate(() => window.__fake.next.ok({ coins: 400 }));
  await page.waitForFunction(() => document.getElementById("pfSync").hidden);
  await page.waitForFunction(() => document.querySelector("#homeCoins .coinNum").textContent === "400");
  assert.deepEqual(errors, []);
});
