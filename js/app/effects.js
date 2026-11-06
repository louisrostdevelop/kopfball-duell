// Spielereignisse in Effekte, Sound und Vibration übersetzen
import { clamp, COL, G, GOAL_W, POWERUPS, SUPERS, W } from "../content/config.js";
import { emote } from "../core/physics.js";
import { fx } from "../ui/render/render.js";
import { simT } from "./loop.js";
import { App, isHuman, myIdx, vsCpu } from "./state.js";
import { audio as A, input as I } from "./services.js";
import { t } from "../content/i18n.js";

export const PHRASES = [0, 1, 2, 3, 4, 5, 6, 7].map(i => "fx.phrase." + i);   // Schlüssel, übersetzt beim Anzeigen

export const CELEB = { kalle: "🔥", yuki: "❄️", bolt: "⚡", rocco: "🚀", nala: "🍌", flummi: "🎈", phantom: "👻", tank: "💪", tina: "🌪️", magnus: "🧲", max: "☄️", kaiser: "👑" };

export function onEvent(e, remote) {
  const demo = App.mode === "demo", st = App.st;
  const snd = (k, v) => { if (!demo) A.sfx(k, v); };
  switch (e.t) {
    case "go": if (st.s[0] + st.s[1] === 0 && App.goT < 0) App.goT = simT; snd(st.gold ? "whistle1" : "go"); if (!demo && st.s[0] + st.s[1] === 0 && !st.gold) snd("whistle1"); break;
    case "jump": if (remote && e.i === myIdx()) break; fx.burst("dust", e.x, e.y, { n: e.dbl ? 10 : 4 }); if (e.dbl) fx.burst("pu", e.x, e.y, { col: POWERUPS.dbljump.col }); snd("jump"); break;
    case "land": fx.burst("dust", e.x, e.y, { n: 6 }); snd("land"); break;
    case "swing": if (remote && e.i === myIdx()) break; snd("swing"); break;
    case "kick": {
      if (App.jug.n >= 3 && App.jug.i === e.i) fx.burst("text", e.x, e.y - 76, { text: t("fx.direct"), col: "#fff", size: 24 });
      App.jug.n = 0;
      const kp = st.p[e.i], dir = kp ? kp.dir : 1;
      // Wucht nach tatsächlichem Balltempo: Tipp knallt, Hammer explodiert
      const spd = e.spd || 1000, sv = clamp((spd - 700) / 1400, 0, 1.3), hammer = spd > 1750, juice = Math.max(e.pow, 1 + sv * 0.7);
      const ang = Math.atan2(st.b.vy, st.b.vx);
      fx.burst("kick", e.x, e.y, { pow: juice, dir }); snd(e.kind === "lob" ? "chip" : hammer ? "hammer" : "kick", juice);
      fx.shake(e.kind === "lob" ? 2 : 2 + 6 * sv);
      fx.ballHit(ang, 0.6 + sv * 0.5);
      if (kp) fx.swoosh(e.x - dir * 20, e.y, dir, juice);
      if (sv > 0.5) fx.punch(0.008 + 0.014 * sv);
      if (hammer) { fx.burst("ring", e.x, e.y, { col: spd > 2300 ? COL.gold : "#fff", ang }); fx.flash("#fff", 0.12 + 0.12 * clamp((spd - 1750) / 900, 0, 1)); }
      const T = (text, col, size, dy = 42) => fx.burst("text", e.x, e.y - dy, { text, col, size });
      if (spd > 2300) T(t("fx.hammer"), COL.gold, 34, 46);
      else if (e.c > 0.85 && e.q > 0.75 && e.kind !== "lob") T(t("fx.bullseye"), COL.gold, 30, 46);
      else if (e.kind === "lob") T("LUPFER", "#bfe9ff", 22, 40);
      else if (e.kind === "volley" && spd > 1500) T(t("fx.volley"), COL.gold, 26, 40);
      else if (hammer) T(t("fx.wham"), COL.gold, 28, 40);
      if (isHuman(e.i)) I.vibrate(hammer ? [20, 20, 40] : juice > 1.4 ? 30 : 16);
      break;
    }
    case "head": {
      fx.burst("head", e.x, e.y); snd("head", e.pow || 1); if (e.v > 700) fx.shake(3);
      fx.squash(e.i); fx.ballHit(Math.atan2(st.b.vy, st.b.vx), 0.5);
      if ((e.pow || 1) > 1.3) { fx.burst("text", e.x, e.y - 50, { text: t("fx.powerHeader"), col: COL.gold, size: 24 }); fx.shake(5); fx.punch(0.02); }
      const j = App.jug; if (j.i === e.i) j.n++; else { j.i = e.i; j.n = 1; }
      if (j.n >= 3) { fx.burst("text", e.x, e.y - 50, { text: t("fx.juggle", { n: j.n }), col: j.n >= 5 ? COL.gold : "#fff", size: 22 + Math.min(14, j.n * 2) }); if (j.n === 5 || j.n === 8) snd("full"); }
      break;
    }
    case "bounce": App.jug.n = 0; if (e.v > 300) fx.ballHit(Math.PI / 2, e.v / 1400); if (e.v > 400) fx.burst("dust", e.x, e.y, { n: 4, col: "rgba(255,255,255,.35)" }); snd("bounce", e.v); break;
    case "post": fx.bar(e.x < W / 2 ? 0 : 1); fx.burst("post", e.x, e.y); snd("post"); snd("ohh"); fx.shake(7); fx.burst("text", e.x, e.y - 30, { text: t("fx.bar"), col: "#fff", size: 28 }); fx.hype(0.6); break;
    case "goal": onGoal(e); break;
    case "super": {
      const sc = SUPERS[e.k].col;
      fx.burst("super", e.x, e.y, { col: sc }); snd("super"); fx.shake(12); fx.flash(sc, 0.35);
      if (!demo) fx.callout(SUPERS[e.k].name.toUpperCase(), sc, "", 1.0, 0.6);
      if (isHuman(e.i)) I.vibrate(60);
      break;
    }
    case "arm": snd("arm"); { const p = st.p[e.i]; fx.burst("text", p.x, p.y - 90, { text: t("fx.superReady"), col: COL.gold, size: 22 }); } break;
    case "full": if (isHuman(e.i) || App.mode === "local") { snd("full"); const p = st.p[e.i]; fx.burst("text", p.x, p.y - 80, { text: t("fx.super"), col: COL.gold, size: 26 }); } break;
    case "launch": snd("launch"); break;
    case "zap": fx.burst("zap", e.x, e.y); snd("zap"); break;
    case "pu": fx.burst("pu", e.x, e.y, { col: POWERUPS[e.k].col }); snd("pu"); fx.burst("text", e.x, e.y - 40, { text: POWERUPS[e.k].name.toUpperCase(), col: POWERUPS[e.k].col, size: 24 }); if (isHuman(e.i)) I.vibrate(25); break;
    case "puSpawn": snd("puSpawn"); break;
    case "freeze": fx.burst("freeze", e.x, e.y); snd("freeze"); break;
    case "burn": snd("burn"); fx.shake(9); break;
    case "stomp": fx.burst("stomp", e.x, e.y); snd(e.bomb ? "pound" : "stomp", e.bomb ? 1 : undefined); if (e.bomb) fx.shake(6 + 6 * e.k); fx.burst("text", e.x, e.y - 30, { text: e.bomb ? t("fx.bomb") : t("fx.boing"), col: e.bomb ? COL.gold : "#fff", size: 28 }); break;
    case "quake": fx.burst("quake", e.x, e.y); snd("quake"); fx.shake(22); break;
    case "save": snd("head"); fx.burst("text", e.x, e.y - 40, { text: t("fx.save"), col: "#8ef3ff", size: 28 }); fx.hype(0.4); break;
    case "wallhit": snd("wallhit"); fx.burst("post", e.x, e.y); break;
    case "charged": if (isHuman(e.i) || App.mode === "local") snd("charged"); break;
    case "ten": if (!demo) { fx.callout(t("fx.tenSec"), "#ff5a5a", "", 1.1, 0.55); snd("tick"); } break;
    case "golden": snd("whistle"); fx.hype(0.8); break;
    case "end": snd("whistle"); fx.hype(1); break;
    case "emote": snd("emote"); break;
    case "bump": fx.burst("stomp", e.x, e.y); snd("bump", e.pow); fx.shake(3 + 4 * (e.pow - 1)); if (e.pow > 1.6) fx.burst("text", e.x, e.y - 40, { text: t("fx.shove"), col: "#fff", size: 24 }); if (isHuman(1 - e.i)) I.vibrate(20); break;
    case "pop": fx.burst("dust", e.x, e.y + 10, { n: 10 }); snd("pop"); break;
    case "obs":
      if (e.k === "bump") {
        snd("bumper", e.v / 1200); fx.burst("head", e.x, e.y); fx.shake(3);
        let best = null, bd = 1e9; for (const o of st.obs || []) if (o.t === "bump") { const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; best = o; } }
        if (best) best.hitT = simT;
      } else { snd("wallhit"); if (e.v > 700) fx.burst("post", e.x, e.y); }
      break;
    case "bonk": if (remote && e.i === myIdx()) break; snd("bump", 0.8); fx.burst("stomp", e.x, e.y); break;
    case "slide": if (remote && e.i === myIdx()) break; fx.burst("dust", e.x, e.y, { n: 8 }); snd("slide"); break;
    case "bomb": if (remote && e.i === myIdx()) break; snd("bomb"); break;
    case "pound": if (remote && e.i === myIdx()) break; fx.burst("dust", e.x, e.y, { n: 8 + Math.round(10 * e.k) }); fx.shake(3 + 6 * e.k); snd("pound", e.k); if (isHuman(e.i)) I.vibrate(15); break;
    case "squash": {
      fx.burst("kick", e.x, e.y, { pow: 1.3 + e.k * 0.6, dir: Math.sign(st.b.vx) || 1 }); fx.burst("dust", e.x, G, { n: 14 });
      fx.ballHit(Math.atan2(st.b.vy, st.b.vx), 0.9 + e.k); fx.shake(6 + 10 * e.k); fx.punch(0.02 + 0.03 * e.k); snd("squash", e.k);
      if (e.k > 0.7) fx.burst("text", e.x, e.y - 60, { text: t("fx.squashed"), col: COL.gold, size: 30 });
      if (isHuman(e.i)) I.vibrate(35); App.jug.n = 0; break;
    }
    case "smash": fx.burst("kick", e.x, e.y, { pow: 1.2 + e.k * 0.5, dir: 1 }); fx.shake(5 + 6 * e.k); snd("squash", e.k * 0.7); if (e.k > 0.7) fx.burst("text", e.x, e.y - 50, { text: t("fx.smash"), col: "#fff", size: 26 }); App.jug.n = 0; break;
    case "poke": fx.burst("kick", e.x, e.y, { pow: 1, dir: Math.sign(st.b.vx) || 1 }); snd("kick", 0.9); App.jug.n = 0; break;
    case "trip": fx.burst("stomp", e.x, e.y); fx.burst("dust", e.x, G, { n: 10 }); snd("bump", 1.3); fx.shake(4); fx.burst("text", e.x, e.y - 70, { text: t("fx.slide"), col: "#fff", size: 24 }); if (isHuman(1 - e.i)) I.vibrate(25); break;
  }
}

