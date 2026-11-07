// Sprache: Englisch vom Gerät, Umschalten in den Einstellungen, bleibt nach Neuladen
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

const GERMAN = /\b(Spielen|Köpfe|Aufgaben|Erfolge|Einstellungen|Spieler|Münzen|Heute|Wechseln|Gegner)\b/;

test("Englisch vom Gerät, Wechsel auf Deutsch", async () => {
  const { page, errors } = await openPage(env, { ...VIEW.desktop, locale: "en-US" });
  assert.equal((await page.textContent("#btnPlay")).trim(), "Play");
  assert.equal(await page.getAttribute("html", "lang"), "en");
  const home = await page.evaluate(() => document.getElementById("scr-home").innerText);
  assert.doesNotMatch(home, GERMAN, "kein Deutsch auf dem Startbildschirm: " + home.match(GERMAN));
  await click(page, "#modeCard", 300);
  const modes = await page.evaluate(() => document.getElementById("scr-modes").innerText);
  assert.match(modes, /Quick Match/); assert.doesNotMatch(modes, GERMAN);
  await click(page, "#scr-modes [data-back]");
  for (const [sel, scr] of [["#navShop", "scr-shop"], ["#navTasks", "scr-tasks"], ["#homeStars", "scr-ach"], ["#navChests", "scr-chests"], ["#btnProfile", "scr-profile"], ["#btnSettings", "scr-settings"]]) {
    await click(page, sel, 300);
    const txt = await page.evaluate(id => document.getElementById(id).innerText, scr);
    assert.doesNotMatch(txt, GERMAN, scr + ": " + txt.match(GERMAN));
    if (scr === "scr-settings") for (const tb of ["controls", "info", "general"]) {   // alle Reiter
      await click(page, `#setTabs [data-tab="${tb}"]`, 150);
      const tt = await page.evaluate(() => document.getElementById("scr-settings").innerText);
      assert.doesNotMatch(tt, GERMAN, tb + ": " + tt.match(GERMAN));
    }
    if (scr !== "scr-settings") await click(page, `#${scr} [data-back]`);
  }
  // Umschalten auf Deutsch (Einstellungen sind offen)
  await click(page, "#segLang button:nth-child(2)", 300);   // DE
  assert.equal(await page.getAttribute("html", "lang"), "de");
  await click(page, "#scr-settings [data-back]", 300);
  assert.equal((await page.textContent("#btnPlay")).trim(), "Spielen");
  await page.reload(); await page.waitForSelector("#loading.done", { state: "attached" }); await page.waitForTimeout(300);
  assert.equal((await page.textContent("#btnPlay")).trim(), "Spielen", "bleibt nach Neuladen");
  assert.deepEqual(errors, []);
});
