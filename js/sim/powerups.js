// Power-ups
import { W, PU_KEYS, rand } from "../config.js";
import { ev } from "./base.js";

// ---------- Power-ups ----------
export function powerups(st, dt) {
  if (!st.pus) return;
  st.puT -= dt;
  if (st.puT <= 0 && st.pu.length < 2) {
    st.puT = st.mod === "pu2" || st.rules.pu === "many" ? rand(3, 5) : rand(7, 11);
    const k = PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)];
    let x = 0, y = 0;
    let ok = false;
    for (let tries = 0; tries < 24 && !ok; tries++) {
      x = rand(360, W - 360); y = rand(260, 370);
      ok = !(st.obs || []).some(o => o.t === "plat" ? x > o.x - o.w / 2 - 50 && x < o.x + o.w / 2 + 50 && y > o.y - 50 && y < o.y + o.h + 50 : Math.hypot(x - o.x, y - o.y) < o.r + 60);
    }
    if (ok) { st.pu.push({ id: st.puId++, k, x, y, t: 0 }); ev(st, { t: "puSpawn" }); }
  }
  const b = st.b;
  for (let n = st.pu.length - 1; n >= 0; n--) {
    const u = st.pu[n]; u.t += dt;
    if (u.t > 13) { st.pu.splice(n, 1); continue; }
    if (Math.hypot(b.x - u.x, b.y - (u.y + Math.sin(u.t * 3) * 10)) < b.r + 36 && b.lt >= 0) {
      st.pu.splice(n, 1); applyPu(st, b.lt, u.k, u.x, u.y);
    }
  }
}

export function applyPu(st, i, k, x, y) {
  const me = st.p[i], op = st.p[1 - i];
  st.stats[i].pus++;
  switch (k) {
    case "bighead": me.bigT = 6; me.miniT = 0; break;
    case "mini": op.miniT = 6; op.bigT = 0; break;
    case "freeze": op.frz = Math.max(op.frz, 1.5); break;
    case "speed": me.spdT = 6; break;
    case "jump": me.jmpT = 6; break;
    case "fire": me.fireNext = true; break;
    case "wall": st.wall[i] = 5; break;
    case "biggoal": st.bigGoal[1 - i] = 6; break;
    case "meter": me.meter = 100; me.full = true; break;
    case "confuse": op.confT = 3.5; break;
    case "dbljump": me.djT = 7; break;
    case "wind": st.wind = { t: 5, dir: me.dir }; break;
  }
  ev(st, { t: "pu", i, k, x, y });
}
