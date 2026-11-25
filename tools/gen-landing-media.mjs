// Bilder und Spielszenen für die Infoseiten (tools/gen-seo.mjs) aus dem echten Spiel: Renderer, Bots, Menüs.
//   1. node tools/gen-landing-media.mjs capture <roh> [video,stills,art,steps] [de,en,…]   Playwright-Browser nötig. Nimmt im Ordner <roh> auf:
//      Gameplay-Bilder je Sprache (frames-<sprache>/ + frames.txt), Kandidaten für Kopfball, Super-Schuss und Tor
//      (cand-<art>-<sprache>-<n>.png), alle Köpfe, Arenen, Modus-Szenen und die Einladungs-Schritte je Sprache mit
//      Freunde-Seite. Sprachen: tools/seo/langs.mjs, sonst nur die genannten.
//   2. Kandidaten ansehen und die besten als scene-head.png, scene-super.png, scene-goal-<sprache>.png ablegen.
//   3. node tools/gen-landing-media.mjs encode <roh>    ImageMagick (magick) und ffmpeg nötig. Schreibt landing/:
//      AVIF + WebP in mehreren Breiten, Gameplay-Loop als MP4 (H.264, läuft überall; bei gleicher Qualität kleiner als
//      unser VP9-Versuch) je Sprache.
// Nichts davon läuft in den Tests; die Seiten prüfen nur, dass jede eingebundene Datei existiert.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS as SEO_LANGS } from "./seo/langs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "landing");
const SAVE_KEY = "kopfball-duell-save-v2";
/** Sprachen der Infoseiten; sprachneutrale Bilder (Kopfball, Super-Schuss, Köpfe, Arenen, Modi) kommen aus NEUTRAL */
const LANGS = SEO_LANGS.map(D => D.lang), MEDIA = Object.fromEntries(SEO_LANGS.map(D => [D.lang, D.media]));
const WITH_STEPS = SEO_LANGS.filter(D => D.pages.friends).map(D => D.lang);
const NEUTRAL = "de";
/** Gameplay-Loop: Ausschnitt aus der 1920x1080-Aufnahme (B:H:X:Y) und Größe des Videos */
const VIDEO_CROP = "1920:800:0:280";
export const VIDEO = [1600, 666];
/** Breiten je Bildart (px). Das größte Bild ist höchstens so breit wie die Aufnahme */
export const SIZES = { scene: [640, 1024, 1600], poster: [640, 960, 1600], heads: [640, 1024, 1600], arena: [480, 800], mode: [400, 640], step: [480, 800, 1280] };

// Bildwiederholung anhalten (für scharfe Standbilder genau im Moment eines Ereignisses) und Ereignisse beobachten
const FREEZE = `(() => {
  const raf = window.requestAnimationFrame.bind(window); let held = [];
  window.__hold = false; window.__want = null; window.__caught = 0;
  window.requestAnimationFrame = cb => { if (window.__hold) { held.push(cb); return 0; } return raf(cb); };
  window.__release = () => { window.__hold = false; const h = held; held = []; h.forEach(cb => raf(cb)); };
  let last = null, pend = 0;
  const tick = now => {
    const st = window.__kd && window.__kd.st;
    if (st && st.stats) {
      const c = { heads: st.stats[0].heads + st.stats[1].heads, supers: st.stats[0].supers + st.stats[1].supers, goals: st.s[0] + st.s[1] };
      const w = window.__want;
      if (w && last && !pend && !window.__hold && c[w.kind] > last[w.kind]) pend = now + w.delay;
      last = c;
      if (pend && now >= pend) { pend = 0; window.__hold = true; window.__caught++; }
    }
    raf(tick);
  };
  raf(tick);
})();`;
const HIDE_UI = "body > :not(#cv) { visibility: hidden !important; } #cv { filter: none !important; transform: none !important; }";

