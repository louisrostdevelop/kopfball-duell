// Spiel starten, pausieren und beenden; Demo im Hintergrund
import { ARENAS, CHARS } from "../content/config.js";
import { layoutsFor } from "../content/layouts.js";
import { makeAI } from "../core/ai.js";
import { emote, newMatch } from "../core/physics.js";
import { S, save } from "./profile.js";
import { fx, setBand } from "../ui/render/render.js";
import { App, inGame, vsCpu } from "./state.js";
import { $, $$, toast } from "../ui/dom.js";
import { showScreen } from "../ui/nav.js";
import { audio as A, input as I, net as Net } from "./services.js";

export function startDemo() {
  const pool = CHARS.map(c => c.id);
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)]; if (b === a) b = pool[(pool.indexOf(a) + 3) % pool.length];
  App.mode = "demo";
  App.st = newMatch({ chars: [a, b], arena: ARENAS[Math.floor(Math.random() * ARENAS.length)].id, dur: 600, pus: true, golden: false });
  App.st.ph = "play";
  App.ai = [makeAI(0, 2), makeAI(1, 2)];
  App.names = ["", ""]; App.labels = [null, null]; App.ball = S.ball;
  App.rec = []; App.replay = null; fx.clear();
  I.setLayout("none");
}

// cfg: { mode, chars, arena, dur, rules, mod, golden, diff, names, labels, ball, keeper, train }
export function resolveObs(cfg) {
  if (cfg.rules && cfg.rules.obs === "rnd") {
    const n = layoutsFor(cfg.arena).length;
    cfg = { ...cfg, rules: { ...cfg.rules, obs: n ? Math.floor(Math.random() * n) : "off" } };
  }
  return cfg;
}

// Kopf-Level aus dem Server-Stand (ohne Server immer 1)
export const headLevel = id => (S.heads && S.heads[id] && S.heads[id].level) || 1;

export function beginMatch(cfg) {
  const orig = cfg; cfg = resolveObs(cfg);
  // Gegen den Computer zählt nur das eigene Level, zu zweit beide; online bringt der Host die Level mit
  if (!cfg.levels && cfg.mode !== "guest" && cfg.mode !== "host") cfg = { ...cfg, levels: [headLevel(cfg.chars[0]), cfg.mode === "local" ? headLevel(cfg.chars[1]) : 1] };
  App.cfg = cfg; App.lastCfg = orig;
  App.mode = cfg.mode;
  App.st = newMatch(cfg);
  App.ai = [null, null];
  if (vsCpu()) App.ai[1] = makeAI(1, cfg.diff ?? 1, !!cfg.keeper);
  App.names = cfg.names; App.labels = cfg.labels; App.ball = cfg.ball || S.ball;
  App.acc = 0; App.paused = false; App.endShown = false; App.rec = []; App.replay = null; App.maxDef = 0; App.goT = -1; App.t0 = Date.now();
  App.snaps = []; App.gp = null; App.outEv = []; App.guestIn = [0, 0, 0, 0, 0, 0, 0, 0]; App.gPend = { j: 0, d: 0 }; App.jug = { i: -1, n: 0 };
  fx.clear();
  showScreen(null);
  I.setLayout(cfg.mode === "local" ? "split" : "single");
  updateBand();
  $("gameBtns").hidden = false;
  $("btnEmote").hidden = cfg.mode === "local";
  $("emoteBar").hidden = true;
  document.body.classList.add("ingame");
  A.music(false); A.crowd(0.3);
  A.sfx("count");
  if (I.isTouch) goFullscreen();
  if (!S.tutorial) { tutorial(); S.tutorial = true; save(); }
}

export function tutorial() {
  const lines = I.isTouch
    ? ["Links ziehen = laufen, nach oben ziehen = springen", "Links nach unten: Grätsche, in der Luft Arschbombe", "Rechts tippen = Schuss, halten und loslassen = Powerschuss"]
    : ["A/D laufen · W springen (kurz = halb hoch)", "S: Grätsche, in der Luft Arschbombe", "Leertaste halten und loslassen = Powerschuss"];
  lines.forEach((t, n) => setTimeout(() => toast(t, "i-ball"), 300 + n * 1500));
}

export function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(() => { try { screen.orientation.lock("landscape").catch(() => {}); } catch (_) {} }).catch(() => {});
}

export function updateBand() {
  const ig = ["cpu", "cup", "local", "host", "guest", "endless", "daily", "train"].includes(App.mode);
  setBand(I.isTouch && ig ? (App.mode === "local" ? 92 : 104) : 0);
}

export function quitToMenu() {
  if (App.mode === "host" || App.mode === "guest") Net.close();
  App.run = null; App.mm = null;
  document.body.classList.remove("ingame");
  $("gameBtns").hidden = true;
  A.crowdOff(); A.music(true, "menu");
  startDemo();
  updateBand();
  App.stack = [];
  showScreen("home", true);
}

export function pause(on) {
  if (!inGame() && on) return;
  const online = App.mode === "host" || App.mode === "guest";
  App.paused = on && !online;
  if (on) {
    $("btnRestart").hidden = online || ["cup", "endless", "daily"].includes(App.mode);
    $("btnQuit").textContent = online ? "Spiel verlassen" : App.mode === "train" ? "Training beenden" : App.mode === "cup" ? "Cup aufgeben" : "Aufgeben";
    $$(".screen").forEach(s => s.hidden = s.id !== "scr-pause"); App.screen = "pause"; $("touch").hidden = true;
    A.crowd(0);
  } else { $("scr-pause").hidden = true; App.screen = null; $("touch").hidden = false; A.crowd(0.3); }
}

export function sendEmote(e) {
  if (!inGame()) return;
  $("emoteBar").hidden = true;
  if (App.mode === "guest") { Net.send({ t: "emo", e }); return; }
  emote(App.st, 0, e);
}
