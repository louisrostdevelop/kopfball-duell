// Tore
import { W } from "../config.js";
import { addMeter, ev } from "./base.js";
import { endFx } from "./supers.js";

// ---------- Tore ----------
export function goal(st, i) {
  const b = st.b, other = 1 - i;
  st.s[i]++;
  const own = b.lt === other;
  const kind = own ? "own" : b.ltk === "super" || b.fx ? "super" : b.ltk === "head" ? "head" : b.ltk === "bomb" ? "bomb" : b.ltk === "slide" ? "slide" : "kick";
  const long = !own && b.lt === i && (i === 0 ? b.ltx < W / 2 - 40 : b.ltx > W / 2 + 40);
  const lastSec = !st.gold && st.t < 3;
  const S = st.stats[i];
  S.goals++;
  if (own) st.stats[other].ownGoals++;
  if (kind === "head") S.headGoals++;
  if (kind === "super") S.superGoals++;
  if (long) S.longGoals++;
  if (lastSec) S.lastSecGoals++;
  st.lastGoal = { i, kind, long, lastSec, gold: st.gold, x: b.x, y: b.y, s: [...st.s] };
  st.p[i].mood = "happy"; st.p[i].moodT = 3; st.p[other].mood = "sad"; st.p[other].moodT = 3;
  addMeter(st, st.p[other], 15);
  endFx(st); b.alpha = 1;
  st.ph = "goal"; st.pt = 3.7; st.slow = 0.9;
  ev(st, { t: "goal", i, kind, long, lastSec, gold: st.gold, x: b.x, y: b.y, s: [...st.s] });
}