async function capture(raw, parts = ["video", "stills", "art", "steps"], langs = LANGS) {
  for (const l of langs) if (!MEDIA[l]) throw new Error("Sprache fehlt in tools/seo/langs.mjs: " + l);
  const { chromium } = await import("playwright");
  const { serve } = await import("./serve.mjs");
  mkdirSync(raw, { recursive: true });
  const { server, url } = await serve(0);
  const browser = await chromium.launch();
  const today = new Date().toISOString().slice(0, 10);
  const open = async (lang, view, { mock = false } = {}) => {
    const ctx = await browser.newContext({ locale: MEDIA[lang].locale, ...view });
    await ctx.route("**/vendor/peerjs.min.js", r => r.fulfill({ body: "", contentType: "text/javascript" }));
    if (mock) await ctx.addInitScript({ path: join(ROOT, "tests/e2e/mockpeer.js") });
    await ctx.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [SAVE_KEY, JSON.stringify({ tutorial: true, daily: { last: today, streak: 1 } })]);
    await ctx.addInitScript(FREEZE);
    const page = await ctx.newPage();
    await page.goto(`${url}/index.html?lang=${lang}`);
    await page.waitForSelector("#loading.done", { state: "attached", timeout: 20000 });
    await page.waitForTimeout(500);
    return { ctx, page };
  };
  const png = (page, file, dataUrl) => writeFileSync(join(raw, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  // Spiel Bot gegen Bot (starke Stufe), ohne Ende, Oberfläche ausgeblendet
  const botMatch = async page => {
    await page.click("#btnPlay"); await page.waitForTimeout(300);
    await page.click("#btnKickoff"); await page.waitForTimeout(200);
    await page.evaluate(async () => {
      const { makeBrain } = await import("/js/core/bot/brain.js");
      const st = window.__kd.st; st.bot = [makeBrain(0, 3, st.rng), makeBrain(1, 3, st.rng ^ 77)]; st.t = 900; st.rules.win = 0; st.golden = false;
    });
    await page.addStyleTag({ content: HIDE_UI });
    await page.waitForTimeout(3600);   // Countdown vorbei
  };

  // 1. Gameplay-Loop: Bildfolge über das DevTools-Protokoll (schärfer als die Playwright-Videoaufnahme)
  for (const lang of parts.includes("video") ? langs : []) {
    const { ctx, page } = await open(lang, { viewport: { width: 1920, height: 1080 } });
    await botMatch(page);
    const dir = join(raw, "frames-" + lang); mkdirSync(dir, { recursive: true });
    const cdp = await ctx.newCDPSession(page), frames = [];
    cdp.on("Page.screencastFrame", f => { frames.push({ data: f.data, ts: f.metadata.timestamp }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    await page.waitForTimeout(13000);
    await cdp.send("Page.stopScreencast");
    frames.sort((x, y) => x.ts - y.ts);   // das Protokoll liefert gelegentlich ein Bild zu spät
    const list = frames.map((f, i) => { const n = `f${String(i).padStart(5, "0")}.jpg`; writeFileSync(join(dir, n), Buffer.from(f.data, "base64")); return `file '${n}'\nduration ${Math.max(0.001, (frames[i + 1] || f).ts - f.ts || 1 / 30).toFixed(4)}`; });
    writeFileSync(join(dir, "frames.txt"), "ffconcat version 1.0\n" + list.join("\n") + "\n");
    console.log(`Gameplay ${lang}: ${frames.length} Bilder in ${(frames.at(-1).ts - frames[0].ts).toFixed(1)} s`);
    await ctx.close();
  }
  // 2. Kandidaten für Standbilder (dpr 2): Kopfball und Super-Schuss (kurz danach), Tor (Jubel, Text je Sprache)
  for (const lang of parts.includes("stills") ? langs : []) {
    const { ctx, page } = await open(lang, { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
    await botMatch(page);
    for (const [kind, delay, n] of lang === NEUTRAL ? [["heads", 0, 10], ["supers", 260, 8], ["goals", 450, 4]] : [["goals", 450, 4]]) {
      await page.evaluate(w => { window.__want = w; }, { kind, delay });
      for (let i = 0; i < n; i++) {
        try { await page.waitForFunction(() => window.__hold, null, { timeout: 90000, polling: 50 }); } catch { break; }
        await page.screenshot({ path: join(raw, `cand-${kind}-${lang}-${i}.png`) });
        await page.evaluate(() => window.__release()); await page.waitForTimeout(1200);
      }
      await page.evaluate(() => { window.__want = null; });
    }
    await ctx.close();
  }
  // 3. Köpfe (einzeln und als Gruppe), Arenen, Modus-Szenen
  if (parts.includes("art")) {
    const { ctx, page } = await open(NEUTRAL, { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
    const art = await page.evaluate(async () => {
      const { avatarCanvas, drawHead } = await import("/js/ui/render/art.js");
      const { arenaThumb } = await import("/js/ui/render/render.js");
      const { CHARS, ARENAS } = await import("/js/content/config.js");
      const heads = Object.fromEntries(CHARS.map(c => [c.id, avatarCanvas(c.id, 256).toDataURL("image/png")]));
      // Gruppe: drei Reihen, nach innen schauend, hintere Reihe kleiner
      const W = 2400, H = 1200, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const x = cv.getContext("2d"), ids = CHARS.map(c => c.id), rows = [ids.slice(0, 7), ids.slice(7, 15), ids.slice(15)];
      rows.forEach((row, ri) => {
        const r = [118, 132, 148][ri], y = [330, 610, 900][ri], step = (W - 2 * r - 120) / (row.length - 1);
        row.forEach((id, k) => { const hx = 60 + r + k * step; drawHead(x, id, hx, y, r, { dir: hx < W / 2 ? 1 : -1, mood: "", t: 1 }); });
      });
      const arenas = Object.fromEntries(ARENAS.map(a => [a.id, arenaThumb(a.id, 800, 450).toDataURL("image/png")]));
      return { heads, group: cv.toDataURL("image/png"), arenas };
    });
    for (const [id, d] of Object.entries(art.heads)) png(page, `head-${id}.png`, d);
    png(page, "heads-group.png", art.group);
    for (const [id, d] of Object.entries(art.arenas)) png(page, `arena-${id}.png`, d);
    // Modus-Szenen wie auf den Kacheln (Verlauf c1 → c2 der Kachel), groß gezeichnet; Server-Modi gibt es lokal nicht im Menü
    const modes = await page.evaluate(async () => {
      const { drawModeScene } = await import("/js/ui/render/modeart.js");
      const { MODES } = await import("/js/content/config.js");
      const d = { you: "kalle", ball: "klassik", opp: "phantom", mate: "nala", tier: "gold", record: 12, day: 16, code: "K7Q2", career: "yuki", daily: "bolt" };
      const out = {};
      for (const m of MODES) {
        const cv = document.createElement("canvas"); cv.style.cssText = "position:fixed;left:0;top:0;width:300px;height:170px"; document.body.append(cv);
        drawModeScene(cv, m.id, d, 2);
        const o = document.createElement("canvas"); o.width = 600; o.height = 340; const x = o.getContext("2d");
        const g = x.createLinearGradient(0, 0, 600 * 0.42, 340); g.addColorStop(0, m.c1); g.addColorStop(1, m.c2);
        x.fillStyle = g; x.fillRect(0, 0, 600, 340); x.drawImage(cv, 0, 0);
        out[m.id] = o.toDataURL("image/png"); cv.remove();
      }
      return out;
    });
    for (const [id, d] of Object.entries(modes)) png(page, `mode-${id}.png`, d);
    await ctx.close();
  }
  // 4. Einladungs-Schritte je Sprache mit Freunde-Seite: Online-Bildschirm, Lobby mit Link und QR-Code, Freund ist da
  for (const lang of parts.includes("steps") ? langs.filter(l => WITH_STEPS.includes(l)) : []) {
    const { ctx, page } = await open(lang, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }, { mock: true });
    await page.evaluate(async n => { const p = await import("/js/app/profile.js"); p.S.name = n; }, MEDIA[lang].host);
    await page.click("#modeCard"); await page.waitForTimeout(300);
    if (await page.isVisible("#modeTabs [data-tab=on]")) { await page.click("#modeTabs [data-tab=on]"); await page.waitForTimeout(300); }
    await page.click("#modeGrid [data-mode=online]"); await page.waitForTimeout(300);
    await page.click("#btnPlay"); await page.waitForTimeout(500);
    await page.screenshot({ path: join(raw, `step-${lang}-1.png`) });
    await page.click("#btnHost"); await page.waitForTimeout(900);
    const code = (await page.textContent("#lobbyCode")).trim();
    // Link und QR-Code so, wie Spieler sie sehen (Adresse der Seite statt des lokalen Testservers)
    const showLive = () => page.evaluate(async c => {
      const live = "https://headstars.app/?join=" + c;
      document.getElementById("lobbyLink").textContent = live;
      (await import("/js/ui/screens/online.js")).makeQR(live);
    }, code);
    await showLive(); await page.waitForTimeout(300);
    await page.screenshot({ path: join(raw, `step-${lang}-2.png`) });
    // Freund mit eigenem Namen (die Seite teilt den Speicher mit dem Gastgeber)
    const g = await ctx.newPage();
    await g.addInitScript(([k, n]) => { const s = JSON.parse(localStorage.getItem(k) || "{}"); s.name = n; s.char = "yuki"; localStorage.setItem(k, JSON.stringify(s)); }, [SAVE_KEY, MEDIA[lang].guest]);
    await g.goto(`${url}/index.html?lang=${lang}&join=${code}`); await g.waitForTimeout(2800);
    await page.waitForTimeout(600); await showLive(); await page.waitForTimeout(300);
    await page.screenshot({ path: join(raw, `step-${lang}-3.png`) });
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log("Aufnahmen in " + raw);   // i18n-ok
}

function encode(raw) {
  mkdirSync(OUT, { recursive: true });
  const magick = (...a) => execFileSync("magick", a, { stdio: "inherit" });
  const img = (src, name, widths, { crop, formats = [["avif", 52], ["webp", 78]] } = {}) => {
    for (const w of widths) for (const [ext, q] of formats) {
      magick(join(raw, src), ...(crop ? ["-gravity", "center", "-crop", crop, "+repage"] : []), "-resize", `${w}x>`, "-strip", "-quality", String(q), join(OUT, `${name}-${w}.${ext}`));
    }
  };
  const has = f => existsSync(join(raw, f));
  if (has("scene-head.png")) img("scene-head.png", "scene-head", SIZES.scene);
  if (has("scene-super.png")) img("scene-super.png", "scene-super", SIZES.scene);
  for (const l of LANGS) if (has(`scene-goal-${l}.png`)) img(`scene-goal-${l}.png`, `scene-goal-${l}`, SIZES.scene);
  if (has("heads-group.png")) img("heads-group.png", "heads-group", SIZES.heads);
  for (const f of readdirSync(raw)) {
    let m;
    if ((m = f.match(/^head-(\w+)\.png$/))) img(f, "head-" + m[1], [256]);
    else if ((m = f.match(/^arena-(\w+)\.png$/))) img(f, "arena-" + m[1], SIZES.arena);
    else if ((m = f.match(/^mode-(\w+)\.png$/))) img(f, "mode-" + m[1], SIZES.mode);
    else if ((m = f.match(/^step-([a-z]{2})-(\d)\.png$/))) img(f, `step-${m[1]}-${m[2]}`, SIZES.step);
  }
  // Gameplay-Loop: 10 s ab Sekunde 1, 30 Bilder/s, ohne Ton, nur das Spielfeld (Himmel und Anzeige oben abgeschnitten,
  // VIDEO_CROP); Standbild (Poster) = erstes Bild
  for (const l of LANGS) {
    const list = join(raw, "frames-" + l, "frames.txt");
    if (!existsSync(list)) continue;
    const ff = (...a) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-ss", "1", "-t", "10", ...a], { stdio: "inherit" });
    const vf = ["-vf", `crop=${VIDEO_CROP},fps=30,scale=${VIDEO[0]}:${VIDEO[1]}:flags=lanczos`, "-an"];
    ff(...vf, "-c:v", "libx264", "-crf", "34", "-preset", "veryslow", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, `gameplay-${l}.mp4`));
    ff("-frames:v", "1", "-vf", `crop=${VIDEO_CROP},scale=${VIDEO[0]}:${VIDEO[1]}`, join(raw, `poster-${l}.png`));
    img(`poster-${l}.png`, `poster-${l}`, SIZES.poster, { formats: [["webp", 78]] });   // Poster nur als WebP: die Seiten binden es ohne <picture> ein
  }
  console.log("landing/ geschrieben");   // i18n-ok
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, dir, only, langs] = process.argv.slice(2);
  if (!dir || !["capture", "encode"].includes(cmd)) { console.error("node tools/gen-landing-media.mjs capture|encode <roh-ordner> [teile] [sprachen]"); process.exit(2); }   // i18n-ok
  if (cmd === "capture") await capture(dir, only ? only.split(",") : undefined, langs ? langs.split(",") : undefined); else encode(dir);
}
