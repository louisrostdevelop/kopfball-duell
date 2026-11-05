// Hindernisse: Plattformen, Blöcke und Bumper gegen Spieler und Ball
import { W, G, SR, FOOT, clamp } from "../config.js";
import { collideCircle, ev, pr } from "./base.js";
import { maxBall } from "./rules.js";
import { bombLand, endSlide } from "./tricks.js";

// Spieler gegen Plattformen (draufstehen, von unten anstoßen, seitlich abprallen) und Bumper
export function obsPlayer(st, p, dt, rest) {
  const r = pr(p), foot = (FOOT + SR) * p.sc;
  p.bonkT = Math.max(0, p.bonkT - dt);
  for (const o of st.obs) {
    if (o.t === "plat") {
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y, y1 = o.y + o.h;
      const L = p.x - r * 0.8, R = p.x + r * 0.8, top = p.y - r, bot = p.y + foot;
      if (R <= x0 || L >= x1) continue;
      // Landen / Stehen (auch auf bewegten Plattformen)
      if (p.vy >= o.vy - 1 && bot >= y0 - 0.5 && bot - (p.vy - o.vy) * dt <= y0 + 6) {
        if (!p.onG && p.bomb) bombLand(st, p);
        else if (!p.onG && p.vy > 500) { ev(st, { t: "land", i: p.i, x: p.x, y: y0, v: p.vy }); p.land = 0.15; }
        p.y = y0 - foot; p.vy = 0; p.onG = true; p.djUsed = false; p.jHeld = false; p.bombLock = false; p.slick = o.slick;
        p.x += o.vx * dt;
        continue;
      }
      if (bot <= y0 || top >= y1) continue;
      // Kantenhilfe: Fuß nur knapp unter der Oberkante -> hochziehen statt abprallen (fühlt sich fair an, keiner bleibt an der Kante hängen)
      if (bot - y0 < 30 && p.vy > -400) { p.y = y0 - foot; p.vy = Math.min(p.vy, 0); p.onG = true; p.jHeld = false; p.bombLock = false; p.slick = o.slick; if (p.bomb) bombLand(st, p); continue; }
      // Überlappung auflösen: kleinste Eindringtiefe, aber nie in den Boden drücken
      const down = y1 - top, left = R - x0, right = x1 - L;
      const canDown = p.y + down <= rest + 0.5;
      if (canDown && down < left && down < right) {
        p.y += down;
        if (p.vy < o.vy) { if (p.vy < -250 && p.bonkT <= 0) { ev(st, { t: "bonk", i: p.i, x: p.x, y: y1 }); p.bonkT = 0.3; } p.vy = Math.max(0, o.vy); p.jHeld = false; }
      } else {
        // seitlich raus, aber nie mit einem Ruck (z. B. großer Kopf unter dem Aufzug wird langsam rausgeschoben)
        const lim = canDown ? 1e9 : 10;
        if (left < right) { p.x -= Math.min(left, lim); if (p.vx > o.vx) p.vx = o.vx; }
        else { p.x += Math.min(right, lim); if (p.vx < o.vx) p.vx = o.vx; }
      }
    } else if (o.t === "bump") {
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), min = r + o.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      p.x = o.x + nx * min; p.y = Math.min(o.y + ny * min, rest);
      const vn = (p.vx - o.vx) * nx + (p.vy - o.vy) * ny;
      if (vn < 0) { p.vx -= 1.5 * vn * nx; p.vy -= 1.5 * vn * ny; }
      if (ny < -0.6) { p.vy = Math.min(p.vy, -650); p.onG = false; p.coy = 0; p.jHeld = false; p.bomb = 0; } // oben drauf = Trampolin
      if (p.slide > 0) endSlide(p);
    }
  }
  p.x = clamp(p.x, r, W - r);
}

// Ball gegen Plattformen und Bumper
export function obsBall(st, b, dt) {
  const e = clamp(0.62 * (st.rules.bounce || 1), 0.35, 0.92);
  if (b.fx && b.fx !== "bouncy" && b.fx !== "giant") return; // Spezialschüsse gehen durch Hindernisse
  for (const o of st.obs) {
    if (o.t === "plat") {
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y, y1 = o.y + o.h;
      const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1), dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if (d >= b.r) continue;
      let nx, ny;
      if (d === 0) {
        // Mittelpunkt steckt drin (z. B. vom Spieler hineingedrückt): auf dem kürzesten Weg raus, nie in den Boden
        const ways = [[b.x - x0, -1, 0], [x1 - b.x, 1, 0], [b.y - y0, 0, -1]];
        if (y1 < G - 1) ways.push([y1 - b.y, 0, 1]);
        const w = ways.reduce((m, q) => q[0] < m[0] ? q : m);
        nx = w[1]; ny = w[2];
        b.x = nx ? (nx < 0 ? x0 : x1) + nx * b.r : b.x; b.y = ny ? (ny < 0 ? y0 : y1) + ny * b.r : b.y;
      } else { nx = dx / d; ny = dy / d; b.x = cx + nx * b.r; b.y = cy + ny * b.r; }
      if (b.y + b.r > G) b.y = G - b.r;
      const rvx = b.vx - o.vx, rvy = b.vy - o.vy, dot = rvx * nx + rvy * ny;
      if (dot < 0) {
        b.vx -= (1 + e) * dot * nx; b.vy -= (1 + e) * dot * ny;
        if (-dot > 260) ev(st, { t: "obs", x: b.x, y: b.y, v: -dot, k: "plat" });
      }
      // liegt der Ball oben drauf, rollt er zur näheren Kante (nie liegen bleiben)
      if (ny < -0.7 && Math.abs(b.vx - o.vx) < 260) b.vx += (Math.sign(b.x - o.x) || (st.el % 2 < 1 ? 1 : -1)) * 900 * dt;
    } else if (o.t === "bump") {
      const hit = collideCircle(b, o.x, o.y, o.r + b.r, o.vx, o.vy, 0.9);
      if (!hit || hit.imp <= 0) continue;
      const sp = Math.hypot(b.vx, b.vy), want = Math.min(maxBall(st), Math.max(sp * o.k, 650 * o.k));
      if (sp > 0) { b.vx *= want / sp; b.vy *= want / sp; }
      ev(st, { t: "obs", x: b.x - hit.nx * b.r, y: b.y - hit.ny * b.r, v: want, k: "bump" });
    }
  }
}
