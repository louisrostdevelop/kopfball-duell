// Admin-Dashboard (admin.html) und Nutzungsstatistik: das Spiel meldet den ersten Besuch, ein Gast bekommt „kein Zugriff“,
// ein Admin sieht Kacheln und Abschnitte (Handy und Desktop, ohne Fehler und ohne seitliches Scrollen), ein Einmal-Link
// schließt ein weiteres Gerät aus, Push lässt sich ein- und ausschalten, im Spiel sehen nur Admins den Admin-Knopf.
// Gegen tools/dev-backend.mjs mit lokaler Postgres-Datenbank; ohne Postgres übersprungen.
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

// Gast im Spiel anlegen, dann zum gesicherten Konto mit Admin-Recht machen (Server und gespeicherte Sitzung)
async function newAdmin(view = VIEW.desktop, init = []) {
  const o = await openPage(env, view, { query: q, init });
  const id = (await sessionOf(o.page)).user.id;
  const email = `admin-${id.slice(0, 8)}@example.org`;
  await db("update auth.users set is_anonymous = false, email = $2 where id = $1", [id, email]);
  await db("insert into game.admins (player_id) values ($1) on conflict do nothing", [id]);
  await o.page.evaluate(([k, mail]) => { const s = JSON.parse(localStorage.getItem(k)); s.user = { ...s.user, is_anonymous: false, email: mail }; localStorage.setItem(k, JSON.stringify(s)); }, [SESSION, email]);
  return { ...o, id };
}

// Push-API im Browser nachgebaut: feste https-Adresse und Schlüssel, Erlaubnis schon erteilt. Ob angemeldet, steht im
// Speicher (übersteht Neuladen wie beim echten Browser).
const FAKE_PUSH = () => {
  const SUB = { endpoint: "https://push.example.test/send/e2e-device-1", keys: { p256dh: "B" + "Q".repeat(86), auth: "A".repeat(22) } };
  const mk = () => ({ endpoint: SUB.endpoint, toJSON: () => JSON.parse(JSON.stringify(SUB)), unsubscribe: async () => { localStorage.removeItem("e2e-push"); return true; } });
  if (typeof PushManager === "undefined") return;
  PushManager.prototype.subscribe = async function subscribe(o) { if (!o || !o.userVisibleOnly || !o.applicationServerKey) throw new Error("bad options"); localStorage.setItem("e2e-push", "1"); return mk(); };
  PushManager.prototype.getSubscription = async function getSubscription() { return localStorage.getItem("e2e-push") ? mk() : null; };
  Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
  Notification.requestPermission = async () => "granted";
};

