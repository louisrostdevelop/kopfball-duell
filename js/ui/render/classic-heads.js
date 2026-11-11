// Die zwölf Grund-Köpfe (Kalle bis Kaiser), im selben Aufbau und mit denselben Werkzeugen wie die Meme-Köpfe:
// Haare als eigene Formen mit Sticker-Rand außerhalb des Kopfes, Glanzlicht, Accessoires mit Kontur und Glanz.
// Gezeichnet wird in einem gespiegelten Koordinatensystem: Ursprung in der Kopfmitte, +x zeigt nach vorn (Blickrichtung),
// Maße in Vielfachen von r. Die Augen liegen bei y ≈ −0,02 r, die Brauen bei ≈ −0,32 r: Haare bleiben darüber.
import { INK, TAU, circ, shade, stroke } from "./paint.js";
import { blob, headClip, mouthStd, star, whiteOutside } from "./meme-heads.js";

// Lokales System: vorne = +x
function local(ctx, x, y, dir, fn) { ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); fn(); ctx.restore(); }
// Pfad aus Befehlen in r-Einheiten: ["M", x, y], ["L", x, y], ["Q", cx, cy, x, y], ["C", …], ["Z"]
function path(ctx, r, cmds) {
  ctx.beginPath();
  for (const [c, ...v] of cmds) {
    const p = v.map(n => n * r);
    if (c === "M") ctx.moveTo(...p); else if (c === "L") ctx.lineTo(...p); else if (c === "Q") ctx.quadraticCurveTo(...p);
    else if (c === "C") ctx.bezierCurveTo(...p); else if (c === "Z") ctx.closePath();
  }
}
// Haarform: Sticker-Rand außerhalb des Kopfes, Füllung (Verlauf von oben hell nach unten), Kontur
function hair(ctx, r, lw, cmds, col, { white = true, grad = true } = {}) {
  const build = () => path(ctx, r, cmds);
  if (white) whiteOutside(ctx, 0, 0, r, build, lw);
  build();
  if (grad) { const g = ctx.createLinearGradient(0, -r * 1.3, 0, r * 0.4); g.addColorStop(0, shade(col, 0.22)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.18)); ctx.fillStyle = g; }
  else ctx.fillStyle = col;
  ctx.fill(); stroke(ctx, lw);
}
// Glanzlinie auf Haaren
function shine(ctx, r, lw, col, cmds, a = 0.55) {
  path(ctx, r, cmds); ctx.strokeStyle = shade(col, a); ctx.lineWidth = lw * 0.55; ctx.stroke();
}
// Band um den Kopf (Stirnband): leicht gewölbt, auf den Kopf beschnitten
function headband(ctx, r, lw, col, top, h) {
  const edge = (y0) => [["M", -1.1, y0 + 0.06], ["Q", 0.1, y0 - 0.16, 1.1, y0 + 0.08]];
  headClip(ctx, 0, 0, r, lw * 0.5);
  path(ctx, r, [...edge(top), ["L", 1.1, top + h + 0.08], ["Q", 0.1, top + h - 0.16, -1.1, top + h + 0.06], ["Z"]]);
  const g = ctx.createLinearGradient(0, r * (top - 0.1), 0, r * (top + h)); g.addColorStop(0, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.12));
  ctx.fillStyle = g; ctx.fill();
  path(ctx, r, edge(top)); stroke(ctx, lw * 0.75);
  path(ctx, r, edge(top + h)); stroke(ctx, lw * 0.75);
  path(ctx, r, edge(top + h * 0.32)); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = lw * 0.5; ctx.stroke();
  ctx.restore();
}
// Band-Enden hinten am Kopf, wehen leicht
function ribbonTails(ctx, r, lw, col, y0, t) {
  const w = Math.sin((t || 0) * 7) * 0.06;
  [[0, 0], [0.16, 0.14]].forEach(([dy, dl]) => {
    const tail = () => path(ctx, r, [["M", -0.92, y0 + dy], ["Q", -1.18, y0 - 0.1 + dy + w, -1.42 - dl, y0 + 0.02 + dy - w], ["L", -1.36 - dl, y0 + 0.16 + dy - w], ["Q", -1.16, y0 + 0.1 + dy + w, -0.92, y0 + 0.14 + dy], ["Z"]]);
    blob(ctx, tail, shade(col, dy ? -0.12 : 0), lw * 0.75, true);
  });
  circ(ctx, -0.93 * r, (y0 + 0.08) * r, r * 0.09); ctx.fillStyle = shade(col, -0.05); ctx.fill(); stroke(ctx, lw * 0.6);
}
// Glanzpunkt auf runden Teilen
function glint(ctx, x, y, s) { ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.6, -0.6, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fill(); }

