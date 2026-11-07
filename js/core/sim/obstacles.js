// Hindernisse: Plattformen, Blöcke, Bumper, Rampen, Geysire, Blasensäulen und Noclip-Türen gegen Spieler und Ball
import { W, G, SR, FOOT, clamp } from "../../content/config.js";
import { geyserState, rampY } from "../../content/layouts.js";
import { collideCircle, ev, pr } from "./base.js";
import { ballG, gMul, maxBall } from "./rules.js";
import { bombLand, endSlide } from "./tricks.js";
import { PG, bv, pv } from "./tuning.js";
import { dhypot } from "../../content/dmath.js";

// Spieler gegen Plattformen (draufstehen, von unten anstoßen, seitlich abprallen) und Bumper
export function obsPlayer(st, p, dt, rest) {
  const r = pr(p), foot = (FOOT + SR) * p.sc;
  p.bonkT = Math.max(0, p.bonkT - dt);
  p.onRamp = Math.max(0, (p.onRamp || 0) - 1);
  for (const o of st.obs) {
    if (o.t === "ramp") {
      const ys = rampY(o, p.x);
      // am Ende der Schräge: direkt auf den Boden (sonst fällt man die letzten Pixel)
      if (ys === null) { if (p.onRamp > 0 && p.vy >= 0 && p.y < rest && rest - p.y < 18 && Math.abs(p.x - o.x) < o.w) { p.y = rest; p.vy = 0; p.onG = true; } continue; }
      const bot = p.y + foot;
      // draufstehen, hochlaufen, und bergab am Boden bleiben (sonst hüpft man die Schräge runter)
      if (p.vy >= -1 && (bot >= ys - 0.5 || (p.onRamp > 0 && ys - bot < 18))) {
        if (!p.onG && p.bomb) bombLand(st, p);
        else if (!p.onG && p.vy > 500) { ev(st, { t: "land", i: p.i, x: p.x, y: ys, v: p.vy }); p.land = 0.15; }
        p.y = ys - foot; p.vy = 0; p.onG = true; p.djUsed = false; p.jHeld = false; p.bombLock = false; p.slick = false; p.onRamp = 2;
      }
      continue;
    }
    if (o.t === "geyser" || o.t === "bubbles") {
      if (Math.abs(p.x - o.x) > o.w / 2 + r * 0.4 || p.y < o.top) continue;
      if (o.t === "geyser" && geyserState(o, st.el).active) { p.vy = Math.min(p.vy, -pv(980)); p.onG = false; p.coy = 0; p.bomb = 0; if (p.slide > 0) endSlide(p); }
      else if (o.t === "bubbles" && !p.onG && geyserState(o, st.el).active) p.vy -= 0.45 * PG() * gMul(st) * dt;   // Auftrieb: fällt langsamer, springt höher
      continue;
    }
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
      const dx = p.x - o.x, dy = p.y - o.y, d = dhypot(dx, dy), min = r + o.r;
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
  b.portT = Math.max(0, (b.portT || 0) - dt);
  for (const o of st.obs) if (o.t === "ramp") rampBall(st, b, o, e);   // Rampen sind Boden: auch für Spezialschüsse
  if (b.fx && b.fx !== "bouncy" && b.fx !== "giant") return; // Spezialschüsse gehen durch Hindernisse
  for (const o of st.obs) {
    if (o.t === "geyser") {
      // Tempo so, dass der Ball knapp über der Fontäne umkehrt (bleibt im Bild, auch auf dem Handy)
      if (Math.abs(b.x - o.x) < o.w / 2 + b.r * 0.3 && b.y > o.top + 10 && geyserState(o, st.el).active) {
        const v = Math.sqrt(2 * ballG(st) * (b.y - (o.top - 30)));
        if (b.vy > -v + 1) { if (b.vy > -v * 0.6) ev(st, { t: "obs", x: b.x, y: b.y, v, k: "geyser" }); b.vy = -v; }
        b.vx *= 1 - 2 * dt;
      }
    } else if (o.t === "bubbles") {
      // sprudelt im Takt: hebt den Ball, dann sinkt er wieder (so bleibt er nie oben hängen)
      if (Math.abs(b.x - o.x) < o.w / 2 && b.y > o.top && geyserState(o, st.el).active) { b.vy -= ballG(st) * 1.5 * dt; if (b.vy < -bv(380)) b.vy = -bv(380); }
    } else if (o.t === "portal") {
      // nur in Richtung des eigenen Tors: rettet den Ball auf die andere Seite (Richtung Mitte geht man einfach durch)
      if (b.portT > 0 || o.to < 0 || Math.abs(b.x - o.x) > o.w / 2 || b.y < o.y || b.y > o.y + o.h || Math.sign(b.vx) !== Math.sign(o.x - W / 2)) continue;
      const q = st.obs[o.to], dy = b.y - o.y;
      b.x = q.x + Math.sign(b.vx || 1) * (q.w / 2 + b.r + 2); b.y = q.y + dy; b.portT = 0.6;
      ev(st, { t: "noclip", x: o.x, y: o.y + o.h / 2, x2: q.x });
      break;
    } else if (o.t === "plat") {
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y, y1 = o.y + o.h;
      const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1), dx = b.x - cx, dy = b.y - cy, d = dhypot(dx, dy);
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
      const sp = dhypot(b.vx, b.vy), want = Math.min(maxBall(st), Math.max(sp * o.k, 650 * o.k));
      if (sp > 0) { b.vx *= want / sp; b.vy *= want / sp; }
      ev(st, { t: "obs", x: b.x - hit.nx * b.r, y: b.y - hit.ny * b.r, v: want, k: "bump" });
    }
  }
}

