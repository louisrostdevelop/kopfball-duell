// Klickt sich durch alle Menüs und Spielmodi (Desktop und Handy) und prüft, dass nirgends ein Fehler auftritt
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

async function tour(view) {
  const { page, errors } = await openPage(env, view, { save: { coins: 900 } });
  const c = (s, w) => click(page, s, w).catch(e => errors.push("Klick " + s + ": " + e.message.split("\n")[0]));
  await c("#modeCard"); await c("#modeGrid [data-mode=quick]");
  await c("#btnPlay"); await c("#btnRules"); await c("#rulePresets .preset:nth-child(2)"); await c("#btnRulesMore"); await c("#btnRulesDone");
  await c("#scr-setup [data-back]");
  await c("#navHeads"); await c("#charGrid .ccard:nth-child(5)"); await c("#scr-select [data-back]");
  await c("#navShop"); await c("[data-tab=balls]"); await c("#scr-shop [data-back]");
  await c("#navTasks"); await c("#scr-tasks [data-back]");
  await c("#navAch"); await c("#scr-ach [data-back]");
  await c("#btnSettings"); await c("#tglMusic"); await c("#scr-settings [data-back]");
  // Schnelles Spiel bis zum Ende, Revanche, Abbruch
  await c("#btnPlay"); await c("#btnKickoff", 3500);
  await page.keyboard.down("KeyD"); await page.waitForTimeout(400); await page.keyboard.up("KeyD");
  await page.keyboard.down("Space"); await page.waitForTimeout(300); await page.keyboard.up("Space");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200); await c("#btnResume");
  await page.evaluate(() => { const st = window.__kd.st; st.s = [5, 0]; st.t = 0.5;   /* 5:0: ein Gegentor in der letzten halben Sekunde kann nicht mehr zum Golden Goal führen */ });
  // bis zu 10 s (langsame CI-Rechner): fällt gerade ein Tor, läuft erst die Tor-Pause
  await page.waitForFunction(() => window.__kd.screen === "end", null, { timeout: 10000 }).catch(() => {});
  assert.equal(await page.evaluate(() => window.__kd.screen), "end", "Endbildschirm nach Abpfiff");
  await c("#btnEndAgain", 800); await page.keyboard.press("Escape"); await page.waitForTimeout(200); await c("#btnQuit", 600);
  // Cup, Endlos, Tagesaufgabe, Training, Lokal, Online-Seite
  await c("#modeCard"); await c("#modeGrid [data-mode=cup]"); await c("#btnPlay", 400);
  await c("#btnRunNext", 3500); await page.evaluate(() => { const st = window.__kd.st; st.s = [5, 0]; st.t = 0.2; });
  await page.waitForTimeout(3200); await c("#btnEndAgain", 400); await c("#scr-run [data-back]");
  await c("#modeCard"); await c("#modeGrid [data-mode=endless]"); await c("#btnPlay", 400); await c("#btnRunNext", 3500);
  await page.keyboard.press("Escape"); await c("#btnQuit", 500); await c("#scr-run [data-back]");
  await c("#modeCard"); await c("#modeGrid [data-mode=daily]"); await c("#btnPlay", 400); await c("#modalOk", 3500);
  await page.keyboard.press("Escape"); await c("#btnQuit", 500);
  await c("#modeCard"); await c("#modeGrid [data-mode=train]"); await c("#btnPlay", 300); await c("#btnKickoff", 4000);
  await page.keyboard.press("Escape"); await c("#btnQuit", 500);
  await c("#modeCard"); await c("#modeGrid [data-mode=local]"); await c("#btnPlay", 300); await c("#btnSelOk", 300); await c("#btnKickoff", 3500);
  await page.keyboard.press("Escape"); await c("#btnQuit", 500);
  await c("#modeCard"); await c("#modeGrid [data-mode=online]"); await c("#btnPlay", 300); await c("#scr-online [data-back]");
  assert.equal(await page.evaluate(() => window.__kd.screen), "home", "zurück im Hauptmenü");
  assert.deepEqual(errors, []);
}

test("alle Menüs und Modi am Desktop", () => tour(VIEW.desktop));
test("alle Menüs und Modi am Handy", () => tour(VIEW.phone));
