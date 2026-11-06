// Erzeugt og.jpg (Vorschaubild für geteilte Links) aus tools/og/index.html mit den echten Köpfen des Spiels.
// node tools/og.mjs [kopf1,kopf2]   (braucht Playwright: PW_MODULE oder das Paket "playwright")
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };
const { chromium } = await import(process.env.PW_MODULE || "playwright");
const srv = createServer((q, r) => {
  const p = join(root, decodeURIComponent(q.url.split("?")[0]));
  if (!p.startsWith(root) || !existsSync(p)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); r.end(readFileSync(p));
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(`http://localhost:${port}/tools/og/index.html?heads=${process.argv[2] || "kalle,nala"}`);
await page.waitForSelector("body[data-ready]", { timeout: 10000 });
await page.locator("#og").screenshot({ path: join(root, "og.jpg"), type: "jpeg", quality: 88 });
await b.close(); srv.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("og.jpg geschrieben");   // i18n-ok