test("Admin-Seite: Push auf diesem Gerät ein- und ausschalten, Arten wählen, Test senden", { skip: !hasPg && "kein Postgres" }, async () => {
  const { page, ctx, id } = await newAdmin(VIEW.desktop, [FAKE_PUSH]);
  await page.close();
  const adm = await ctx.newPage();
  const errs = [];
  adm.on("pageerror", e => errs.push(e.message)); adm.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  const subs = () => db("select endpoint, p256dh, auth, label from game.admin_push_subs where player_id = $1", [id]);
  const open = async () => { await admin(adm); await adm.waitForSelector("#pushToggle", { timeout: 10000 }); };

  await open();
  assert.ok(await adm.locator("#secPush").isVisible(), "Karte da");
  assert.match(await adm.textContent("#pushToggle"), /Auf diesem Gerät einschalten/);
  assert.equal(await adm.textContent("#pushDevices"), "0");
  assert.equal(await adm.isDisabled("#pushTest"), true, "ohne Gerät kein Test");
  assert.match(await adm.textContent("#secPush"), /Höchstens eine Nachricht alle 30 Minuten · 23–8 Uhr Ruhezeit \(Sammelnachricht um 8 Uhr\)/);
  assert.equal(await adm.locator("#secPush input[type=checkbox]").count(), 4);
  assert.deepEqual(await adm.$$eval("#secPush input[data-pref]", els => els.map(e => e.checked)), [true, true, true, true], "ohne Zeile: alles an");

  // einschalten: Zeile am Server, Knopf wechselt
  await adm.click("#pushToggle");
  await adm.waitForFunction(() => /ausschalten/.test(document.getElementById("pushToggle").textContent), null, { timeout: 15000 });
  const rows = await subs();
  assert.equal(rows.length, 1, "ein Gerät am Server");
  assert.equal(rows[0].endpoint, "https://push.example.test/send/e2e-device-1");
  assert.equal(rows[0].auth, "A".repeat(22));
  assert.match(rows[0].label, / · /, "Gerätename");
  assert.equal(await adm.textContent("#pushDevices"), "1");

  // Art ausschalten: gespeichert
  await adm.click('#secPush label:has(input[data-pref="friends"])');
  await adm.waitForSelector("#secPush .sw-ok");
  assert.deepEqual(await db("select online, friends, record, daily from game.admin_push_prefs where player_id = $1", [id]),
    [{ online: true, friends: false, record: true, daily: true }]);

  // neu laden: Schalter und Gerät bleiben
  await open();
  assert.equal(await adm.isChecked('#secPush input[data-pref="friends"]'), false);
  assert.equal(await adm.isChecked('#secPush input[data-pref="online"]'), true);
  assert.match(await adm.textContent("#pushToggle"), /ausschalten/);
  assert.match(await adm.textContent("#pushStatus"), /Bekommt Nachrichten/);

  // Neuzeichnen (Zeitraum wechseln) behält den Stand ohne neue Anfrage
  await adm.click('#days [data-d="7"]');
  await adm.waitForFunction(() => document.querySelectorAll("#chartActive svg rect[data-i]").length === 7);
  assert.equal(await adm.isChecked('#secPush input[data-pref="friends"]'), false, "Schalter nach dem Neuzeichnen");

  // Test senden
  await adm.click("#pushTest");
  await adm.waitForFunction(() => /Gesendet an|ging nicht/.test(document.getElementById("pushTestMsg")?.textContent || ""), null, { timeout: 15000 });
  assert.match(await adm.textContent("#pushTestMsg"), /Gesendet an 1 Gerät\b/);

  // Kein seitliches Scrollen, Handy und Desktop
  for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
    await adm.setViewportSize(vp);
    await adm.waitForTimeout(150);
    const [sw, w] = await adm.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw <= w, `kein seitliches Scrollen bei ${vp.width} px (${sw})`);
  }
  // Zum Spiel: am Handy in der Kopfzeile
  await adm.setViewportSize({ width: 390, height: 844 });
  assert.ok(await adm.locator('.bar a[aria-label="Zum Spiel"]').isVisible(), "Zum Spiel in der Kopfzeile");

  // ausschalten: Zeile weg
  await adm.click("#pushToggle");
  await adm.waitForFunction(() => /einschalten/.test(document.getElementById("pushToggle").textContent), null, { timeout: 15000 });
  assert.equal((await subs()).length, 0, "Gerät am Server entfernt");
  assert.equal(await adm.textContent("#pushDevices"), "0");
  assert.equal(await adm.evaluate(() => localStorage.getItem("e2e-push")), null, "im Browser abgemeldet");
  assert.deepEqual(errs, [], "ohne Konsolenfehler");
});

test("Spiel: Admin-Knopf nur für Admins", { skip: !hasPg && "kein Postgres" }, async () => {
  // Gast: kein Knopf (und keine Frage an den Server)
  const asked = [];
  const g = await openPage(env, VIEW.desktop, { query: q });
  g.page.on("request", r => { if (r.url().includes("/rpc/am_admin")) asked.push(r.url()); });
  await sessionOf(g.page);
  await g.page.reload(); await g.page.waitForSelector("#loading.done", { state: "attached" });
  await g.page.waitForTimeout(800);
  assert.equal(await g.page.isVisible("#btnAdmin"), false, "Gast ohne Knopf");
  assert.equal(asked.length, 0, "Gast fragt nicht");
  // gesichertes Konto ohne Admin-Recht: kein Knopf
  const id = (await sessionOf(g.page)).user.id;
  await db("update auth.users set is_anonymous = false, email = $2 where id = $1", [id, `p-${id.slice(0, 8)}@example.org`]);
  await g.page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.user = { ...s.user, is_anonymous: false, email: "p@example.org" }; localStorage.setItem(k, JSON.stringify(s)); }, SESSION);
  await g.page.reload(); await g.page.waitForSelector("#loading.done", { state: "attached" });
  await until(() => asked.length > 0);
  await g.page.waitForTimeout(400);
  assert.equal(await g.page.isVisible("#btnAdmin"), false, "Spieler ohne Knopf");
  // 400: Tagesbonus schon abgeholt (claim_daily), gehört nicht zu diesem Test
  assert.deepEqual(g.errors.filter(e => !/status of 400/.test(e)), []);

  // Admin: Knopf sichtbar, führt zur Admin-Seite
  const a = await newAdmin(VIEW.portrait);
  await a.page.reload(); await a.page.waitForSelector("#loading.done", { state: "attached" });
  await a.page.waitForSelector("#btnAdmin", { state: "visible", timeout: 8000 });
  assert.equal(await a.page.getAttribute("#btnAdmin", "href"), "admin.html");
  assert.equal(await a.page.getAttribute("#btnAdmin", "aria-label"), "Admin");
  const [sw, w] = await a.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(sw <= w, `Kopfzeile passt (${sw})`);
  const box = await a.page.locator("#btnAdmin").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= w, "Knopf im Bild");
  await a.page.click("#btnAdmin");
  await a.page.waitForURL(/\/admin\.html$/);
  assert.deepEqual(a.errors.filter(e => !/status of 400/.test(e)), []);
});