// Ball gegen Rampe: Kreis gegen die Kanten (Schrägen und Oberseite); steckt er drin, nach oben raus
function rampBall(st, b, o, e) {
  const a = o.x - o.top / 2, c = o.x + o.top / 2, x0 = a - o.L, x1 = c + o.R, yt = G - o.h;
  if (b.x + b.r < x0 || b.x - b.r > x1 || b.y + b.r < yt) return;
  const ys = rampY(o, b.x);
  if (ys !== null && b.y > ys) { b.y = ys - b.r; if (b.vy > 0) b.vy = -b.vy * e * 0.5; }
  const segs = [[x0, G, a, yt], ...(o.top > 0 ? [[a, yt, c, yt]] : []), [c, yt, x1, G]];
  for (const [ax, ay, bx, by] of segs) {
    const sx = bx - ax, sy = by - ay, l2 = sx * sx + sy * sy, k = clamp(((b.x - ax) * sx + (b.y - ay) * sy) / l2, 0, 1);
    const px = ax + sx * k, py = ay + sy * k, dx = b.x - px, dy = b.y - py, d = dhypot(dx, dy);
    if (d >= b.r || d === 0 || dy > 0) continue;   // nur von oben/außen
    const nx = dx / d, ny = dy / d;
    b.x = px + nx * b.r; b.y = py + ny * b.r;
    const dot = b.vx * nx + b.vy * ny;
    if (dot < 0) {
      const ee = -dot < 120 ? 0 : e * 0.8;   // rollt sanft, prallt bei Wucht ab
      b.vx -= (1 + ee) * dot * nx; b.vy -= (1 + ee) * dot * ny;
      if (-dot > 380) ev(st, { t: "obs", x: px, y: py, v: -dot, k: "ramp" });
    }
  }
}

// Einmal pro Schritt: Geysire melden ihren Ausbruch (Sound, Effekt); gleicher Takt für beide Seiten
export function obsTick(st) {
  for (const o of st.obs) {
    if (o.t !== "geyser") continue;
    const on = geyserState(o, st.el).active;
    if (on && !o.was) ev(st, { t: "geyser", x: o.x, y: G });
    o.was = on;
  }
}
