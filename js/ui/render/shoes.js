// Schuh-Skins (Kosmetik "shoes"): jeder Skin zeichnet seine eigene Form statt des Standard-Ovals aus art.js.
// Gleiche Lage und Größe wie drawShoe (r = SR, Mitte etwa bei dir * 0.35r). Ohne Teamfarbe, rein kosmetisch.
// Koordinaten lokal in Einheiten von r: Spitze zeigt nach +x, Boden bei etwa +0.85, gespiegelt über dir.
// Reihenfolge je Skin: Obermaterial und Details, dann die Sohle darüber (so sitzt alles bündig).
import { INK, circ } from "./paint.js";

function ink(ctx, w) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(); }
function fillInk(ctx, build, fill, w) { build(); ctx.fillStyle = fill; ctx.fill(); ink(ctx, w); }
function lines(ctx, col, w, segs) { ctx.beginPath(); segs.forEach(([a, b, c, d]) => { ctx.moveTo(a, b); ctx.lineTo(c, d); }); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
function clipTo(ctx, build, fn) { ctx.save(); build(); ctx.clip(); fn(); ctx.restore(); }
function grad(ctx, y0, y1, stops) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function hgrad(ctx, x0, x1, stops) { const g = ctx.createLinearGradient(x0, 0, x1, 0); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }

// ---------- Grundformen (alle in Einheiten von 1, vor dem Zeichnen auf r skaliert) ----------
const P = {
  low() { const c = this.c; c.beginPath(); c.moveTo(-1.02, 0.36); c.lineTo(-1.06, -0.2); c.quadraticCurveTo(-1.05, -0.6, -0.78, -0.62); c.quadraticCurveTo(-0.45, -0.42, -0.15, -0.5); c.lineTo(0.05, -0.72); c.quadraticCurveTo(0.2, -0.75, 0.3, -0.55); c.quadraticCurveTo(0.9, -0.3, 1.55, -0.12); c.quadraticCurveTo(1.88, -0.02, 1.82, 0.36); c.closePath(); },
  high() { const c = this.c; c.beginPath(); c.moveTo(-1.0, 0.36); c.lineTo(-1.02, -1.02); c.quadraticCurveTo(-1.0, -1.24, -0.72, -1.22); c.lineTo(-0.18, -1.14); c.quadraticCurveTo(0.04, -1.1, 0.1, -0.9); c.lineTo(0.32, -0.45); c.quadraticCurveTo(0.9, -0.28, 1.55, -0.12); c.quadraticCurveTo(1.88, -0.02, 1.82, 0.36); c.closePath(); },
  boot() { const c = this.c; c.beginPath(); c.moveTo(-0.98, 0.4); c.lineTo(-1.02, -0.18); c.quadraticCurveTo(-1.0, -0.52, -0.72, -0.52); c.quadraticCurveTo(-0.4, -0.36, -0.1, -0.42); c.quadraticCurveTo(0.5, -0.4, 1.3, -0.14); c.quadraticCurveTo(1.95, 0.05, 1.86, 0.4); c.closePath(); },
  sole(top, bot, back, front) { const c = this.c; c.beginPath(); c.roundRect(back ?? -1.12, top, (front ?? 1.92) - (back ?? -1.12), bot - top, (bot - top) * 0.45); },
  studs(y, xs, h) { const c = this.c; c.beginPath(); xs.forEach(x => { c.moveTo(x - 0.1, y); c.lineTo(x + 0.1, y); c.lineTo(x + 0.07, y + h); c.lineTo(x - 0.07, y + h); c.closePath(); }); },
};

// Formen, die Umriss und Füllung gemeinsam nutzen
function CLOG(c) { c.beginPath(); c.moveTo(-1.0, 0.42); c.lineTo(-1.02, -0.18); c.quadraticCurveTo(-0.98, -0.55, -0.6, -0.55); c.lineTo(-0.2, -0.58); c.quadraticCurveTo(0.2, -0.86, 1.0, -0.72); c.quadraticCurveTo(1.98, -0.5, 1.9, 0.42); c.closePath(); }
function SOCK(c) { c.beginPath(); c.moveTo(-0.95, 0.42); c.lineTo(-1.0, -1.0); c.lineTo(-0.32, -1.0); c.lineTo(-0.28, -0.55); c.quadraticCurveTo(0.5, -0.45, 1.4, -0.22); c.quadraticCurveTo(1.86, -0.06, 1.8, 0.42); c.closePath(); }
function FOOT(c) {
  c.beginPath(); c.moveTo(-1.0, 0.4); c.lineTo(-1.02, -0.3); c.quadraticCurveTo(-0.96, -0.6, -0.6, -0.56); c.quadraticCurveTo(-0.2, -0.4, 0.1, -0.48);
  c.quadraticCurveTo(0.6, -0.42, 0.95, -0.3);
  // Zehen als Buckel, der große Zeh vorn ist der höchste
  [[0.95, -0.3, 1.13, -0.2, 0.1], [1.13, -0.2, 1.32, -0.16, 0.12], [1.32, -0.16, 1.52, -0.14, 0.14], [1.52, -0.14, 1.72, -0.16, 0.2]].forEach(([a, b, x, y, h]) => c.quadraticCurveTo((a + x) / 2, Math.min(b, y) - h, x, y));
  c.quadraticCurveTo(1.98, -0.16, 1.9, 0.4); c.closePath();
}

// ---------- Skins ----------
// draw(c, t, lw) zeichnet in lokalen Einheiten; outline() liefert die Gesamtform für den weißen Sticker-Rand
export const SHOE_SKINS = {
  klassiker: {
    outline: s => [() => s.low(), () => s.sole(0.3, 0.85)],
    draw(s, t, lw) {
      const c = s.c;
      fillInk(c, () => s.low(), grad(c, -0.75, 0.4, [[0, "#ffffff"], [1, "#e6e9ef"]]), lw);
      clipTo(c, () => s.low(), () => {
        fillInk(c, () => { c.beginPath(); c.moveTo(-1.1, 0.4); c.lineTo(-1.1, -0.35); c.quadraticCurveTo(-0.6, -0.25, -0.35, 0.4); c.closePath(); }, "#eef0f4", lw * 0.6);
        fillInk(c, () => { c.beginPath(); c.moveTo(1.05, 0.4); c.quadraticCurveTo(1.1, -0.18, 1.55, -0.12); c.quadraticCurveTo(1.95, -0.02, 1.95, 0.4); c.closePath(); }, "#eef0f4", lw * 0.6);
        c.setLineDash([0.05, 0.05]); lines(c, "rgba(10,18,48,.3)", 0.025, [[-0.95, 0.22, 1.7, 0.22]]); c.setLineDash([]);
        c.fillStyle = "rgba(10,18,48,.35)"; [[1.35, 0.02], [1.55, 0.06], [1.45, 0.16], [1.65, 0.2], [1.25, 0.12]].forEach(([x, y]) => { circ(c, x, y, 0.035); c.fill(); });
      });
      clipTo(c, () => s.low(), () => lines(c, "#c9ced8", lw * 0.7, [[0.12, -0.48, 0.3, -0.54], [0.34, -0.38, 0.52, -0.43], [0.56, -0.29, 0.74, -0.33]]));
      s.low(); ink(c, lw);
      fillInk(c, () => s.sole(0.3, 0.85), "#f1ece0", lw);
      lines(c, "rgba(10,18,48,.35)", lw * 0.45, [[-1.05, 0.58, 1.85, 0.58]]);
    },
  },

  chunky: {
    outline: s => [() => s.low(), () => { s.c.beginPath(); s.c.roundRect(-1.18, 0.12, 3.16, 0.86, 0.3); }],
    draw(s, t, lw) {
      const c = s.c, sole = () => { c.beginPath(); c.moveTo(-1.16, 0.22); c.quadraticCurveTo(-0.6, 0.1, 0.1, 0.24); c.quadraticCurveTo(0.9, 0.36, 1.95, 0.2); c.lineTo(1.98, 0.62); c.quadraticCurveTo(1.9, 0.98, 1.4, 0.98); c.lineTo(-0.85, 0.98); c.quadraticCurveTo(-1.2, 0.98, -1.18, 0.62); c.closePath(); };
      fillInk(c, () => s.low(), "#c7ccd6", lw);
      clipTo(c, () => s.low(), () => {
        fillInk(c, () => { c.beginPath(); c.moveTo(0.7, 0.4); c.quadraticCurveTo(1.0, -0.35, 1.95, -0.1); c.lineTo(1.95, 0.4); c.closePath(); }, "#d8c7a8", lw * 0.6);
        fillInk(c, () => { c.beginPath(); c.moveTo(-1.1, -0.5); c.quadraticCurveTo(-0.5, -0.2, -0.35, 0.4); c.lineTo(-1.1, 0.4); c.closePath(); }, "#d8c7a8", lw * 0.6);
        fillInk(c, () => { c.beginPath(); c.moveTo(-0.45, 0.25); c.quadraticCurveTo(0.2, -0.25, 1.1, -0.05); c.lineTo(1.0, 0.12); c.quadraticCurveTo(0.2, -0.05, -0.3, 0.38); c.closePath(); }, "#2b3a67", lw * 0.5);
        c.fillStyle = "rgba(255,255,255,.35)"; for (let x = -0.2; x < 1.0; x += 0.14) for (let y = -0.45; y < 0.0; y += 0.12) { circ(c, x, y, 0.025); c.fill(); }
      });
      clipTo(c, () => s.low(), () => lines(c, "#f4efe6", lw * 0.7, [[0.12, -0.48, 0.3, -0.54], [0.34, -0.38, 0.52, -0.43]]));
      s.low(); ink(c, lw);
      fillInk(c, sole, "#f4efe6", lw);
      clipTo(c, sole, () => {
        c.fillStyle = "#d9cdb8"; c.beginPath(); c.moveTo(-1.2, 0.6); c.quadraticCurveTo(-0.3, 0.45, 0.4, 0.62); c.quadraticCurveTo(1.2, 0.78, 2, 0.55); c.lineTo(2, 1); c.lineTo(-1.2, 1); c.fill();
        c.fillStyle = "#9aa3b5"; c.fillRect(-1.2, 0.86, 3.2, 0.2);
      });
      sole(); ink(c, lw);
    },
  },

  canvas: {
    outline: s => [() => s.high(), () => s.sole(0.3, 0.8)],
    draw(s, t, lw) {
      const c = s.c;
      fillInk(c, () => s.high(), grad(c, -1.2, 0.4, [[0, "#ff4d5a"], [1, "#d62839"]]), lw);
      clipTo(c, () => s.high(), () => {
        fillInk(c, () => { c.beginPath(); c.moveTo(1.0, 0.4); c.quadraticCurveTo(1.15, -0.15, 1.6, -0.12); c.quadraticCurveTo(1.95, -0.02, 1.95, 0.4); c.closePath(); }, "#f7f5ef", lw * 0.6);
        // Schnürung parallel zur Vorderkante, Ösenreihe auf beiden Seiten
        const edge = y => y < -0.9 ? 0.06 : 0.1 + (y + 0.9) / 0.45 * 0.22;
        c.strokeStyle = "#f7f5ef"; c.lineWidth = lw * 0.6; c.beginPath();
        for (let k = 0; k < 5; k++) { const y0 = -1.0 + k * 0.12, y1 = y0 + 0.12; c.moveTo(edge(y0) - 0.34, y0); c.lineTo(edge(y1) - 0.12, y1); c.moveTo(edge(y0) - 0.12, y0); c.lineTo(edge(y1) - 0.34, y1); }
        c.stroke();
        c.fillStyle = INK; for (let k = 0; k < 6; k++) { const y = -1.0 + k * 0.12; circ(c, edge(y) - 0.34, y, 0.028); c.fill(); circ(c, edge(y) - 0.12, y, 0.028); c.fill(); }
      });
      s.high(); ink(c, lw);
      fillInk(c, () => s.sole(0.3, 0.8), "#f7f5ef", lw);
      lines(c, INK, lw * 0.5, [[-1.06, 0.52, 1.86, 0.52]]);
    },
  },

  stollen: {
    outline: s => [() => s.boot(), () => s.sole(0.34, 0.54, -1.05, 1.9), () => s.studs(0.5, [-0.75, -0.25, 0.55, 1.05, 1.5], 0.22)],
    draw(s, t, lw) {
      const c = s.c;
      fillInk(c, () => s.studs(0.5, [-0.75, -0.25, 0.55, 1.05, 1.5], 0.22), "#d9dde6", lw * 0.7);
      fillInk(c, () => s.boot(), grad(c, -0.55, 0.4, [[0, "#3a3f52"], [1, "#14161f"]]), lw);
      clipTo(c, () => s.boot(), () => {
        c.strokeStyle = "#f7f5ef"; c.lineWidth = 0.09; c.beginPath(); c.moveTo(-0.55, 0.38); c.quadraticCurveTo(-0.1, -0.1, 0.55, -0.32); c.stroke();
        c.setLineDash([0.06, 0.06]); lines(c, "rgba(255,255,255,.45)", 0.025, [[-0.95, 0.2, 1.7, 0.2]]); c.setLineDash([]);
      });
      clipTo(c, () => s.boot(), () => {
        fillInk(c, () => { c.beginPath(); c.moveTo(-0.15, -0.6); c.lineTo(0.85, -0.6); c.lineTo(0.85, -0.2); c.quadraticCurveTo(0.35, -0.28, -0.08, -0.16); c.closePath(); }, "#2b2f3d", lw * 0.6);
        lines(c, "#f7f5ef", lw * 0.55, [[0.05, -0.3, 0.6, -0.31]]);
      });
      s.boot(); ink(c, lw);
      fillInk(c, () => s.sole(0.34, 0.54, -1.05, 1.9), "#2b2f3d", lw);
    },
  },

  neon: {
    outline: s => [() => s.boot(), () => s.sole(0.34, 0.54, -1.05, 1.9), () => s.studs(0.5, [-0.7, -0.2, 0.45, 0.95, 1.45], 0.2), () => { const c = s.c; c.beginPath(); c.moveTo(-0.98, -0.2); c.lineTo(-0.96, -0.98); c.quadraticCurveTo(-0.55, -1.06, -0.14, -0.96); c.lineTo(-0.1, -0.3); c.closePath(); }],
    draw(s, t, lw) {
      const c = s.c;
      fillInk(c, () => s.studs(0.5, [-0.7, -0.2, 0.45, 0.95, 1.45], 0.2), "#ffe14d", lw * 0.7);
      const sock = () => { c.beginPath(); c.moveTo(-0.98, -0.2); c.lineTo(-0.96, -0.98); c.quadraticCurveTo(-0.55, -1.06, -0.14, -0.96); c.lineTo(-0.1, -0.3); c.closePath(); };
      fillInk(c, sock, "#1d1f2b", lw);
      clipTo(c, sock, () => lines(c, "rgba(255,255,255,.18)", 0.04, [[-0.9, -0.85, -0.2, -0.85], [-0.9, -0.7, -0.2, -0.7], [-0.9, -0.55, -0.2, -0.55]]));
      fillInk(c, () => s.boot(), hgrad(c, -1, 1.9, [[0, "#ff2e88"], [0.55, "#ff7a1a"], [1, "#ffe14d"]]), lw);
      clipTo(c, () => s.boot(), () => {
        c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.moveTo(-0.6, 0.38); c.lineTo(0.2, -0.38); c.lineTo(0.42, -0.38); c.lineTo(-0.3, 0.38); c.closePath(); c.fill();
        c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.moveTo(0.25, 0.38); c.lineTo(0.85, -0.25); c.lineTo(0.97, -0.22); c.lineTo(0.4, 0.38); c.closePath(); c.fill();
      });
      s.boot(); ink(c, lw);
      fillInk(c, () => s.sole(0.34, 0.54, -1.05, 1.9), "#ffe14d", lw);
    },
  },

  gold: {
    outline: s => [() => s.boot(), () => s.sole(0.34, 0.54, -1.05, 1.9), () => s.studs(0.5, [-0.75, -0.25, 0.55, 1.05, 1.5], 0.22)],
    draw(s, t, lw) {
      const c = s.c, gold = grad(c, -0.55, 0.5, [[0, "#fff6b0"], [0.45, "#ffd23f"], [1, "#c98a00"]]);
      fillInk(c, () => s.studs(0.5, [-0.75, -0.25, 0.55, 1.05, 1.5], 0.22), "#ffd23f", lw * 0.7);
      fillInk(c, () => s.boot(), gold, lw);
      clipTo(c, () => s.boot(), () => {
        c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 0.08; c.beginPath(); c.moveTo(-0.8, -0.32); c.quadraticCurveTo(0.3, -0.42, 1.2, -0.12); c.stroke();
        c.strokeStyle = "rgba(160,100,0,.5)"; c.lineWidth = 0.05; c.beginPath(); c.moveTo(-0.5, 0.36); c.quadraticCurveTo(0.0, -0.1, 0.6, -0.3); c.stroke();
      });
      s.boot(); ink(c, lw);
      fillInk(c, () => s.sole(0.34, 0.54, -1.05, 1.9), "#c98a00", lw);
      const tw = t === undefined ? 1 : Math.max(0, Math.sin(t * 3)), tw2 = t === undefined ? 0.6 : Math.max(0, Math.sin(t * 3 + 2.2));
      [[1.0, -0.12, 0.2 * tw], [-0.55, -0.18, 0.15 * tw2]].forEach(([x, y, sz]) => { if (sz < 0.02) return; c.fillStyle = "#fff"; c.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? sz * 0.28 : sz; c.lineTo(x + Math.cos(k * Math.PI / 4) * rr, y + Math.sin(k * Math.PI / 4) * rr); } c.closePath(); c.fill(); });
    },
  },

  clog: {
    outline: s => [() => s.sole(0.36, 0.86, -1.08, 1.94), () => CLOG(s.c)],
    draw(s, t, lw) {
      const c = s.c, body = () => CLOG(c);
      fillInk(c, body, grad(c, -0.85, 0.45, [[0, "#9be86a"], [1, "#6ccc45"]]), lw);
      fillInk(c, () => s.sole(0.36, 0.86, -1.08, 1.94), "#5fb83a", lw);
      c.fillStyle = "#3f8a24"; [[0.3, -0.52], [0.6, -0.6], [0.9, -0.58], [1.2, -0.5], [1.5, -0.36], [0.45, -0.3], [0.75, -0.36], [1.05, -0.3], [1.35, -0.18], [1.62, -0.08]].forEach(([x, y]) => { circ(c, x, y, 0.065); c.fill(); });
      c.beginPath(); c.moveTo(-0.32, -0.42); c.quadraticCurveTo(-0.85, -0.36, -0.99, 0.08); c.lineWidth = 0.2; c.strokeStyle = INK; c.stroke(); c.lineWidth = 0.13; c.strokeStyle = "#6ccc45"; c.stroke();
      fillInk(c, () => circ(c, -0.32, -0.42, 0.1), "#4ea52e", lw * 0.6);
      // Sticker: Smiley und Stern
      fillInk(c, () => circ(c, 0.6, -0.12, 0.17), "#ffe14d", lw * 0.6);
      c.fillStyle = INK; circ(c, 0.54, -0.16, 0.025); c.fill(); circ(c, 0.66, -0.16, 0.025); c.fill();
      c.beginPath(); c.arc(0.6, -0.11, 0.08, 0.2, Math.PI - 0.2); c.lineWidth = 0.03; c.strokeStyle = INK; c.stroke();
      fillInk(c, () => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 0.07 : 0.16; c.lineTo(1.15 + Math.cos(a) * rr, 0.05 + Math.sin(a) * rr); } c.closePath(); }, "#ff4fd8", lw * 0.6);
    },
  },

  latschen: {
    outline: s => [() => { s.c.beginPath(); s.c.roundRect(-1.16, 0.4, 3.08, 0.36, 0.16); }, () => SOCK(s.c)],
    draw(s, t, lw) {
      const c = s.c, sock = () => SOCK(c);
      fillInk(c, sock, grad(c, -1, 0.4, [[0, "#ffffff"], [1, "#e9edf3"]]), lw);
      clipTo(c, sock, () => {
        c.fillStyle = "#e63946"; c.fillRect(-1.1, -0.9, 0.9, 0.08);
        c.fillStyle = "#2f80ed"; c.fillRect(-1.1, -0.76, 0.9, 0.08);
        lines(c, "rgba(10,18,48,.12)", 0.03, [[-0.98, -0.6, -0.3, -0.6], [-0.98, -0.5, -0.3, -0.5]]);
      });
      fillInk(c, () => { c.beginPath(); c.moveTo(-0.02, 0.44); c.lineTo(0.02, -0.5); c.quadraticCurveTo(0.6, -0.5, 1.18, -0.26); c.lineTo(1.24, 0.44); c.closePath(); }, grad(c, -0.5, 0.4, [[0, "#3557c7"], [1, "#22398f"]]), lw);
      lines(c, "rgba(255,255,255,.35)", 0.05, [[0.1, -0.38, 1.1, -0.15]]);
      fillInk(c, () => { c.beginPath(); c.roundRect(-1.16, 0.4, 3.08, 0.36, 0.16); }, "#1d1f2b", lw);
      lines(c, "#3b3f55", lw * 0.6, [[-1.0, 0.52, 1.78, 0.52]]);
    },
  },

  blink: {
    outline: s => [() => s.low(), () => s.sole(0.3, 0.85)],
    draw(s, t, lw) {
      const c = s.c;
      fillInk(c, () => s.low(), grad(c, -0.75, 0.4, [[0, "#5aa9ff"], [1, "#2f6fe0"]]), lw);
      clipTo(c, () => s.low(), () => {
        fillInk(c, () => { c.beginPath(); c.moveTo(1.05, 0.4); c.quadraticCurveTo(1.2, -0.12, 1.6, -0.1); c.quadraticCurveTo(1.95, 0.0, 1.95, 0.4); c.closePath(); }, "#ff8bd1", lw * 0.6);
      });
      clipTo(c, () => s.low(), () => [[-0.15, -0.38, 1.0, -0.12], [0.0, -0.08, 1.15, 0.12]].forEach(([x0, y0, x1, y1]) => {
        fillInk(c, () => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1 - 0.03, y1 + 0.17); c.lineTo(x0 - 0.03, y0 + 0.17); c.closePath(); }, "#ffe14d", lw * 0.6);
        lines(c, "rgba(10,18,48,.25)", 0.025, [[x0 + 0.1, y0 + 0.085, x1 - 0.1, y1 + 0.085]]);
      }));
      s.low(); ink(c, lw);
      fillInk(c, () => s.sole(0.3, 0.85), "#e9eef8", lw);
      const cols = ["#ff3d6e", "#ffe14d", "#3ddc84", "#22d3ee", "#b28cff"];
      cols.forEach((col, k) => {
        const on = t === undefined ? 1 : (Math.floor(t * 8) % 5 === k ? 1 : 0.25), x = -0.86 + k * 0.53;
        c.save(); if (on === 1) { c.shadowColor = col; c.shadowBlur = 8; }
        c.globalAlpha = on; c.fillStyle = col; c.beginPath(); c.roundRect(x, 0.47, 0.34, 0.18, 0.08); c.fill(); c.restore();
      });
    },
  },

  zehen: {
    outline: s => [() => s.sole(0.34, 0.6, -1.06, 1.95), () => FOOT(s.c)],
    draw(s, t, lw) {
      const c = s.c, foot = () => FOOT(c);
      fillInk(c, foot, grad(c, -0.6, 0.4, [[0, "#5a6175"], [1, "#373c4d"]]), lw);
      clipTo(c, foot, () => {
        lines(c, "rgba(10,18,48,.6)", 0.035, [[1.13, -0.18, 1.1, 0.35], [1.32, -0.14, 1.3, 0.35], [1.52, -0.12, 1.5, 0.35], [1.7, -0.14, 1.68, 0.35]]);
        c.fillStyle = "#3ddc84"; c.beginPath(); c.moveTo(-1.1, -0.1); c.quadraticCurveTo(-0.3, -0.25, 0.6, 0.05); c.lineTo(0.6, 0.16); c.quadraticCurveTo(-0.3, -0.1, -1.1, 0.05); c.closePath(); c.fill();
      });
      foot(); ink(c, lw);
      fillInk(c, () => s.sole(0.34, 0.6, -1.06, 1.95), "#3ddc84", lw);
    },
  },
};


// x, y, r, dir, rot wie drawShoe() in art.js; t für animierte Skins (Blink-Sohle, Goldener Schuh)
export function drawShoeSkin(ctx, skin, x, y, r, dir, rot, t) {
  const S = SHOE_SKINS[skin] || SHOE_SKINS.klassiker;
  const lw = Math.max(1.5, r * 0.18) / r;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(dir * r, r); ctx.translate(-0.05, -0.05);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const s = Object.create(P); s.c = ctx;
  S.outline(s).forEach(build => { build(); ctx.lineWidth = lw * 2.4; ctx.strokeStyle = "#fff"; ctx.stroke(); });
  S.draw(s, t, lw);
  ctx.restore();
}
