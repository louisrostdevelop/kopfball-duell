// Hauptschleife: Eingaben sammeln, Spiel fortschreiben, zeichnen, Wiederholung aufnehmen
import { clamp, MODS } from "../content/config.js";
import { aiInput } from "../core/ai.js";
import { advance, REPLAY_END, REPLAY_START } from "../core/physics.js";
import { S, save } from "./profile.js";
import { render, setQuality } from "../ui/render/render.js";
import { onEvent } from "./effects.js";
import { startDemo } from "./game.js";
import { guestFrame, hostSend, watchNet } from "./online.js";
import { matchEnd, seriesText } from "./results.js";
import { App, inGame, myIdx, vsCpu } from "./state.js";
import { $, toast } from "../ui/dom.js";
import { drawShowcase } from "../ui/screens/home.js";
import { input as I } from "./services.js";
import { t } from "../content/i18n.js";

export let lastT = performance.now(), simT = 0;
export const perf = { t: 0, n: 0, slow: 0 };

// Ein Fehler in einem Frame (z. B. beim Zeichnen) darf das Spiel nicht einfrieren: nächsten Frame immer anmelden,
// den Fehler einmal pro Meldung in die Konsole schreiben (Review 06.11.2026)
const seenErr = new Set();
export function loop(now) {
  requestAnimationFrame(loop);
  try { frame(now); } catch (e) { const k = String(e && e.message); if (!seenErr.has(k)) { seenErr.add(k); console.error("frame error", e); } }   // i18n-ok: Konsole
}
function frame(now) {
  const raw = (now - lastT) / 1000;
  const dt = Math.min(0.05, raw); lastT = now; simT += dt;
  if (S.quality === "high" && inGame() && raw < 0.5) {
    perf.t += raw; perf.n++;
    if (perf.t > 3) { if (perf.n / perf.t < 42) { perf.slow++; if (perf.slow >= 2) { S.quality = "low"; save(); setQuality("low"); toast(t("perf.lowQuality")); } } else perf.slow = 0; perf.t = 0; perf.n = 0; }
  }
  I.pollPads();
  const st = App.st;
  const rotated = I.isTouch && window.innerHeight > window.innerWidth && inGame();
  $("rotate").hidden = !rotated;
  watchNet(now);
  if (App.mode === "guest") guestFrame(dt, now);
  else if (!App.paused && !(rotated && App.mode !== "host")) {
    App.acc = advance(st, dt, gatherInputs(dt), App.acc);
    if (App.mode === "host") hostSend(dt);
  }
  if (st.ev.length) for (const e of st.ev.splice(0)) { onEvent(e, false); if (App.mode === "host") App.outEv.push(e); }
  if (st.ph === "play") { App.rec.push(snap(st)); if (App.rec.length > 200) App.rec.shift(); }
  let replay = null, frac = 0;
  if (st.ph === "goal" && App.replay && st.pt < REPLAY_START && st.pt > REPLAY_END) { replay = App.replay; frac = (REPLAY_START - st.pt) / (REPLAY_START - REPLAY_END); }
  if (st.ph === "ko" || st.ph === "cd") App.rec = [];
  if (App.mode !== "demo") { const me = myIdx(); if (me >= 0) App.maxDef = Math.max(App.maxDef, st.s[1 - me] - st.s[me]); }
  const la = st.ph === "cd" ? 1 : st.ph === "play" && App.goT >= 0 ? clamp(1 - (simT - App.goT - 1.5) / 0.6, 0, 1) : 0;
  const labels = (App.labels || []).map(lb => (lb ? { t: lb, a: la } : null));
  if (App.screen !== "home" || App.mode !== "demo" || !document.hidden) render(st, simT, { dt, names: App.names, labels, ballSkin: App.ball, replay, replayFrac: frac, noHud: App.mode === "demo", canSkip: App.mode !== "guest", series: seriesText(), modName: st.mod ? (MODS.find(m => m.id === st.mod) || {}).name : "" });
  if (App.mode !== "demo") I.touchHud(App.mode === "guest" && App.gp ? { p: [st.p[0], Object.assign({}, st.p[1], { charge: App.gp.charge })] } : st);
  if (st.ph === "end" && !App.endShown) { App.endShown = true; if (App.mode === "demo") setTimeout(startDemo, 1500); else setTimeout(matchEnd, 900); }
  if (App.mode === "demo" && st.ph === "goal" && st.pt < 3.0) st.pt = Math.min(st.pt, 0.5);
  if (App.screen === "home") drawShowcase(dt);
}

export function gatherInputs(dt) {
  const st = App.st;
  if (App.mode === "demo") return [aiInput(App.ai[0], st, dt), aiInput(App.ai[1], st, dt)];
  if (vsCpu()) return [I.getInput(0, "single"), aiInput(App.ai[1], st, dt)];
  if (App.mode === "local") return [I.getInput(0, "local"), I.getInput(1, "local")];
  if (App.mode === "host") {
    const g = App.guestIn, pd = App.gPend;
    // Druck-Zähler gestiegen, die Taste ist aber schon wieder los: Druck trotzdem kurz geben (kurzer Sprung = halb hoch)
    if (g[6] !== pd.sj) { if (!g[2] && pd.sj !== undefined) pd.j = 0.07; pd.sj = g[6]; }
    if (g[7] !== pd.sd) { if (!g[5] && pd.sd !== undefined) pd.d = 0.03; pd.sd = g[7]; }
    // Kommt länger keine Eingabe (Gast im Hintergrund, Paketverlust), nichts mehr festhalten: sonst läuft er ewig weiter
    const fresh = performance.now() - (App.guestInAt || 0) < 350;
    const out = { l: fresh && !!g[0], r: fresh && !!g[1], j: (fresh && !!g[2]) || pd.j > 0, k: fresh && !!g[3], s: fresh && !!g[4], d: (fresh && !!g[5]) || pd.d > 0 };
    pd.j = Math.max(0, pd.j - dt); pd.d = Math.max(0, pd.d - dt);
    return [I.getInput(0, "single"), out];
  }
  return [{}, {}];
}

export function snap(st) {
  return { obsP: (st.obs || []).map(o => ({ x: o.x, y: o.y })), arena: st.arena, s: st.s, t: st.t, ph: st.ph, gold: st.gold, mod: st.mod, rules: st.rules, wind: st.wind, wall: [...st.wall], bigGoal: [...st.bigGoal], pu: st.pu.map(u => ({ ...u })), b: { ...st.b }, p: st.p.map(p => ({ ...p })) };
}
