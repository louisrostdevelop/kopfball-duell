// Torexplosionen nach internationalen Meme-Trends 2025/26 (PLATZHALTER-Grafik, alles mit Canvas gezeichnet).
// Jede Explosion ist eine kleine Szene: start (Partikel, Wackeln, Blitz), back (hinter den Spielern), front (vor allem),
// screen (über dem ganzen Bild, in Bildschirmpixeln). react: kurze Reaktion am Kopf des Gegners (opp) oder des
// Torschützen (me), nur optisch. Beide Spieler sehen alles.
import { G, COL, clamp, rand } from "../../content/config.js";
import { GOALFX_TEXT as TX } from "../../content/cosmetics.js";

const TAU = Math.PI * 2, INK = COL.ink;
const FONT = "'Lilita One', Impact, sans-serif";
const emojiFont = px => `${Math.round(px)}px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'`;
const eo = k => 1 - (1 - clamp(k, 0, 1)) ** 3;
const ob = k => { const x = clamp(k, 0, 1) - 1; return 1 + 2.7 * x ** 3 + 1.7 * x ** 2; };
const fade = (s, d = 0.4) => clamp((s.dur - s.t) / d, 0, 1);

/** Großer Comic-Schriftzug: weißer Rand, dunkle Kontur, Schatten */
export function bigText(ctx, txt, x, y, size, col, rot = 0, sc = 1, font = FONT) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.font = `${size}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.26; ctx.strokeStyle = "#fff"; ctx.strokeText(txt, 0, 0);
  ctx.lineWidth = size * 0.14; ctx.strokeStyle = INK; ctx.strokeText(txt, 0, 0);
  ctx.fillStyle = INK; ctx.fillText(txt, size * 0.05, size * 0.05);
  ctx.fillStyle = col; ctx.fillText(txt, 0, 0);
  ctx.restore();
}
function starPath(ctx, x, y, r, rot, pts = 4, inner = 0.4) {
  ctx.beginPath();
  for (let k = 0; k < pts * 2; k++) { const a = rot + k * Math.PI / pts, rr = k % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function emoji(ctx, ch, x, y, size, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.font = emojiFont(size); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; ctx.fillText(ch, 0, 0); ctx.restore();
}
/** Bildschirm-Ebene: Pixel-Koordinaten */
const screenSize = ctx => [ctx.canvas.width, ctx.canvas.height];

export const GFX = {
  // 6-7: riesige 6 und 7 wippen abwechselnd wie die Handbewegung, 6er und 7er regnen
  "67": {
    dur: 2.6,
    start(s, a) {
      a.shake(12); a.flash("#fff", 0.3);
      for (let i = 0; i < a.n(46); i++) a.P({ type: "glyph", text: i % 2 ? "7" : "6", x: s.x + rand(-30, 30), y: s.y + rand(-30, 30), vx: s.dir * rand(100, 900) + rand(-200, 200), vy: rand(-1150, -300), g: 1500, life: rand(1.4, 2.4), size: rand(24, 42), col: i % 3 ? s.col : COL.gold, rot: rand(0, TAU), vr: rand(-8, 8), drag: 1.1 });
    },
    front(ctx, s) {
      const pop = ob(s.t / 0.35), w = Math.sin(s.t * 8.5), cx = s.x + s.dir * 170, by = G - 250;
      ctx.globalAlpha = fade(s);
      bigText(ctx, "6", cx - 85, by + w * 50, 205, COL.gold, -0.12 + w * 0.1, pop);
      bigText(ctx, "7", cx + 85, by - w * 50, 205, s.col, 0.12 - w * 0.1, pop);
      ctx.globalAlpha = 1;
    },
  },

  // Crashout: das Bild springt wie Glas, rot flackernder Rand, Dampf zischt aus dem Netz
  crash: {
    dur: 2.6,
    start(s, a) {
      a.shake(26); a.flash("#ff2a2a", 0.55);
      s.cracks = Array.from({ length: 11 }, (_, j) => {
        const pts = [[s.x, s.y]]; let ang = j / 11 * TAU + rand(-0.2, 0.2), x = s.x, y = s.y;
        for (let k = 0; k < 7; k++) { ang += rand(-0.5, 0.5); const l = rand(30, 60); x += Math.cos(ang) * l; y += Math.sin(ang) * l; pts.push([x, y]); }
        return pts;
      });
      for (let i = 0; i < a.n(26); i++) { const ang = rand(0, TAU), sp = rand(300, 900); a.P({ type: "shard", x: s.x, y: s.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 200, life: rand(0.8, 1.4), size: rand(6, 12), col: i % 2 ? "#fff" : "#ff8a80", rot: ang, vr: rand(-10, 10), g: 1000, drag: 1.2 }); }
      for (let i = 0; i < a.n(16); i++) a.P({ type: "smoke", x: s.x + rand(-40, 40), y: G - 20, vx: rand(-60, 60) + s.dir * 40, vy: rand(-280, -120), life: rand(1, 1.7), size: rand(14, 24), col: "rgba(255,255,255,.6)", drag: 1 });
    },
    front(ctx, s) {
      const pr = eo(s.t / 0.22);
      ctx.save(); ctx.globalAlpha = fade(s, 0.7); ctx.lineJoin = "round"; ctx.lineCap = "round";
      for (const pass of [[11, INK], [5, "#fff"]]) {
        ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1]; ctx.beginPath();
        for (const c of s.cracks) { const n = Math.max(1, Math.round(pr * (c.length - 1))); ctx.moveTo(c[0][0], c[0][1]); for (let k = 1; k <= n; k++) ctx.lineTo(c[k][0], c[k][1]); }
        ctx.stroke();
      }
      ctx.restore();
      if (s.t > 0.15) { const k = s.t - 0.15; ctx.globalAlpha = fade(s); bigText(ctx, TX.crash, s.x + s.dir * 210, s.y - 120, 58, "#ff3b30", Math.sin(k * 60) * 0.04 * Math.max(0, 1 - k), ob(k / 0.25)); ctx.globalAlpha = 1; }
    },
    screen(ctx, s) {
      if (s.t > 1.5) return;
      const [w, h] = screenSize(ctx), a = (0.3 + 0.14 * Math.sin(s.t * 50)) * (1 - s.t / 1.5);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, "rgba(255,0,0,0)"); g.addColorStop(1, `rgba(255,20,20,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
  },

  // Peak: ein Berg schießt aus dem Boden, Fahne in der Teamfarbe, Schnee staubt
  peak: {
    dur: 3,
    start(s, a) {
      a.shake(16);
      s.ridge = Array.from({ length: 9 }, () => rand(-0.06, 0.06));
      for (let i = 0; i < a.n(22); i++) a.P({ type: "smoke", x: s.x + s.dir * 60 + rand(-210, 210), y: G - 6, vx: rand(-120, 120), vy: rand(-140, -30), life: rand(0.6, 1.1), size: rand(10, 18), col: "rgba(190,170,140,.65)", drag: 2 });
    },
    shape(s) {
      const sink = s.t > s.dur - 0.6 ? eo((s.dur - s.t) / 0.6) : 1;
      return { mx: s.x + s.dir * 60, hw: 210, h: 300 * ob(s.t / 0.5) * sink };
    },
    back(ctx, s, a) {
      const { mx, hw, h } = GFX.peak.shape(s); if (h < 2) return;
      const top = G - h, L = [], R = [];
      for (let k = 0; k <= 8; k++) { const f = k / 8, j = s.ridge[k] * h; L.push([mx - hw + hw * f + j, G - h * f]); R.push([mx + hw - hw * f - j, G - h * f]); }
      ctx.save(); ctx.lineJoin = "round";
      const g = ctx.createLinearGradient(0, top, 0, G); g.addColorStop(0, "#9aa7c4"); g.addColorStop(1, "#4b5670");
      ctx.beginPath(); L.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); [...R].reverse().forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
      // Schneekappe mit Zacken
      const cap = 0.32, cy = top + h * cap;
      ctx.beginPath(); ctx.moveTo(mx - hw * cap, cy);
      for (let k = 1; k <= 6; k++) ctx.lineTo(mx - hw * cap + hw * cap * 2 * k / 6, cy + (k % 2 ? 14 : -4));
      ctx.lineTo(mx, top); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      // Fahne auf dem Gipfel
      const ph = 110 * eo((s.t - 0.35) / 0.3);
      if (ph > 1) {
        ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(mx, top); ctx.lineTo(mx, top - ph); ctx.stroke();
        const wv = Math.sin(s.t * 10) * 8, fx = mx - s.dir * 2, fy = top - ph;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx - s.dir * 38, fy - 8 + wv, fx - s.dir * 76, fy + wv * 0.5);
        ctx.lineTo(fx - s.dir * 76, fy + 40 + wv * 0.5); ctx.quadraticCurveTo(fx - s.dir * 38, fy + 32 + wv, fx, fy + 40); ctx.closePath();
        ctx.fillStyle = s.col; ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
      }
      ctx.restore();
      if (!s.snow && s.t > 0.45) { s.snow = true; for (let i = 0; i < a.n(30); i++) { const ang = rand(Math.PI * 1.05, Math.PI * 1.95); a.P({ type: "dot", x: mx, y: top, vx: Math.cos(ang) * rand(150, 500), vy: Math.sin(ang) * rand(150, 500), g: 500, life: rand(0.7, 1.3), size: rand(3, 6), col: "#fff", drag: 1.5 }); } }
    },
    front(ctx, s) {
      if (s.t < 0.5) return;
      const { mx, h } = GFX.peak.shape(s);
      ctx.globalAlpha = fade(s, 0.5); bigText(ctx, TX.peak, mx, G - h - 175, 78, COL.gold, -0.06, ob((s.t - 0.5) / 0.25)); ctx.globalAlpha = 1;
    },
  },

  // Brainrot-Regen: absurde Dinge fallen vom Himmel und hüpfen, ein wackelndes Gehirn steigt auf
  brainrot: {
    dur: 3.2,
    start(s, a) {
      a.shake(10); a.flash("#fff", 0.25);
      const items = ["🦈", "👟", "☕", "🍌", "🥖", "🧠", "🗿", "🐸", "🍝", "🦆", "🥔", "🛞"];
      for (let i = 0; i < a.n(32); i++) a.P({ type: "emoji", text: items[i % items.length], x: s.x + s.dir * rand(-20, 560), y: rand(-750, -60), vx: rand(-70, 70), vy: rand(0, 220), g: 1300, life: 3.1, size: rand(34, 60), rot: rand(0, TAU), vr: rand(-4, 4) });
    },
    front(ctx, s) {
      const f = fade(s), k = eo(s.t / 0.5), wob = 1 + Math.sin(s.t * 12) * 0.08;
      ctx.globalAlpha = f; emoji(ctx, "🧠", s.x + s.dir * 130, G - 150 - k * 90, 120 * k * wob, Math.sin(s.t * 5) * 0.2); ctx.globalAlpha = 1;
    },
  },

  // Dank 2016: Hitmarker, Lens-Flare, Regenbogen-Pixel, bunte "wow"-Schrift, Sonnenbrille fällt auf den Torschützen
  dank: {
    dur: 2.9,
    react: { me: "shades" },
    start(s, a) {
      a.shake(14); a.flash("#fff", 0.35);
      for (let i = 0; i < a.n(60); i++) { const ang = rand(0, TAU), sp = rand(300, 1000); a.P({ type: "pix", x: s.x, y: s.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 150, g: 600, drag: 1.5, life: rand(0.8, 1.6), size: rand(6, 12), col: `hsl(${(i * 37) % 360},100%,60%)` }); }
      s.hits = Array.from({ length: 7 }, (_, j) => ({ x: s.x + s.dir * rand(20, 380), y: s.y + rand(-160, 120), t0: j * 0.11 }));
      s.words = TX.dank.map((txt, j) => ({ txt, x: s.x + s.dir * rand(140, 420), y: G - rand(180, 380), t0: 0.15 + j * 0.35, col: ["#ff00e6", "#00ffea", "#ffe600"][j], rot: rand(-0.3, 0.3) }));
    },
    front(ctx, s) {
      const f = fade(s), t = s.t;
      // Lens-Flare
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.max(0, 1 - t / 1.6);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 130); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.3, "rgba(255,230,160,.5)"); g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 130, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.ellipse(s.x, s.y, 420, 5, 0, 0, TAU); ctx.fill();
      for (let k = 1; k <= 3; k++) { ctx.fillStyle = `hsla(${k * 90},100%,70%,.25)`; ctx.beginPath(); ctx.arc(s.x + s.dir * k * 110, s.y - k * 30, 14 + k * 9, 0, TAU); ctx.fill(); }
      ctx.restore();
      // Hitmarker
      ctx.save(); ctx.lineCap = "square";
      for (const h of s.hits) {
        const k = t - h.t0; if (k < 0 || k > 0.35) continue;
        const sc = 1.5 - k * 2;
        for (const [w, c] of [[7, INK], [3.5, "#fff"]]) {
          ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath();
          for (const q of [0.25, 0.75, 1.25, 1.75]) { const ang = q * Math.PI; ctx.moveTo(h.x + Math.cos(ang) * 8 * sc, h.y + Math.sin(ang) * 8 * sc); ctx.lineTo(h.x + Math.cos(ang) * 22 * sc, h.y + Math.sin(ang) * 22 * sc); }
          ctx.stroke();
        }
      }
      ctx.restore();
      // "wow" in bunter Comic-Schrift
      for (const w of s.words) {
        const k = t - w.t0; if (k < 0) continue;
        ctx.save(); ctx.globalAlpha = f; ctx.translate(w.x, w.y); ctx.rotate(w.rot); const sc = ob(k / 0.2); ctx.scale(sc, sc);
        ctx.font = "56px 'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Lilita One', cursive"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
        ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(w.txt, 0, 0); ctx.fillStyle = w.col; ctx.fillText(w.txt, 0, 0);
        ctx.restore();
      }
    },
    screen(ctx, s) {
      if (s.t > 1.6) return;
      const [w, h] = screenSize(ctx);
      ctx.save(); ctx.globalCompositeOperation = "overlay"; ctx.fillStyle = `hsla(${(s.t * 420) % 360},100%,50%,${0.3 * (1 - s.t / 1.6)})`; ctx.fillRect(0, 0, w, h); ctx.restore();
    },
  },

  // K.O.: Boxhandschuh an einer Feder schießt aus dem Netz Richtung Gegner, Comic-Stern, Gegner sieht Sterne
  ko: {
    dur: 2.6,
    react: { opp: "ko" },
    start(s, a) { a.shake(8); s.gy = Math.min(s.y, G - 110); s.a = a; },
    ext(t) {
      if (t < 0.18) return eo(t / 0.18);
      if (t < 1.5) return 1 + Math.sin((t - 0.18) * 25) * 0.05 * Math.exp(-(t - 0.18) * 4);
      return t < 1.9 ? 1 - eo((t - 1.5) / 0.4) : 0;
    },
    front(ctx, s) {
      const e = GFX.ko.ext(s.t); if (e <= 0.01) return;
      const L = 430, gx = s.x + s.dir * L * e, gy = s.gy, bx = gx - s.dir * 34;
      if (!s.hit && s.t >= 0.18) {
        s.hit = true; s.a.shake(22); s.a.flash("#fff", 0.3);
        for (let i = 0; i < s.a.n(14); i++) { const ang = rand(0, TAU), sp = rand(200, 600); s.a.P({ type: "star", x: gx + s.dir * 40, y: gy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 100, life: rand(0.5, 0.9), size: rand(7, 13), col: COL.gold, vr: rand(-8, 8), g: 600, drag: 2 }); }
      }
      ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
      // Feder
      const n = 14, amp = 14;
      for (const [w, c] of [[7, INK], [3.5, "#c9ced8"]]) {
        ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(s.x, gy);
        for (let k = 1; k < n; k++) ctx.lineTo(s.x + (bx - s.x) * k / n, gy + (k % 2 ? -amp : amp));
        ctx.lineTo(bx, gy); ctx.stroke();
      }
      // Stulpe und Handschuh
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.rect(bx - (s.dir > 0 ? 18 : 0), gy - 28, 18, 56); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e8302a"; ctx.beginPath(); ctx.ellipse(gx, gy, 46, 38, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(gx - s.dir * 6, gy + 26, 22, 14, s.dir * 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(gx + s.dir * 8, gy - 18, 18, 8, -0.3 * s.dir, 0, TAU); ctx.fill();
      ctx.restore();
      // Comic-Stern "K.O."
      if (s.t >= 0.18 && s.t < 1.7) {
        const k = s.t - 0.18, sc = ob(k / 0.2), cx = gx + s.dir * 70, cy = gy - 70;
        ctx.save(); ctx.globalAlpha = clamp((1.7 - s.t) / 0.3, 0, 1); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.rotate(-0.12 * s.dir);
        starPath(ctx, 0, 0, 78, 0, 12, 0.72); ctx.fillStyle = "#ffe14a"; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = clamp((1.7 - s.t) / 0.3, 0, 1); bigText(ctx, TX.ko, cx, cy, 52, "#e8302a", -0.12 * s.dir, sc); ctx.globalAlpha = 1;
      }
    },
  },

  // Aura +1000: goldene Lichtsäule, Zähler bis +1000 AURA, Sonnenbrillen schweben, Gegner wird grau
  aura: {
    dur: 3.4,
    react: { opp: "grey", me: "shades" },
    start(s, a) {
      a.shake(10); a.flash(COL.gold, 0.4);
      for (let i = 0; i < a.n(8); i++) a.P({ type: "emoji", text: "🕶️", x: s.x + s.dir * rand(0, 160), y: G - rand(40, 260), vx: rand(-40, 40), vy: rand(-120, -50), g: -20, life: 2.2, size: rand(26, 40), rot: rand(-0.4, 0.4), vr: rand(-1, 1), float: true });
      s.a = a;
    },
    back(ctx, s) {
      const f = fade(s, 0.6), w = 150 * eo(s.t / 0.3) * f, x = s.x + s.dir * 50;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, "rgba(255,200,60,0)"); g.addColorStop(0.35, "rgba(255,200,60,.55)"); g.addColorStop(0.5, "rgba(255,250,220,.95)"); g.addColorStop(0.65, "rgba(255,200,60,.55)"); g.addColorStop(1, "rgba(255,200,60,0)");
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(s.t * 30); ctx.fillStyle = g; ctx.fillRect(x - w, -400, w * 2, G + 400);
      for (let k = 0; k < 3; k++) { const ph = (s.t * 0.9 + k / 3) % 1; ctx.globalAlpha = (1 - ph) * f; ctx.strokeStyle = COL.gold; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(x, G - 2, 40 + ph * 260, (40 + ph * 260) * 0.16, 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
      if (s.t < s.dur - 0.6 && Math.random() < 0.7) s.a.P({ type: "dot", x: x + rand(-w * 0.8, w * 0.8), y: G - rand(0, 40), vx: rand(-20, 20), vy: rand(-520, -300), life: rand(0.6, 1), size: rand(2, 4), col: "#fff3c0", add: true });
    },
    front(ctx, s) {
      if (s.t < 0.2) return;
      const n = Math.round(eo((s.t - 0.2) / 1.3) * 1000), bump = s.t > 1.5 && s.t < 1.75 ? 1 + 0.25 * Math.sin((s.t - 1.5) / 0.25 * Math.PI) : 1;
      ctx.globalAlpha = fade(s); bigText(ctx, `+${n} ${TX.aura}`, s.x + s.dir * 230, G - 340, 62, COL.gold, -0.05 * s.dir, ob((s.t - 0.2) / 0.25) * bump); ctx.globalAlpha = 1;
    },
  },

  // AI-Slop-Glitch: Bild zerfällt in verschobene Streifen, Farbbalken, ein falsch geschriebenes, schmelzendes "GOAOOL"
  glitch: {
    dur: 3,
    react: { opp: "glitch" },
    start(s, a) {
      a.shake(16); a.flash("#ff00d4", 0.3);
      const cols = ["#ff00d4", "#00f0ff", "#b6ff00", "#fff"];
      for (let i = 0; i < a.n(50); i++) { const ang = rand(0, TAU), sp = rand(200, 900); a.P({ type: "pix", x: s.x, y: s.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 2, life: rand(0.6, 1.4), size: rand(6, 14), col: cols[i % 4] }); }
      s.q = a.n(10) >= 10;
    },
    front(ctx, s) {
      const words = TX.glitch, word = words[Math.floor(s.t * 4) % words.length];
      const cx = s.x + s.dir * 240, cy = G - 300, sp = 60, x0 = cx - (word.length - 1) * sp / 2;
      ctx.save(); ctx.globalAlpha = fade(s); ctx.font = `80px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      [...word].forEach((ch, j) => {
        const melt = Math.max(0, s.t - 0.7) * (0.15 + ((j * 37) % 5) * 0.06), x = x0 + j * sp + (Math.random() < 0.1 ? rand(-8, 8) : 0), y = cy + Math.sin(s.t * 6 + j) * 10 + melt * 60;
        ctx.save(); ctx.translate(x, y); ctx.scale(1 - melt * 0.25, 1 + melt);
        ctx.fillStyle = "rgba(255,0,212,.8)"; ctx.fillText(ch, -5, 0); ctx.fillStyle = "rgba(0,240,255,.8)"; ctx.fillText(ch, 5, 0);
        ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.strokeText(ch, 0, 0); ctx.fillStyle = "#fff"; ctx.fillText(ch, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    },
    screen(ctx, s) {
      if (s.t > 2.3) return;
      const [w, h] = screenSize(ctx), k = 1 - s.t / 2.3;
      // Streifen des fertigen Bildes verschieben
      for (let i = 0; i < (s.q ? 10 : 5); i++) {
        const sh = Math.round(rand(6, 40) * (w / 900)), sy = Math.round(rand(0, h - sh)), dx = Math.round(rand(-50, 50) * k * (w / 900));
        ctx.drawImage(ctx.canvas, 0, sy, w, sh, dx, sy, w, sh);
      }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? `rgba(0,240,255,${0.25 * k})` : `rgba(255,0,212,${0.25 * k})`; ctx.fillRect(0, rand(0, h), w, rand(4, 26) * (w / 900)); }
      ctx.restore();
      if (s.q) { ctx.fillStyle = `rgba(0,0,0,${0.12 * k})`; const step = Math.max(3, Math.round(h / 180)); for (let y = 0; y < h; y += step * 2) ctx.fillRect(0, y, w, step); }
    },
  },
};

// ---------- Reaktionen am Kopf (nur optisch, gleiche Form wie die Figur-Emotes in render.js) ----------
function pixelShades(ctx, x, y, r, dir) {
  const fx = x + dir * r * 0.14, ey = y - r * 0.02, px = r * 0.09;
  // 2016-Sonnenbrille aus Pixeln: Bügel und zwei Gläser mit Glanz-Pixeln
  ctx.fillStyle = INK;
  ctx.fillRect(fx - px * 7, ey - px * 2, px * 14, px);
  for (const s of [-1, 1]) {
    const ex = fx + s * r * 0.27 - px * 2.5;
    ctx.fillRect(ex, ey - px, px * 5, px * 2); ctx.fillRect(ex + px, ey + px, px * 3, px);
  }
  ctx.fillStyle = "#fff";
  for (const s of [-1, 1]) ctx.fillRect(fx + s * r * 0.27 - px * 1.5, ey - px, px, px);
}
export const REACT = {
  grey: (p, r, k, e) => ({ mood: "sad", face: ctx => { ctx.globalAlpha = 0.6 * e; ctx.fillStyle = "#8d8d99"; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.02, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } }),
  ko: (p, r, k, e) => ({
    rot: -p.dir * 0.35 * e * Math.min(1, k * 8), mood: "sad",
    front: ctx => { for (let j = 0; j < 3; j++) { const a = k * 6 + j * TAU / 3; starPath(ctx, p.x + Math.cos(a) * r * 0.8, p.y - r * 1.15 + Math.sin(a) * 8, 8, a); ctx.globalAlpha = e; ctx.fillStyle = COL.gold; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1; } },
  }),
  glitch: (p, r, k, e) => ({
    dx: Math.random() < 0.3 ? rand(-7, 7) * e : 0,
    face: ctx => { ctx.globalAlpha = 0.7 * e; for (let j = 0; j < 3; j++) { ctx.fillStyle = j % 2 ? "#00f0ff" : "#ff00d4"; ctx.fillRect(p.x - r * 1.1 + rand(-6, 6), p.y + rand(-r, r), r * 2.2, rand(3, 9)); } ctx.globalAlpha = 1; },
  }),
  shades: (p, r, k) => ({ face: ctx => pixelShades(ctx, p.x, p.y - (1 - eo(k / 0.7)) * 110, r, p.dir) }),
};
export const REACT_DUR = 2.4;
