// Admin-Dashboard (admin.html) und Nutzungsstatistik: das Spiel meldet den ersten Besuch, ein Gast bekommt „kein Zugriff“,
// ein Admin sieht Kacheln und Abschnitte (Handy und Desktop, ohne Fehler und ohne seitliches Scrollen), ein Einmal-Link
// schließt ein weiteres Gerät aus. Gegen tools/dev-backend.mjs mit lokaler Postgres-Datenbank; ohne Postgres übersprungen.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, openPage, VIEW, closeAll } from "./lib.mjs";

const hasPg = existsSync("/usr/lib/postgresql") && readdirSync("/usr/lib/postgresql").length > 0;
const DB_SCRIPT = new URL("../../supabase/local/start-db.sh", import.meta.url).pathname;
const SESSION = "kopfball-duell-session-dev";
let env, be, dir, q;

before(async () => {
  if (!hasPg) return;
  dir = mkdtempSync(join(tmpdir(), "kd-e2e-admin-")); chmodSync(dir, 0o777);
  const dbUrl = execFileSync("bash", [DB_SCRIPT, dir, "55443"], { encoding: "utf8" }).trim().split("\n").pop();
  const { startDevBackend } = await import("../../tools/dev-backend.mjs");
  be = await startDevBackend({ dbUrl, port: 0 });
  env = await start();
  q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
});
afterEach(t => closeAll(env, t));
after(async () => {
  if (!hasPg) return;
  await env.close(); await be.close();
  execFileSync("bash", [DB_SCRIPT, "stop", dir]); rmSync(dir, { recursive: true, force: true });
});

const db = async (sql, args = []) => (await be.pool.query(sql, args)).rows;
const until = async (fn, ms = 6000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => { setTimeout(r, 150); }); } };
const sessionOf = page => until(() => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), SESSION));
async function admin(page) {
  await page.goto(env.url + "/admin.html" + q);
  await page.waitForSelector("#app .gate, #app .kpis", { timeout: 10000 });
}

test("Admin-Seite: Gast ohne Zugriff, Admin sieht das Dashboard, Einmal-Link schließt ein Gerät aus", { skip: !hasPg && "kein Postgres" }, async () => {
  // Spiel mit Server: Gast-Konto, erster Besuch und Tagesbesuch kommen beim Server an
  const { page, ctx, errors } = await openPage(env, VIEW.desktop, { query: q + "&src=e2e_test" });
  const sess = await sessionOf(page);
  const id = sess.user.id;
  const fv = await until(async () => (await db("select data from game.events where player_id = $1 and kind = 'first_visit'", [id]))[0]);
  assert.deepEqual(fv && fv.data, { src: "e2e_test", ref: "direct" }, "erster Besuch mit Herkunft");
  assert.ok(await until(async () => (await db("select 1 from game.events where player_id = $1 and kind = 'visit'", [id])).length), "Tagesbesuch");
  assert.deepEqual(errors, [], "Spiel ohne Konsolenfehler");

  // Gast: kein Zugriff
  const adm = await ctx.newPage();
  const admErr = [];
  adm.on("pageerror", e => admErr.push(e.message)); adm.on("console", m => { if (m.type() === "error") admErr.push(m.text()); });
  await admin(adm);
  assert.match(await adm.textContent("#app"), /Kein Zugriff\. Melde dich im Spiel mit deinem gesicherten Konto an\./);

  // gesichertes Konto, aber nicht Admin: kein Zugriff (Server sagt forbidden)
  await db("update auth.users set is_anonymous = false, email = 'owner@example.org' where id = $1", [id]);
  await adm.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.user = { ...s.user, is_anonymous: false, email: "owner@example.org" }; localStorage.setItem(k, JSON.stringify(s)); }, SESSION);
  await admin(adm);
  assert.match(await adm.textContent("#app"), /Kein Zugriff/);
  admErr.length = 0;

  // Admin: Kacheln und Abschnitte, Handy und Desktop
  await db("insert into game.admins (player_id) values ($1)", [id]);
  for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
    await adm.setViewportSize(vp);
    await admin(adm);
    assert.equal(await adm.locator(".kpi").count(), 4, "4 Kacheln");
    const labels = await adm.$$eval(".kpi .lab", els => els.map(e => e.textContent));
    assert.deepEqual(labels, ["Aktive heute", "Neue Spieler", "Wiederkehrer", "Online-Matches"]);
    for (const s of ["#secGrowth", "#secSources", "#secFunnel", "#secModes", "#secOnline", "#secStaff"]) assert.ok(await adm.locator(s).isVisible(), s);
    assert.equal(await adm.locator("#chartActive svg rect[data-i]").count(), 30, "ein Balken je Tag");
    const [sw, w] = await adm.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw <= w, `kein seitliches Scrollen bei ${vp.width} px (${sw})`);
  }
  // der Admin selbst zählt nicht: heute neu angelegt, aber nicht unter „Neue Spieler“
  assert.equal(await adm.textContent(".kpi:nth-child(2) .val"), String((await db(`select count(*)::int n from game.players p where game.berlin_day(p.created_at) = game.berlin_day(now())
    and not game.stat_hidden(p.id)`))[0].n), "Neue ohne Admin");

  // Zeitraum umschalten
  await adm.click('#days [data-d="7"]');
  await adm.waitForFunction(() => document.querySelectorAll("#chartActive svg rect[data-i]").length === 7);

  // Einmal-Link für ein weiteres Gerät
  await adm.click("#staffBtn");
  const url = await (await adm.waitForSelector("#staffUrl")).inputValue();
  assert.match(url, /\/admin\.html#staff=[a-f0-9]{64}$/);
  assert.deepEqual(admErr, [], "Admin-Seite ohne Konsolenfehler");

  // neues Gerät (eigener Browser-Kontext, noch kein Konto): Link öffnen legt einen Gast an und schließt ihn aus
  const ctx2 = await env.browser.newContext({ locale: "de-DE", ...VIEW.portrait });
  env.ctxs.push(ctx2);
  const dev = await ctx2.newPage();
  await dev.goto(url.replace(/^[^#]*/, env.url + "/admin.html" + q));
  await dev.waitForSelector("#app .gate");
  assert.match(await dev.textContent("#app"), /Dieses Gerät zählt ab jetzt nicht mehr in der Statistik\./);
  assert.ok(!(await dev.evaluate(() => location.hash)), "Link aus der Adresszeile entfernt");
  const guest = (await sessionOf(dev)).user.id;
  assert.equal((await db("select count(*)::int n from game.staff where player_id = $1", [guest]))[0].n, 1, "Gerät ist Staff");
  // zweites Mal: Link verbraucht (vorher weg, sonst ändert goto nur den Anker)
  await dev.goto("about:blank");
  await dev.goto(url.replace(/^[^#]*/, env.url + "/admin.html" + q));
  await dev.waitForSelector("#app .gate");
  assert.match(await dev.textContent("#app"), /ungültig, abgelaufen oder schon benutzt/);
});