export function onGoal(e) {
  const st = App.st, demo = App.mode === "demo";
  const side = e.i === 0 ? 1 : 0;
  const gx = side ? W - GOAL_W / 2 : GOAL_W / 2;
  const gfx = e.kind !== "own" && App.cfg && App.cfg.cos && App.cfg.cos[e.i] ? App.cfg.cos[e.i].goalfx : null;
  fx.burst("goal", gx, Math.min(e.y, G - 60), { col: [COL.p1, COL.p2][e.i], fx: gfx });
  fx.net(side, e.y, 1.4);
  fx.shake(24); fx.flash([COL.p1, COL.p2][e.i], 0.45); fx.hype(1);
  App.replay = App.rec.slice(-160);
  if (!demo) A.sfx("goal");
  if (isHuman(e.i)) I.vibrate([60, 40, 120]);
  let text = t("goal.goal");
  if (e.gold) text = t("goal.golden");
  else if (e.kind === "own") text = t("goal.own");
  else if (e.lastSec) text = t("goal.lastSec");
  else if (e.kind === "super") text = t("goal.super");
  else if (e.long) text = t("goal.long");
  else if (e.kind === "head") text = t("goal.head");
  else if (e.kind === "bomb") text = t("goal.bomb");
  else if (e.kind === "slide") text = t("goal.slide");
  let sub;
  if (st.stats[e.i].goals === 3 && e.kind !== "own") sub = t("goal.hattrick");
  else if (e.s[0] === e.s[1]) sub = t("goal.equalizer");
  else if (Math.abs(e.s[0] - e.s[1]) === 1 && e.s[e.i] > e.s[1 - e.i]) sub = t("goal.lead");
  else sub = Math.random() < 0.5 ? (App.names[e.i] || "").toUpperCase() : t(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
  if (!demo) fx.callout(text, [COL.p1, COL.p2][e.i], sub, 1.9, text.length > 9 ? 0.82 : 1);
  if (App.mode !== "guest" && e.kind !== "own") { const sc = st.p[e.i]; setTimeout(() => { if (App.st === st) emote(st, e.i, CELEB[sc.ch] || "🔥"); }, 350); }
  if (vsCpu() && e.i === 0 && Math.random() < 0.6) setTimeout(() => { if (App.st === st) emote(st, 1, ["😤", "😤", "🤡", "GG"][Math.floor(Math.random() * 4)]); }, 1100);
}