export const CLASSIC_STYLES = {
  // Kalle: wilde Stachelfrisur nach hinten, rotes Stirnband mit wehenden Enden, Ponyspitzen unter dem Band
  spikes: {
    face: { brow: "heavy", browW: 0.9 },
    front(ctx, c, x, y, r, dir, lw, o) {
      local(ctx, x, y, dir, () => {
        hair(ctx, r, lw, [["M", -0.97, 0.08], ["L", -1.32, -0.2], ["L", -0.99, -0.4], ["L", -1.42, -0.72], ["L", -0.82, -0.78], ["L", -1.12, -1.22],
          ["L", -0.42, -0.98], ["L", -0.5, -1.46], ["L", -0.02, -1.02], ["L", 0.18, -1.44], ["L", 0.38, -0.97], ["L", 0.82, -1.2], ["L", 0.74, -0.76],
          ["L", 1.1, -0.74], ["L", 0.9, -0.5], ["Q", 0.2, -0.72, -0.62, -0.5], ["Q", -0.86, -0.3, -0.97, 0.08], ["Z"]], c.hair);
        shine(ctx, r, lw, c.hair, [["M", -0.62, -0.92], ["L", -0.86, -1.08]]);
        shine(ctx, r, lw, c.hair, [["M", -0.08, -0.94], ["L", -0.22, -1.2]]);
        headband(ctx, r, lw, c.acc, -0.74, 0.17);
        // Ponyspitzen unter dem Band
        hair(ctx, r, lw * 0.85, [["M", -0.3, -0.6], ["L", -0.1, -0.44], ["L", 0.06, -0.62], ["L", 0.3, -0.46], ["L", 0.42, -0.64], ["L", 0.7, -0.5], ["L", 0.74, -0.6], ["Q", 0.2, -0.72, -0.3, -0.6], ["Z"]], c.hair, { white: false, grad: false });
        ribbonTails(ctx, r, lw, c.acc, -0.7, o.t);
      });
    },
  },

  // Yuki: Bob mit rundem Pony bis über die Brauen, Strähnen bis zum Kinn, Stern-Spange
  bob: {
    back(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => hair(ctx, r, lw, [["M", -1.02, 0.52], ["Q", -1.2, -0.2, -1.0, -0.72], ["Q", -0.55, -1.25, 0.1, -1.17], ["Q", 0.85, -1.12, 1.06, -0.55],
        ["Q", 1.16, 0.0, 1.04, 0.5], ["Q", 0.98, 0.62, 0.86, 0.56], ["L", -0.86, 0.6], ["Q", -0.98, 0.64, -1.02, 0.52], ["Z"]], c.hair));
    },
    face: { brow: "none" },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        // Kappe mit gewelltem Pony (Unterkante über den Brauen)
        hair(ctx, r, lw, [["M", -0.99, 0.0], ["Q", -1.0, -1.08, 0.08, -1.08], ["Q", 1.0, -1.06, 0.99, -0.05], ["L", 0.9, 0.42], ["Q", 0.78, 0.5, 0.72, 0.38], ["L", 0.74, -0.42],
          ["Q", 0.6, -0.36, 0.46, -0.47], ["Q", 0.32, -0.36, 0.16, -0.47], ["Q", 0.0, -0.36, -0.16, -0.47], ["Q", -0.32, -0.38, -0.44, -0.46], ["Q", -0.62, -0.4, -0.7, -0.3],
          ["L", -0.72, 0.38], ["Q", -0.8, 0.5, -0.9, 0.42], ["Z"]], c.hair, { white: false });
        shine(ctx, r, lw, c.hair, [["M", -0.55, -0.82], ["Q", -0.2, -0.98, 0.18, -0.95]], 0.45);
        star(ctx, 0.58 * r, -0.66 * r, r * 0.2, c.acc, lw * 1.1);
        glint(ctx, 0.53 * r, -0.72 * r, r * 0.04);
      });
    },
  },

  // Bolt: hoher gelber Irokese mit Sticker-Rand, rasierte Seiten, Blitz-Tattoo an der Schläfe
  mohawk: {
    face: { brow: "heavy", browW: 0.85, browCol: c => shade(c.hair, -0.45) },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        // rasierte Seiten: etwas dunklere Haut oben
        headClip(ctx, 0, 0, r, lw);
        path(ctx, r, [["M", -1.1, -0.2], ["Q", -0.2, -0.62, 1.1, -0.42], ["L", 1.1, -1.2], ["L", -1.1, -1.2], ["Z"]]);
        const sg = ctx.createLinearGradient(0, -r, 0, -r * 0.3); sg.addColorStop(0, shade(c.skin, -0.22)); sg.addColorStop(1, shade(c.skin, -0.1));
        ctx.fillStyle = sg; ctx.fill();
        ctx.restore();
        // Irokese
        hair(ctx, r, lw, [["M", -0.55, -0.8], ["L", -0.74, -1.2], ["L", -0.36, -1.06], ["L", -0.36, -1.44], ["L", -0.06, -1.14], ["L", 0.08, -1.52], ["L", 0.3, -1.12],
          ["L", 0.56, -1.38], ["L", 0.6, -1.0], ["L", 0.88, -1.04], ["L", 0.72, -0.72], ["Q", 0.1, -0.98, -0.55, -0.8], ["Z"]], c.hair);
        shine(ctx, r, lw, c.hair, [["M", -0.2, -1.04], ["L", -0.28, -1.28]]); shine(ctx, r, lw, c.hair, [["M", 0.16, -1.06], ["L", 0.12, -1.32]]);
        // Blitz an der hinteren Schläfe
        path(ctx, r, [["M", -0.6, -0.42], ["L", -0.74, -0.18], ["L", -0.62, -0.2], ["L", -0.72, 0.02], ["L", -0.5, -0.26], ["L", -0.62, -0.24], ["L", -0.5, -0.42], ["Z"]]);
        ctx.fillStyle = c.acc; ctx.fill(); stroke(ctx, lw * 0.45);
      });
    },
  },

  // Rocco: kurze Haare mit Tolle, Rennbrille hochgeschoben auf der Stirn (Augen frei)
  goggles: {
    face: { brow: "heavy", browW: 0.85 },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        hair(ctx, r, lw, [["M", -0.99, -0.02], ["Q", -1.05, -1.0, -0.05, -1.08], ["Q", 0.5, -1.25, 0.86, -1.02], ["Q", 0.78, -0.92, 0.9, -0.74], ["Q", 0.98, -0.6, 0.94, -0.42],
          ["Q", 0.3, -0.62, -0.5, -0.5], ["Q", -0.82, -0.36, -0.99, -0.02], ["Z"]], c.hair);
        shine(ctx, r, lw, c.hair, [["M", 0.05, -1.04], ["Q", 0.45, -1.12, 0.7, -1.0]]);
        // Gummiband rund um den Kopf
        headClip(ctx, 0, 0, r, lw * 0.5);
        path(ctx, r, [["M", -1.1, -0.66], ["Q", 0.1, -0.86, 1.1, -0.62]]); ctx.lineWidth = r * 0.13; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = r * 0.07; ctx.strokeStyle = "#3a3f55"; ctx.stroke();
        ctx.restore();
        // Gläser
        [-1, 1].forEach(s => {
          const gx = (0.14 + s * 0.28) * r, gy = -0.74 * r, gr = r * 0.2;
          ctx.beginPath(); ctx.roundRect(gx - gr * 1.05, gy - gr * 0.82, gr * 2.1, gr * 1.64, gr * 0.7);
          ctx.lineWidth = lw * 2.6; ctx.strokeStyle = "#fff"; ctx.stroke();
          ctx.fillStyle = "#2b2f45"; ctx.fill(); stroke(ctx, lw);
          ctx.beginPath(); ctx.roundRect(gx - gr * 0.78, gy - gr * 0.56, gr * 1.56, gr * 1.12, gr * 0.5);
          const g = ctx.createLinearGradient(gx - gr, gy - gr, gx + gr, gy + gr); g.addColorStop(0, shade(c.acc, 0.45)); g.addColorStop(0.5, c.acc); g.addColorStop(1, shade(c.acc, -0.35));
          ctx.fillStyle = g; ctx.fill();
          glint(ctx, gx - gr * 0.35, gy - gr * 0.2, gr * 0.22);
        });
        path(ctx, r, [["M", 0.0, -0.74], ["L", 0.28, -0.74]]); stroke(ctx, lw * 1.4);
      });
    },
  },

  // Nala: zwei Afro-Puffs mit Struktur, runder Haaransatz, grünes Stirnband
  puffs: {
    back(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => [-1, 1].forEach(s => {
        const px = s * 0.7 * r, py = -0.86 * r, pr = r * 0.48;
        const g = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr); g.addColorStop(0, shade(c.hair, 0.3)); g.addColorStop(1, c.hair);
        blob(ctx, () => circ(ctx, px, py, pr), g, lw, true);
        ctx.strokeStyle = shade(c.hair, 0.35); ctx.lineWidth = lw * 0.45;
        [[-0.35, -0.3], [0.2, -0.45], [0.3, 0.1], [-0.25, 0.2]].forEach(([u, v]) => { ctx.beginPath(); ctx.arc(px + u * pr, py + v * pr, pr * 0.16, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); });
      }));
    },
    face: { brow: "std" },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        hair(ctx, r, lw, [["M", -0.98, -0.14], ["Q", -0.95, -1.02, 0.02, -1.0], ["Q", 0.95, -1.0, 0.97, -0.3], ["Q", 0.4, -0.66, -0.3, -0.58], ["Q", -0.8, -0.48, -0.98, -0.14], ["Z"]], c.hair, { white: false });
        headband(ctx, r, lw, c.acc, -0.8, 0.15);
      });
    },
  },

  // Flummi: pinke Haare mit seitlichem Pony (Augen frei), hoher Pferdeschwanz mit Haargummi, Kaugummiblase
  ponytail: {
    back(ctx, c, x, y, r, dir, lw, o) {
      const sw = Math.sin((o.t || 0) * 6) * 0.08;
      local(ctx, x, y, dir, () => {
        hair(ctx, r, lw, [["M", -0.5, -0.92], ["Q", -1.15, -1.25 + sw, -1.42, -0.62 + sw], ["Q", -1.55, -0.1 + sw, -1.25, 0.25 + sw], ["Q", -1.3, -0.2 + sw, -1.05, -0.5], ["Q", -0.9, -0.7, -0.62, -0.62], ["Z"]], c.hair);
        shine(ctx, r, lw, c.hair, [["M", -0.85, -1.0 + sw], ["Q", -1.25, -0.85 + sw, -1.32, -0.45 + sw]], 0.45);
      });
    },
    face: {
      brow: "std",
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const mx = P.fx, my = y + r * 0.42;
        mouthStd(ctx, mx, my, r, dir, lw, P.mood, 1);
        if (!P.mood && o.t !== undefined && Math.sin(o.t * 0.9) > 0.6) {
          const s = (Math.sin(o.t * 0.9) - 0.6) / 0.4;
          circ(ctx, mx + dir * r * 0.12, my + r * 0.05, r * 0.25 * s); ctx.fillStyle = "rgba(255,139,209,.88)"; ctx.fill(); stroke(ctx, lw * 0.5);
          glint(ctx, mx + dir * r * 0.05, my - r * 0.04, r * 0.06 * s);
        }
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        hair(ctx, r, lw, [["M", -0.98, 0.0], ["Q", -1.0, -1.04, 0.05, -1.06], ["Q", 0.9, -1.02, 0.98, -0.3], ["Q", 0.86, -0.42, 0.74, -0.36], ["Q", 0.5, -0.62, 0.1, -0.56],
          ["Q", -0.35, -0.5, -0.62, -0.36], ["Q", -0.86, -0.24, -0.98, 0.0], ["Z"]], c.hair, { white: false });
        shine(ctx, r, lw, c.hair, [["M", -0.5, -0.86], ["Q", -0.05, -1.0, 0.35, -0.9]], 0.45);
        blob(ctx, () => { ctx.beginPath(); ctx.ellipse(-0.62 * r, -0.86 * r, r * 0.15, r * 0.11, -0.7, 0, TAU); }, c.acc, lw * 0.8, true);
        glint(ctx, -0.66 * r, -0.92 * r, r * 0.035);
      });
    },
  },

  // Phantom: Kapuze mit Spitze, Gesichtsöffnung, Schatten unter den Augen
  hood: {
    back(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => hair(ctx, r, lw, [["M", -1.12, 0.75], ["Q", -1.3, -0.6, -0.5, -1.15], ["Q", -0.25, -1.26, -0.4, -1.4], ["Q", 0.55, -1.3, 0.9, -0.9], ["Q", 1.3, -0.3, 1.12, 0.75], ["Q", 0, 1.05, -1.12, 0.75], ["Z"]], c.hair));
    },
    face: {
      lid: 0.18, blushCol: "#b9a7ff",
      under(ctx, c, x, y, r, dir, lw, o, P) {
        [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(P.fx + s * P.gap, P.ey + P.es * 0.2, P.es * 1.05, P.es * 1.2, 0, 0, TAU); ctx.fillStyle = "rgba(91,75,138,.18)"; ctx.fill(); });
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        path(ctx, r, [["M", -1.0, 0.7], ["Q", -1.12, -0.7, -0.2, -1.04], ["Q", 0.9, -1.06, 1.04, 0.0], ["Q", 1.06, 0.4, 0.96, 0.7], ["Q", 0.9, -0.62, 0.12, -0.7], ["Q", -0.72, -0.66, -0.78, 0.2], ["Q", -0.8, 0.5, -1.0, 0.7], ["Z"]]);
        const g = ctx.createLinearGradient(0, -r, 0, r * 0.7); g.addColorStop(0, shade(c.hair, 0.15)); g.addColorStop(1, shade(c.hair, -0.25));
        ctx.fillStyle = g; ctx.fill(); stroke(ctx, lw);
        path(ctx, r, [["M", 0.92, 0.62], ["Q", 0.86, -0.56, 0.12, -0.64], ["Q", -0.66, -0.6, -0.72, 0.2]]); ctx.strokeStyle = "rgba(20,10,40,.35)"; ctx.lineWidth = lw * 1.4; ctx.stroke();
        shine(ctx, r, lw, c.hair, [["M", -0.7, -0.78], ["Q", -0.35, -1.0, 0.1, -0.98]], 0.4);
      });
    },
  },

  // Tank: Glatze mit Glanz, Schweißband, Vollbart mit Struktur und Schnurrbart
  beard: {
    face: {
      brow: "heavy", browCol: c => shade(c.hair, -0.25), blush: false,
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const m = P.mood;
        local(ctx, x, y, dir, () => {
          hair(ctx, r, lw, [["M", -0.9, 0.12], ["Q", -0.86, 0.95, -0.2, 1.18], ["Q", 0.14, 1.32, 0.42, 1.14], ["Q", 0.96, 0.86, 0.94, 0.14],
            ["Q", 0.66, 0.34, 0.5, 0.26], ["Q", 0.14, 0.18, -0.2, 0.26], ["Q", -0.6, 0.36, -0.9, 0.12], ["Z"]], c.hair);
          ctx.strokeStyle = shade(c.hair, 0.3); ctx.lineWidth = lw * 0.45;
          [[-0.6, 0.5], [-0.3, 0.78], [0.05, 0.92], [0.42, 0.78], [0.68, 0.5], [-0.05, 0.6], [0.3, 0.52]].forEach(([u, v]) => { ctx.beginPath(); ctx.moveTo(u * r, v * r); ctx.quadraticCurveTo((u + 0.04) * r, (v + 0.1) * r, (u - 0.02) * r, (v + 0.17) * r); ctx.stroke(); });
          const mx = 0.14 * r, my = 0.54 * r;
          ctx.beginPath();
          if (m === "happy") { ctx.moveTo(mx - r * 0.24, my - r * 0.04); ctx.quadraticCurveTo(mx, my + r * 0.3, mx + r * 0.24, my - r * 0.04); ctx.closePath(); ctx.fillStyle = "#7a1f2b"; ctx.fill(); stroke(ctx, lw * 0.8); ctx.beginPath(); ctx.moveTo(mx - r * 0.17, my); ctx.lineTo(mx + r * 0.17, my); ctx.strokeStyle = "#fff"; ctx.lineWidth = lw * 0.8; ctx.stroke(); }
          else if (m === "sad") { ctx.arc(mx, my + r * 0.14, r * 0.14, Math.PI * 1.15, Math.PI * 1.85); stroke(ctx, lw * 0.9); }
          else if (m === "angry") { ctx.rect(mx - r * 0.16, my - r * 0.05, r * 0.32, r * 0.12); ctx.fillStyle = "#fff"; ctx.fill(); stroke(ctx, lw * 0.8); }
          else { ctx.ellipse(mx, my + r * 0.02, r * 0.12, r * 0.05, 0, 0, TAU); ctx.fillStyle = "#5a1a22"; ctx.fill(); stroke(ctx, lw * 0.6); }
          path(ctx, r, [["M", -0.22, 0.42], ["Q", 0.14, 0.24, 0.5, 0.42], ["Q", 0.38, 0.5, 0.14, 0.42], ["Q", -0.08, 0.5, -0.22, 0.42], ["Z"]]);
          ctx.fillStyle = shade(c.hair, -0.1); ctx.fill(); stroke(ctx, lw * 0.7);
        });
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        ctx.beginPath(); ctx.ellipse(-0.3 * r, -0.72 * r, r * 0.26, r * 0.12, -0.5, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fill();
        headband(ctx, r, lw, c.acc, -0.56, 0.15);
      });
    },
  },

  // Tina: türkise Locken mit Glanz, Lockenpony
  curly: {
    back(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        const curls = []; for (let k = 0; k <= 9; k++) { const a = Math.PI * (0.92 + k * 0.128); curls.push([Math.cos(a) * 0.98, Math.sin(a) * 0.98 - 0.04, 0.3 + (k % 2) * 0.04]); }
        curls.forEach(([u, v, s]) => { circ(ctx, u * r, v * r, s * r + lw * 1.4); ctx.fillStyle = "#fff"; ctx.fill(); });
        curls.forEach(([u, v, s]) => {
          const g = ctx.createRadialGradient((u - s * 0.3) * r, (v - s * 0.35) * r, r * 0.02, u * r, v * r, s * r); g.addColorStop(0, shade(c.hair, 0.35)); g.addColorStop(1, c.hair);
          circ(ctx, u * r, v * r, s * r); ctx.fillStyle = g; ctx.fill(); stroke(ctx, lw * 0.8);
          ctx.beginPath(); ctx.arc(u * r, v * r, s * r * 0.5, Math.PI * 0.9, Math.PI * 1.9); ctx.strokeStyle = shade(c.hair, -0.25); ctx.lineWidth = lw * 0.45; ctx.stroke();
        });
      });
    },
    face: { brow: "std" },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        // Lockenpony: Kappe mit runden Locken als Unterkante
        hair(ctx, r, lw, [["M", -0.98, -0.1], ["Q", -1.0, -1.02, 0.04, -1.02], ["Q", 0.96, -1.0, 0.98, -0.3],
          ["Q", 1.0, -0.42, 0.86, -0.4], ["Q", 0.86, -0.6, 0.66, -0.5], ["Q", 0.6, -0.68, 0.4, -0.56], ["Q", 0.3, -0.72, 0.12, -0.58], ["Q", 0.0, -0.74, -0.16, -0.58],
          ["Q", -0.3, -0.7, -0.44, -0.54], ["Q", -0.62, -0.62, -0.7, -0.4], ["Q", -0.94, -0.42, -0.98, -0.1], ["Z"]], c.hair, { white: false });
        shine(ctx, r, lw, c.hair, [["M", -0.45, -0.86], ["Q", -0.05, -0.98, 0.35, -0.9]], 0.45);
      });
    },
  },

  // Magnus: silberne, nach hinten gekämmte Haare mit Kammspuren, runde pinke Brille mit Bügel
  slick: {
    face: { brow: "heavy", browW: 0.8, browCol: c => shade(c.hair, -0.35) },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        hair(ctx, r, lw, [["M", -0.99, 0.02], ["Q", -1.06, -1.0, -0.1, -1.12], ["Q", 0.62, -1.18, 0.9, -0.82], ["Q", 1.0, -0.66, 0.93, -0.5], ["Q", 0.62, -0.7, 0.2, -0.64],
          ["Q", -0.4, -0.58, -0.7, -0.36], ["Q", -0.9, -0.2, -0.99, 0.02], ["Z"]], c.hair);
        ctx.strokeStyle = shade(c.hair, -0.25); ctx.lineWidth = lw * 0.45;
        [0, 0.14, 0.28].forEach(k => { path(ctx, r, [["M", 0.78 - k * 0.3, -0.74 + k * 0.06], ["Q", 0.1 - k * 0.4, -1.0 + k * 0.12, -0.75 + k * 0.05, -0.55 + k * 0.4]]); ctx.stroke(); });
        shine(ctx, r, lw, c.hair, [["M", 0.45, -0.98], ["Q", 0.0, -1.06, -0.4, -0.95]], 0.55);
        // Brille: Bügel nach hinten, zwei runde Gläser, Steg
        path(ctx, r, [["M", -0.37, -0.05], ["Q", -0.65, -0.1, -0.93, -0.06]]); stroke(ctx, lw * 1.6); ctx.strokeStyle = c.acc; ctx.lineWidth = lw * 0.7; ctx.stroke();
        [-1, 1].forEach(s => {
          const gx = (0.14 + s * 0.27) * r, gy = -0.02 * r, gr = r * 0.24;
          circ(ctx, gx, gy, gr); ctx.fillStyle = "rgba(255,180,235,.18)"; ctx.fill();
          ctx.lineWidth = lw * 1.6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = lw * 0.75; ctx.strokeStyle = c.acc; ctx.stroke();
          ctx.beginPath(); ctx.arc(gx, gy, gr * 0.7, Math.PI * 1.15, Math.PI * 1.45); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = lw * 0.5; ctx.stroke();
        });
        path(ctx, r, [["M", 0.11, -0.06], ["Q", 0.14, -0.12, 0.17, -0.06]]); stroke(ctx, lw * 1.4); ctx.strokeStyle = c.acc; ctx.lineWidth = lw * 0.6; ctx.stroke();
      });
    },
  },

  // Max: Astronaut, Glaskuppel mit Spiegelungen, Halsring des Anzugs
  helmet: {
    face: { brow: "std" },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        hair(ctx, r, lw, [["M", -0.97, -0.16], ["Q", -0.96, -1.02, 0.05, -1.0], ["Q", 0.85, -0.98, 0.95, -0.42], ["Q", 0.55, -0.66, 0.05, -0.6], ["Q", -0.6, -0.56, -0.97, -0.16], ["Z"]], c.hair, { white: false });
        // Glaskuppel
        circ(ctx, 0, -0.06 * r, r * 1.3); ctx.fillStyle = "rgba(170,225,255,.13)"; ctx.fill();
        ctx.lineWidth = lw * 2.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = lw * 1.2; ctx.strokeStyle = "#f4f8ff"; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -0.06 * r, r * 1.12, Math.PI * 1.1, Math.PI * 1.42); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = lw * 1.3; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -0.06 * r, r * 1.12, Math.PI * 1.48, Math.PI * 1.56); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -0.06 * r, r * 1.16, Math.PI * 0.05, Math.PI * 0.22); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = lw; ctx.stroke();
        // Halsring des Anzugs am unteren Rand der Kuppel
        const ring = () => { ctx.beginPath(); ctx.arc(0, -0.06 * r, r * 1.26, Math.PI * 0.27, Math.PI * 0.73); };
        ring(); ctx.lineCap = "round"; ctx.lineWidth = r * 0.24 + lw * 2.2; ctx.strokeStyle = INK; ctx.stroke();
        ring(); ctx.lineWidth = r * 0.24; ctx.strokeStyle = "#e9eef8"; ctx.stroke();
        ring(); ctx.lineWidth = r * 0.08; ctx.strokeStyle = c.acc; ctx.stroke();
      });
    },
  },

  // Kaiser: goldene Krone mit Edelsteinen, weiße gewellte Haare an den Seiten, gezwirbelter Schnurrbart
  crown: {
    face: {
      brow: "heavy", browW: 0.85, browCol: c => shade(c.hair, -0.25),
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        mouthStd(ctx, P.fx, y + r * 0.55, r, dir, lw, P.mood, 0.8);
        local(ctx, x, y, dir, () => {
          [-1, 1].forEach(sd => {
            const m = u => 0.14 + sd * u;
            path(ctx, r, [["M", m(0.02), 0.28], ["Q", m(0.2), 0.2, m(0.34), 0.28], ["Q", m(0.42), 0.32, m(0.44), 0.22], ["Q", m(0.46), 0.38, m(0.26), 0.37], ["Q", m(0.1), 0.37, m(0.02), 0.33], ["Z"]]);
            ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw * 0.6);
          });
        });
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      local(ctx, x, y, dir, () => {
        // Haare: Kappe und Wellen an den Seiten
        hair(ctx, r, lw, [["M", -1.0, 0.2], ["Q", -1.16, 0.0, -1.04, -0.18], ["Q", -1.14, -0.4, -0.98, -0.54], ["Q", -0.92, -1.04, 0.05, -1.02], ["Q", 0.92, -1.0, 0.98, -0.48],
          ["Q", 1.1, -0.3, 1.0, -0.16], ["Q", 0.94, -0.3, 0.86, -0.4], ["Q", 0.4, -0.66, -0.1, -0.6], ["Q", -0.62, -0.56, -0.8, -0.3], ["Q", -0.86, 0.0, -1.0, 0.2], ["Z"]], c.hair);
        // Krone, leicht schräg
        ctx.save(); ctx.translate(0.05 * r, -0.86 * r); ctx.rotate(-0.1);
        const crown = () => path(ctx, r, [["M", -0.62, 0.2], ["L", -0.7, -0.36], ["L", -0.32, -0.08], ["L", 0.0, -0.5], ["L", 0.32, -0.08], ["L", 0.7, -0.36], ["L", 0.62, 0.2], ["Q", 0, 0.28, -0.62, 0.2], ["Z"]]);
        crown(); ctx.lineWidth = lw * 2.8; ctx.strokeStyle = "#fff"; ctx.stroke();
        crown(); const g = ctx.createLinearGradient(0, -0.5 * r, 0, 0.25 * r); g.addColorStop(0, "#fff3a0"); g.addColorStop(0.5, "#ffc82e"); g.addColorStop(1, "#d48a00");
        ctx.fillStyle = g; ctx.fill(); stroke(ctx, lw);
        path(ctx, r, [["M", -0.6, 0.06], ["Q", 0, 0.14, 0.6, 0.06]]); ctx.strokeStyle = "rgba(160,90,0,.55)"; ctx.lineWidth = lw * 0.6; ctx.stroke();
        [[-0.7, -0.36], [0, -0.5], [0.7, -0.36]].forEach(([u, v]) => { circ(ctx, u * r, v * r, r * 0.07); ctx.fillStyle = "#fff3a0"; ctx.fill(); stroke(ctx, lw * 0.6); });
        [[-0.36, "#ff3d6e"], [0, "#22d3ee"], [0.36, "#3ddc84"]].forEach(([u, col]) => { ctx.beginPath(); ctx.ellipse(u * r, 0.1 * r, r * 0.085, r * 0.07, 0, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(ctx, lw * 0.55); glint(ctx, (u - 0.03) * r, 0.08 * r, r * 0.025); });
        ctx.restore();
      });
    },
  },
};
