// Hilfen für Browser-Tests: eigener statischer Server, Chromium, Seiten mit vorbereitetem Spielstand
import { serve } from "../../tools/serve.mjs";

async function playwright() {
  try { return await import("playwright"); }
  catch { return await import(process.env.PW_MODULE || "/opt/npm-tools/node_modules/playwright/index.mjs"); }
}

// Tests prüfen deutsche Texte: Browser auf Deutsch (die Sprache kommt sonst vom Gerät)
export const VIEW = {
  desktop: { viewport: { width: 1366, height: 768 }, locale: "de-DE" },
  phone: { viewport: { width: 780, height: 360 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "de-DE" },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "de-DE" },
};

export async function start() {
  const { chromium } = await playwright();
  const { server, url } = await serve(0);
  const browser = await chromium.launch();
  return { browser, url, async close() { await browser.close(); server.close(); } };
}

const today = () => new Date().toISOString().slice(0, 10);
export const SAVE_KEY = "kopfball-duell-save-v2";

// Neue Seite mit Spielstand (Tutorial gesehen, Tagesbonus schon abgeholt, damit kein Dialog stört)
export async function openPage(env, view, { save = {}, init = [], query = "" } = {}) {
  // Weniger Bewegung: Animationen (z. B. Kisten öffnen) laufen kurz, die Tests sind schneller
  const ctx = await env.browser.newContext({ locale: "de-DE", reducedMotion: "reduce", ...view });
  for (const s of init) await ctx.addInitScript(s);
  await ctx.route("**/vendor/peerjs.min.js", r => r.fulfill({ body: "", contentType: "text/javascript" }));
  await ctx.addInitScript(([key, val]) => { if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem(key, val); sessionStorage.setItem("seeded", "1"); } },
    [SAVE_KEY, JSON.stringify({ tutorial: true, daily: { last: today(), streak: 1 }, ...save })]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("Seitenfehler: " + e.message + " " + (e.stack || "").split("\n")[1]));
  page.on("console", m => { if (m.type() === "error") errors.push("Konsole: " + m.text()); });
  await page.goto(env.url + "/index.html" + query);
  await page.waitForSelector("#loading.done", { state: "attached", timeout: 8000 });
  await page.waitForTimeout(300);
  return { page, ctx, errors };
}

// Klickt, schließt vorher einen offenen Dialog
export async function click(page, sel, wait = 250) {
  if (sel !== "#modalOk" && await page.locator("#modal").isVisible()) { await page.click("#modalOk"); await page.waitForTimeout(150); }
  // Kiste vom Level-Up geht über allem auf: abwarten und schließen
  if (!sel.startsWith("#co") && await page.locator("#chestOpen").isVisible()) { await page.locator("#coDone").waitFor({ state: "visible", timeout: 8000 }); await page.click("#coDone"); await page.waitForTimeout(150); }
  await page.click(sel, { timeout: 4000 });
  await page.waitForTimeout(wait);
}

// Schnelles Spiel starten und den Gegner ruhigstellen (steht am eigenen Tor, springt nicht)
export async function quickMatch(page, { calm = true } = {}) {
  await click(page, "#btnPlay", 200);
  await click(page, "#btnKickoff", 3400);
  if (calm) await page.evaluate(() => { window.__kd.ai[1] = { i: 1, keeper: true, d: { react: 9 }, jcd: 99 }; });
}

// Spielereignisse mitschreiben ("jump0", "slide1", ...)
export async function logEvents(page) {
  await page.evaluate(() => {
    window.__evlog = []; const st = window.__kd.st; const push = st.ev.push.bind(st.ev);
    st.ev.push = e => { window.__evlog.push(e.t + (e.i ?? "")); return push(e); };
  });
}
export async function takeEvents(page, re, wait = 450) {
  await page.waitForTimeout(wait);
  const all = await page.evaluate(() => { const l = window.__evlog || []; window.__evlog = []; return l; });
  return all.filter(x => re.test(x));
}

// Zeigerereignis direkt auf ein Element (mehrere Finger über pointerId)
export function pointer(page, sel, type, x, y, id) {
  return page.evaluate(([s, ty, px, py, pid]) => {
    document.querySelector(s).dispatchEvent(new PointerEvent(ty, { pointerId: pid, clientX: px, clientY: py, bubbles: true, pointerType: "touch" }));
  }, [sel, type, x, y, id]);
}
export async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
}

// Höhe des Spielers 0 während fn() messen
export async function measureJump(page, fn) {
  await page.evaluate(() => { const p = window.__kd.st.p[0]; window.__y0 = p.y; window.__ymin = p.y; window.__ht = setInterval(() => { window.__ymin = Math.min(window.__ymin, window.__kd.st.p[0].y); }, 5); });
  await fn();
  return page.evaluate(() => { clearInterval(window.__ht); return Math.round(window.__y0 - window.__ymin); });
}
