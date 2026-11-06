// Erzeugt die Marken-Grafiken aus js/ui/brand.js und tools/brand/icon.js (echte Spielgrafik): App-Icons, Apple-Icon,
// Favicon, Schriftzug (icons/wordmark.png) und og.jpg (Vorschau für geteilte Links).
// node tools/brand/build.mjs   (braucht Playwright: PW_MODULE oder das Paket "playwright")
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".woff2": "font/woff2", ".json": "application/json" };
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const srv = createServer((q, r) => {
  const p = join(root, decodeURIComponent(q.url.split("?")[0]));
  if (!p.startsWith(root) || !existsSync(p)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); r.end(readFileSync(p));
}).listen(0);
const b = await chromium.launch();
const errors = [];
const shot = async (sel, out, size, opts = {}) => {
  const page = await b.newPage({ viewport: { width: 1300, height: 2400 }, deviceScaleFactor: size ? size / 512 : 1 });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://localhost:${srv.address().port}/tools/brand/build.html`);
  await page.waitForSelector("body[data-ready]", { timeout: 10000 });
  await page.locator(sel).screenshot({ path: join(root, out), omitBackground: true, ...opts });
  await page.close();
};
await shot("#round", "icons/icon-192.png", 192);
await shot("#round", "icons/icon-512.png", 512);
await shot("#maskable", "icons/icon-maskable-512.png", 512);
await shot("#square", "icons/apple-touch-icon.png", 180);
await shot("#round", "icons/favicon-32.png", 32);
await shot("#word", "icons/wordmark.png", 683);             // 900×300 → 1200×400 (Ladebildschirm, Teilen-Bild)
await shot("#word", "icons/wordmark-mail.png", 341);       // 600×200 als PNG für Mails (viele Mailprogramme zeigen kein WebP)
{ // als WebP: Chromium kann es schreiben, die PNG-Zwischendatei fällt weg
  const page = await b.newPage(), png = readFileSync(join(root, "icons/wordmark.png")).toString("base64");
  const webp = await page.evaluate(async d => { const i = new Image(); i.src = "data:image/png;base64," + d; await i.decode();
    const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; c.getContext("2d").drawImage(i, 0, 0);
    return c.toDataURL("image/webp", 0.92).split(",")[1]; }, png);
  writeFileSync(join(root, "icons/wordmark.webp"), Buffer.from(webp, "base64")); rmSync(join(root, "icons/wordmark.png")); await page.close();
}
await shot("#og", "og.jpg", 0, { type: "jpeg", quality: 90, omitBackground: false });
await b.close(); srv.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Icons und og.jpg geschrieben");   // i18n-ok
