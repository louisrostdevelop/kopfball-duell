// Spiel starten, pausieren und beenden; Demo im Hintergrund
import { ARENAS, CHARS } from "../content/config.js";
import { layoutsFor } from "../content/layouts.js";
import { makeAI } from "../core/ai.js";
import { emote, newMatch, skipCelebration } from "../core/physics.js";
import { rbEmote, rbSkip, stopRb } from "./rbnet.js";
import { S, save } from "./profile.js";
import { fx, setBand, setMatchCos, setMuted } from "../ui/render/render.js";
import { cosById } from "../content/cosmetics.js";
import { emoteSlots, myCos } from "./cosmetics.js";
import { clearSession } from "./session.js";
import { App, inGame, PLAY_MODES, vsCpu } from "./state.js";
import { $, $$, toast } from "../ui/dom.js";
import { showScreen } from "../ui/nav.js";
import { audio as A, input as I, net as Net } from "./services.js";
import { t } from "../content/i18n.js";

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
  App.stillKey = null;   // Standbild neu zeichnen
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
  // Kosmetik: eigene aus der Ausrüstung, online bringt der Host beide mit, der Computer trägt nichts
  if (!cfg.cos) cfg = { ...cfg, cos: [myCos(), {}] };
  App.cfg = cfg; App.lastCfg = orig;
  App.mode = cfg.mode;
  App.st = newMatch(cfg);
  App.ai = [null, null];
  if (vsCpu()) App.ai[1] = makeAI(1, cfg.diff ?? 1, !!cfg.keeper);
  App.names = cfg.names; App.labels = cfg.labels; App.ball = cfg.ball || S.ball;
  App.acc = 0; App.paused = false; App.endShown = false; App.rec = []; App.replay = null; App.maxDef = 0; App.goT = -1; App.t0 = Date.now();
  App.rb = null;   // Rollback startet online.js nach dem Anpfiff, sonst klassisch
  App.snaps = []; App.evQ = []; App.rematchWanted = false; App.gp = null; App.outEv = []; App.guestIn = [0, 0, 0, 0, 0, 0, 0, 0]; App.gPend = { j: 0, d: 0 }; App.jug = { i: -1, n: 0 };
  fx.clear();
  const me = cfg.mode === "guest" ? 1 : 0;
  setMatchCos(cfg.cos, [0, 1].map(i => i !== me && cfg.mode !== "local" && !!S.muteOpp));
  App.emoT = 0;
  buildEmoteBar();
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
    ? [t("tut.touch.0"), t("tut.touch.1"), t("tut.touch.2")]
    : [t("tut.keys.0"), t("tut.keys.1"), t("tut.keys.2")];
  lines.forEach((line, n) => setTimeout(() => toast(line, "i-ball"), 300 + n * 1500));
}

// Vollbild: Standard-API, auf älteren iPads mit webkit-Präfix. Das iPhone kann im Browser kein Vollbild für Seiten
// (nur für Videos); dort hilft nur „Zum Home-Bildschirm“, dann startet das Spiel als App ohne Browserleisten.
export const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
export const canFullscreen = () => {
  const d = document, el = d.documentElement;
  if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return false;
  // erlaubt der Browser es überhaupt? (iPhone: Methode vorhanden, aber nur für Videos; ohne Angabe: Methode zählt)
  return d.fullscreenEnabled === undefined && d.webkitFullscreenEnabled === undefined ? true : !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
};
export function toggleFullscreen() { if (fullscreenElement()) exitFullscreen(); else goFullscreen(); }
export function goFullscreen() {
  const el = document.documentElement;
  if (fullscreenElement()) return;
  const lock = () => { try { screen.orientation.lock("landscape").catch(() => {}); } catch (_) { /* nicht unterstützt */ } };
  if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(lock).catch(() => {});
  else if (el.webkitRequestFullscreen) { try { el.webkitRequestFullscreen(); lock(); } catch (_) { /* abgelehnt */ } }
}
export function exitFullscreen() {
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}

export function updateBand() {
  const ig = PLAY_MODES.includes(App.mode);
  setBand(I.isTouch && ig ? (App.mode === "local" ? 92 : 104) : 0);
}

/** Torjubel überspringen (Tippen, Leertaste): online mit Rollback als Eingabe, sonst direkt */
export function skipGoal() { if (App.rb) rbSkip(); else skipCelebration(App.st); }

export function quitToMenu() {
  stopRb();
  if (App.mode === "host" || App.mode === "guest") { Net.send({ t: "bye" }); Net.close(250); }   // „bye“: die andere Seite wartet nicht aufs Wiederverbinden
  clearSession();   // bewusst verlassen: beim nächsten Start nicht zurückverbinden
  App.netLost = null; App.lastRx = 0; App.netWait = null;
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
    $("btnRestart").hidden = online || ["cup", "career", "endless", "daily"].includes(App.mode);
    $("btnQuit").textContent = t(online ? "pause.leave" : App.mode === "train" ? "pause.endTraining" : App.mode === "cup" ? "pause.quitCup" : App.mode === "career" ? "pause.quitCareer" : "pause.quit");
    $$(".screen").forEach(s => s.hidden = s.id !== "scr-pause"); App.screen = "pause"; $("touch").hidden = true;
    A.crowd(0);
  } else { $("scr-pause").hidden = true; App.screen = null; $("touch").hidden = false; A.crowd(0.3); }
}

// Emotes: höchstens eins alle 3 Sekunden
export const EMOTE_GAP = 3;
export function sendEmote(e) {
  if (!inGame()) return;
  $("emoteBar").hidden = true;
  const now = performance.now() / 1000;
  if (now - (App.emoT || 0) < EMOTE_GAP) return;
  App.emoT = now;
  if (App.rb) { rbEmote(e); return; }   // Rollback: Emote reist mit den Eingaben
  if (App.mode === "guest") { Net.send({ t: "emo", e }); return; }
  emote(App.st, 0, e);
}
/** Emote-Leiste aus den 4 ausgerüsteten Plätzen, dazu Gegner stummschalten */
export function buildEmoteBar() {
  const bar = $("emoteBar"); bar.innerHTML = "";
  emoteSlots().forEach((e, n) => {
    const b = document.createElement("button"), c = cosById(e);
    b.textContent = c ? (c.kind === "emoji" ? c.glyph : c.ic) : e; b.title = t("hud.emoteKey", { n: n + 1 }); b.onclick = () => sendEmote(e);
    bar.append(b);
  });
  const m = document.createElement("button"); m.className = "mute"; m.textContent = S.muteOpp ? "🔇" : "🔈"; m.title = t("hud.muteOpp");
  m.onclick = () => {
    S.muteOpp = !S.muteOpp; save(); m.textContent = S.muteOpp ? "🔇" : "🔈";
    const me = App.mode === "guest" ? 1 : 0; setMuted([0, 1].map(i => i !== me && !!S.muteOpp));
    toast(t(S.muteOpp ? "hud.muted" : "hud.unmuted"), "i-chat");
  };
  bar.append(m);
}
