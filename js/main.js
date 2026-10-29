// Kopfball Duell – Ablauf, Menüs, Modi, Online, Fortschritt
import { W, G, GOAL_W, CHARS, ARENAS, BALLS, SUPERS, POWERUPS, MODS, DIFFS, ACHIEVEMENTS, EMOTES, COL, MODES, RULE_OPTS, RULE_PRESETS, RARITY, rarityOf, charById, arenaById, clamp } from "./config.js";
import { newMatch, advance, emote, skipCelebration, predictPlayer, REPLAY_START, REPLAY_END, fireSuper, DEFAULT_RULES } from "./physics.js";
import { initRender, render, fx, setQuality, arenaThumb, resize, setBand } from "./render.js";
import { avatarCanvas, drawBall, drawHead } from "./art.js";
import * as A from "./audio.js";
import * as I from "./input.js";
import { makeAI, aiInput } from "./ai.js";
import * as Net from "./net.js";
import { S, save, reset as resetSave, addXP, addCoins, xpFor, owns, buy, dailyCheck, checkAch, achProgress, tasks, taskProgress, challenge, challengeDone, deal, buyDeal } from "./store.js";

const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const VERSION = 3;
const PHRASES = ["WAS FÜR EIN DING!", "UNHALTBAR!", "DRIN DAS DING!", "DER SASS!", "EISKALT!", "SAUBER!", "KEINE CHANCE!", "WIE GEMALT!"];
const CELEB = { kalle: "🔥", yuki: "❄️", bolt: "⚡", rocco: "🚀", nala: "🍌", flummi: "🎈", phantom: "👻", tank: "💪", tina: "🌪️", magnus: "🧲", max: "☄️", kaiser: "👑" };
const RCOL = { basis: "var(--r-basis)", selten: "var(--r-selten)", episch: "var(--r-episch)", legend: "var(--r-legend)" };
const svg = id => `<svg><use href="#${id}"/></svg>`;

const App = {
  mode: "demo", st: null, ai: [null, null], cfg: null, acc: 0, paused: false, endShown: false,
  names: ["", ""], labels: [null, null], ball: "klassik", goT: -1,
  rec: [], replay: null, maxDef: 0, screen: "home", stack: [],
  run: null, local2: null, series: {}, lastCfg: null, jug: { i: -1, n: 0 },
  opp: null, guestIn: [0, 0, 0, 0, 0], sendT: 0, outEv: [], snaps: [], gp: null, lastIn: "", inT: 0, pingT: 0, rtt: 0, netCfg: null, mid: 0,
};
const inGame = () => ["cpu", "cup", "local", "host", "guest", "endless", "daily", "train"].includes(App.mode) && App.screen === null;
const vsCpu = () => ["cpu", "cup", "endless", "daily", "train"].includes(App.mode);

// ========================================================================
// Start
// ========================================================================
function boot() {
  initRender($("cv"));
  setQuality(S.quality);
  A.setSfx(S.sfx); A.setMusic(S.music); I.setVibration(S.vib);
  I.initInput({ inGame: () => inGame(), onKey, onPadButton: onPad, onTouch: () => { A.unlock(); updateBand(); } });
  wireUI();
  startDemo();
  showScreen("home", true);
  requestAnimationFrame(loop);
  const unlockOnce = () => { A.unlock(); if (!inGame()) A.music(true, "menu"); window.removeEventListener("pointerdown", unlockOnce); window.removeEventListener("keydown", unlockOnce); };
  window.addEventListener("pointerdown", unlockOnce); window.addEventListener("keydown", unlockOnce);
  const fontsReady = document.fonts ? Promise.all(["400 20px 'Lilita One'", "800 20px Nunito", "900 20px Nunito"].map(f => document.fonts.load(f).catch(() => {}))) : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]).then(() => {
    $("loading").classList.add("done"); resize(); homeScreen();
    const d = dailyCheck();
    if (d) setTimeout(() => dailyModal(d), 500);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone;
    if (ios && !S.iosHint) setTimeout(() => { toast("Tipp: Teilen → „Zum Home-Bildschirm“ für Vollbild"); S.iosHint = true; save(); }, d ? 6000 : 2500);
    // Einladungslink: ?join=CODE (alte Links mit #CODE gehen auch)
    const qs = new URLSearchParams(location.search).get("join") || "";
    const h = /^[A-Za-z0-9]{4}$/.test(qs) ? qs : (location.hash || "").slice(1);
    if (/^[A-Za-z0-9]{4}$/.test(h)) { history.replaceState(null, "", location.pathname); $("codeIn").value = h.toUpperCase(); openOnline(); setTimeout(() => tryJoin(h), 400); }
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__kd = App; window.__kdFire = fireSuper; // für Tests
}

// ========================================================================
// Spielablauf
// ========================================================================
function startDemo() {
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
function beginMatch(cfg) {
  App.cfg = cfg; App.lastCfg = cfg;
  App.mode = cfg.mode;
  App.st = newMatch(cfg);
  App.ai = [null, null];
  if (vsCpu()) App.ai[1] = makeAI(1, cfg.diff ?? 1, !!cfg.keeper);
  App.names = cfg.names; App.labels = cfg.labels; App.ball = cfg.ball || S.ball;
  App.acc = 0; App.paused = false; App.endShown = false; App.rec = []; App.replay = null; App.maxDef = 0; App.goT = -1;
  App.snaps = []; App.gp = null; App.outEv = []; App.guestIn = [0, 0, 0, 0, 0]; App.jug = { i: -1, n: 0 };
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
function tutorial() {
  const lines = I.isTouch
    ? ["Links ziehen = laufen, hoch wischen = springen", "Schuss halten und loslassen = Powerschuss", "Leiste voll? SUPER drücken!"]
    : ["A/D laufen · W springen · S schießen", "Leertaste halten und loslassen = Powerschuss", "Leiste voll? E für deinen Super!"];
  lines.forEach((t, n) => setTimeout(() => toast(t, "i-ball"), 300 + n * 1500));
}
function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(() => { try { screen.orientation.lock("landscape").catch(() => {}); } catch (_) {} }).catch(() => {});
}
function updateBand() {
  const ig = ["cpu", "cup", "local", "host", "guest", "endless", "daily", "train"].includes(App.mode);
  setBand(I.isTouch && ig ? (App.mode === "local" ? 92 : 104) : 0);
}
function quitToMenu() {
  if (App.mode === "host" || App.mode === "guest") Net.close();
  App.run = null;
  document.body.classList.remove("ingame");
  $("gameBtns").hidden = true;
  A.crowdOff(); A.music(true, "menu");
  startDemo();
  updateBand();
  App.stack = [];
  showScreen("home", true);
}

// ---------- Schleife ----------
let lastT = performance.now(), simT = 0, perf = { t: 0, n: 0, slow: 0 };
function loop(now) {
  const raw = (now - lastT) / 1000;
  const dt = Math.min(0.05, raw); lastT = now; simT += dt;
  if (S.quality === "high" && inGame() && raw < 0.5) {
    perf.t += raw; perf.n++;
    if (perf.t > 3) { if (perf.n / perf.t < 42) { perf.slow++; if (perf.slow >= 2) { S.quality = "low"; save(); setQuality("low"); toast("Grafik auf „Schnell“ gestellt, damit es flüssig läuft"); } } else perf.slow = 0; perf.t = 0; perf.n = 0; }
  }
  I.pollPads();
  const st = App.st;
  const rotated = I.isTouch && window.innerHeight > window.innerWidth && inGame();
  $("rotate").hidden = !rotated;
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
  const labels = (App.labels || []).map(t => t ? { t, a: la } : null);
  if (App.screen !== "home" || App.mode !== "demo" || !document.hidden) render(st, simT, { dt, names: App.names, labels, ballSkin: App.ball, replay, replayFrac: frac, noHud: App.mode === "demo", canSkip: App.mode !== "guest", series: seriesText(), modName: st.mod ? (MODS.find(m => m.id === st.mod) || {}).name : "" });
  if (App.mode !== "demo") I.touchHud(App.mode === "guest" && App.gp ? { p: [st.p[0], Object.assign({}, st.p[1], { charge: App.gp.charge })] } : st);
  if (st.ph === "end" && !App.endShown) { App.endShown = true; if (App.mode === "demo") setTimeout(startDemo, 1500); else setTimeout(matchEnd, 900); }
  if (App.mode === "demo" && st.ph === "goal" && st.pt < 3.0) st.pt = Math.min(st.pt, 0.5);
  if (App.screen === "home") drawShowcase(dt);
  requestAnimationFrame(loop);
}
function gatherInputs(dt) {
  const st = App.st;
  if (App.mode === "demo") return [aiInput(App.ai[0], st, dt), aiInput(App.ai[1], st, dt)];
  if (vsCpu()) return [I.getInput(0, "single"), aiInput(App.ai[1], st, dt)];
  if (App.mode === "local") return [I.getInput(0, "local"), I.getInput(1, "local")];
  if (App.mode === "host") { const g = App.guestIn; return [I.getInput(0, "single"), { l: !!g[0], r: !!g[1], j: !!g[2], k: !!g[3], s: !!g[4] }]; }
  return [{}, {}];
}
function myIdx() { return App.mode === "guest" ? 1 : App.mode === "local" || App.mode === "demo" ? -1 : 0; }
function isHuman(i) { if (App.mode === "local") return true; if (App.mode === "demo") return false; return i === myIdx(); }
function snap(st) {
  return { arena: st.arena, s: st.s, t: st.t, ph: st.ph, gold: st.gold, mod: st.mod, rules: st.rules, wind: st.wind, wall: [...st.wall], bigGoal: [...st.bigGoal], pu: st.pu.map(u => ({ ...u })), b: { ...st.b }, p: st.p.map(p => ({ ...p })) };
}

// ---------- Effekte zu Ereignissen ----------
function onEvent(e, remote) {
  const demo = App.mode === "demo", st = App.st;
  const snd = (k, v) => { if (!demo) A.sfx(k, v); };
  switch (e.t) {
    case "go": if (st.s[0] + st.s[1] === 0 && App.goT < 0) App.goT = simT; snd(st.gold ? "whistle1" : "go"); if (!demo && st.s[0] + st.s[1] === 0 && !st.gold) snd("whistle1"); break;
    case "jump": if (remote && e.i === myIdx()) break; fx.burst("dust", e.x, e.y, { n: e.dbl ? 10 : 4 }); if (e.dbl) fx.burst("pu", e.x, e.y, { col: POWERUPS.dbljump.col }); snd("jump"); break;
    case "land": fx.burst("dust", e.x, e.y, { n: 6 }); snd("land"); break;
    case "swing": if (remote && e.i === myIdx()) break; snd("swing"); break;
    case "kick": {
      if (App.jug.n >= 3 && App.jug.i === e.i) fx.burst("text", e.x, e.y - 70, { text: "VOLLEY!", col: COL.gold, size: 30 });
      App.jug.n = 0;
      const kp = st.p[e.i], dir = kp ? kp.dir : 1;
      fx.burst("kick", e.x, e.y, { pow: e.pow, dir }); snd("kick", e.pow); fx.shake(2 + 8 * (e.pow - 1));
      fx.ballHit(Math.atan2(st.b.vy, st.b.vx), 0.4 + (e.pow - 1));
      if (kp) fx.swoosh(e.x - dir * 20, e.y, dir, e.pow);
      if (e.pow > 1.3) fx.punch(0.02 + 0.03 * (e.pow - 1));
      if (e.c > 0.85 && e.q > 0.75) { fx.burst("text", e.x, e.y - 46, { text: "VOLLTREFFER!", col: COL.gold, size: 30 }); fx.shake(7); }
      else if (e.pow > 1.5) fx.burst("text", e.x, e.y - 40, { text: "WUMMS!", col: COL.gold, size: 28 });
      if (isHuman(e.i)) I.vibrate(e.pow > 1.4 ? 30 : 12);
      break;
    }
    case "head": {
      fx.burst("head", e.x, e.y); snd("head", e.pow || 1); if (e.v > 700) fx.shake(3);
      fx.squash(e.i); fx.ballHit(Math.atan2(st.b.vy, st.b.vx), 0.5);
      if ((e.pow || 1) > 1.3) { fx.burst("text", e.x, e.y - 50, { text: "POWER-KOPFBALL!", col: COL.gold, size: 24 }); fx.shake(5); fx.punch(0.02); }
      const j = App.jug; if (j.i === e.i) j.n++; else { j.i = e.i; j.n = 1; }
      if (j.n >= 3) { fx.burst("text", e.x, e.y - 50, { text: j.n + "x JONGLIERT!", col: j.n >= 5 ? COL.gold : "#fff", size: 22 + Math.min(14, j.n * 2) }); if (j.n === 5 || j.n === 8) snd("full"); }
      break;
    }
    case "bounce": App.jug.n = 0; if (e.v > 300) fx.ballHit(Math.PI / 2, e.v / 1400); if (e.v > 400) fx.burst("dust", e.x, e.y, { n: 4, col: "rgba(255,255,255,.35)" }); snd("bounce", e.v); break;
    case "post": fx.bar(e.x < W / 2 ? 0 : 1); fx.burst("post", e.x, e.y); snd("post"); snd("ohh"); fx.shake(7); fx.burst("text", e.x, e.y - 30, { text: "LATTE!", col: "#fff", size: 28 }); fx.hype(0.6); break;
    case "goal": onGoal(e); break;
    case "super": {
      const sc = SUPERS[e.k].col;
      fx.burst("super", e.x, e.y, { col: sc }); snd("super"); fx.shake(12); fx.flash(sc, 0.35);
      if (!demo) fx.callout(SUPERS[e.k].name.toUpperCase(), sc, "", 1.0, 0.6);
      if (isHuman(e.i)) I.vibrate(60);
      break;
    }
    case "arm": snd("arm"); { const p = st.p[e.i]; fx.burst("text", p.x, p.y - 90, { text: "SUPER BEREIT", col: COL.gold, size: 22 }); } break;
    case "full": if (isHuman(e.i) || App.mode === "local") { snd("full"); const p = st.p[e.i]; fx.burst("text", p.x, p.y - 80, { text: "SUPER!", col: COL.gold, size: 26 }); } break;
    case "launch": snd("launch"); break;
    case "zap": fx.burst("zap", e.x, e.y); snd("zap"); break;
    case "pu": fx.burst("pu", e.x, e.y, { col: POWERUPS[e.k].col }); snd("pu"); fx.burst("text", e.x, e.y - 40, { text: POWERUPS[e.k].name.toUpperCase(), col: POWERUPS[e.k].col, size: 24 }); if (isHuman(e.i)) I.vibrate(25); break;
    case "puSpawn": snd("puSpawn"); break;
    case "freeze": fx.burst("freeze", e.x, e.y); snd("freeze"); break;
    case "burn": snd("burn"); fx.shake(9); break;
    case "stomp": fx.burst("stomp", e.x, e.y); snd("stomp"); fx.burst("text", e.x, e.y - 30, { text: "BOING!", col: "#fff", size: 28 }); break;
    case "quake": fx.burst("quake", e.x, e.y); snd("quake"); fx.shake(22); break;
    case "save": snd("head"); fx.burst("text", e.x, e.y - 40, { text: "PARADE!", col: "#8ef3ff", size: 28 }); fx.hype(0.4); break;
    case "wallhit": snd("wallhit"); fx.burst("post", e.x, e.y); break;
    case "charged": if (isHuman(e.i) || App.mode === "local") snd("charged"); break;
    case "ten": if (!demo) { fx.callout("10 SEK!", "#ff5a5a", "", 1.1, 0.55); snd("tick"); } break;
    case "golden": snd("whistle"); fx.hype(0.8); break;
    case "end": snd("whistle"); fx.hype(1); break;
    case "emote": snd("emote"); break;
    case "bump": fx.burst("stomp", e.x, e.y); snd("bump", e.pow); fx.shake(3 + 4 * (e.pow - 1)); if (e.pow > 1.6) fx.burst("text", e.x, e.y - 40, { text: "SCHUBS!", col: "#fff", size: 24 }); if (isHuman(1 - e.i)) I.vibrate(20); break;
    case "pop": fx.burst("dust", e.x, e.y + 10, { n: 10 }); snd("pop"); break;
  }
}
function onGoal(e) {
  const st = App.st, demo = App.mode === "demo";
  const side = e.i === 0 ? 1 : 0;
  const gx = side ? W - GOAL_W / 2 : GOAL_W / 2;
  fx.burst("goal", gx, Math.min(e.y, G - 60), { col: [COL.p1, COL.p2][e.i] });
  fx.net(side, e.y, 1.4);
  fx.shake(24); fx.flash([COL.p1, COL.p2][e.i], 0.45); fx.hype(1);
  App.replay = App.rec.slice(-160);
  if (!demo) A.sfx("goal");
  if (isHuman(e.i)) I.vibrate([60, 40, 120]);
  let text = "TOR!";
  if (e.gold) text = "GOLDEN GOAL!";
  else if (e.kind === "own") text = "EIGENTOR!";
  else if (e.lastSec) text = "LAST SECOND!";
  else if (e.kind === "super") text = "SUPERTOR!";
  else if (e.long) text = "TRAUMTOR!";
  else if (e.kind === "head") text = "KOPFBALLTOR!";
  let sub;
  if (st.stats[e.i].goals === 3 && e.kind !== "own") sub = "HATTRICK!";
  else if (e.s[0] === e.s[1]) sub = "AUSGLEICH!";
  else if (Math.abs(e.s[0] - e.s[1]) === 1 && e.s[e.i] > e.s[1 - e.i]) sub = "FÜHRUNG!";
  else sub = Math.random() < 0.5 ? (App.names[e.i] || "").toUpperCase() : PHRASES[Math.floor(Math.random() * PHRASES.length)];
  if (!demo) fx.callout(text, [COL.p1, COL.p2][e.i], sub, 1.9, text.length > 9 ? 0.82 : 1);
  if (App.mode !== "guest" && e.kind !== "own") { const sc = st.p[e.i]; setTimeout(() => { if (App.st === st) emote(st, e.i, CELEB[sc.ch] || "🔥"); }, 350); }
  if (vsCpu() && e.i === 0 && Math.random() < 0.6) setTimeout(() => { if (App.st === st) emote(st, 1, ["😤", "😤", "🤡", "GG"][Math.floor(Math.random() * 4)]); }, 1100);
}

// ========================================================================
// Online
// ========================================================================
function packState(st) {
  const r = v => Math.round(v * 10) / 10;
  const P = p => ({ x: r(p.x), y: r(p.y), vx: r(p.vx), vy: r(p.vy), kick: r(p.kick * 100) / 100, kHeld: p.kHeld, charge: r(p.charge), sc: r(p.sc * 100) / 100, frz: r(p.frz), stun: r(p.stun), meter: Math.round(p.meter), full: p.full, armed: r(p.armed), fireNext: p.fireNext, bigT: r(p.bigT), miniT: r(p.miniT), spdT: r(p.spdT), jmpT: r(p.jmpT), mood: p.mood, emo: p.emo, emoT: r(p.emoT), land: r(p.land), onG: p.onG, confT: r(p.confT), djT: r(p.djT) });
  const b = st.b;
  return {
    s: st.s, t: r(st.t), ph: st.ph, pt: r(st.pt), gold: st.gold, wall: st.wall.map(r), bigGoal: st.bigGoal.map(r), wind: { t: r(st.wind.t), dir: st.wind.dir },
    pu: st.pu.map(u => ({ id: u.id, k: u.k, x: r(u.x), y: r(u.y), t: r(u.t) })),
    b: { x: r(b.x), y: r(b.y), vx: r(b.vx), vy: r(b.vy), r: r(b.r), a: r(b.a), fx: b.fx, fxT: r(b.fxT), fxK: b.fxK, fxBX: r(b.fxBX), fxBY: r(b.fxBY), fxDX: r(b.fxDX), fxDY: r(b.fxDY), fxTX: r(b.fxTX || 0), fxTY: r(b.fxTY || 0), alpha: r(b.alpha), fxP: b.fxP },
    p: st.p.map(P), stats: st.stats,
  };
}
function hostSend(dt) {
  if (!Net.isOpen()) return;
  App.sendT += dt;
  if (App.sendT >= 1 / 30) { App.sendT = 0; Net.send({ t: "s", mid: App.mid, s: packState(App.st), ev: App.outEv.splice(0).filter(e => e.t !== "bounce" || e.v > 400) }); }
}
function guestFrame(dt, now) {
  const st = App.st;
  const me = I.getInput(1, "single");
  const iv = [me.l, me.r, me.j, me.k, me.s].map(v => (v ? 1 : 0)), key = iv.join("");
  App.inT += dt;
  if (key !== App.lastIn || App.inT > 0.15) { App.lastIn = key; App.inT = 0; Net.send({ t: "i", i: iv }); }
  App.pingT += dt; if (App.pingT > 2) { App.pingT = 0; Net.send({ t: "ping", c: performance.now() }); }
  const S2 = App.snaps;
  if (!S2.length) return;
  const rt = now - 80;
  while (S2.length > 2 && S2[1].at <= rt) S2.shift();
  const a = S2[0], b = S2[1] || S2[0];
  const k = b === a ? 1 : clamp((rt - a.at) / (b.at - a.at), 0, 1.3);
  applySnap(st, a.s, b.s, k);
  const sp = b.s.p[1];
  if (!App.gp) App.gp = Object.assign({}, st.p[1]);
  const gp = App.gp;
  ["sc", "frz", "stun", "bigT", "miniT", "spdT", "jmpT", "armed", "confT", "djT"].forEach(f => gp[f] = sp[f]);
  predictPlayer(st, gp, me, dt);
  const lat = Math.min(0.25, App.rtt / 2000 + 0.08);
  const tx = sp.x + sp.vx * lat, ty = sp.y + sp.vy * lat * 0.5;
  const ex = tx - gp.x, ey = ty - gp.y;
  if (Math.abs(ex) > 140 || Math.abs(ey) > 160 || st.ph !== "play") { gp.x += ex * 0.35; gp.y += ey * 0.35; }
  else { gp.x += ex * 0.08; gp.y += ey * (gp.onG && sp.onG ? 0.3 : 0.06); }
  Object.assign(st.p[1], { x: gp.x, y: gp.y, kick: Math.max(gp.kick, sp.kick), kHeld: gp.kHeld, charge: gp.charge, onG: gp.onG });
}
function applySnap(st, a, b, k) {
  const L = (x, y) => x + (y - x) * k;
  st.s = b.s; st.t = b.t; st.ph = b.ph; st.pt = b.pt; st.gold = b.gold; st.wall = b.wall; st.bigGoal = b.bigGoal; if (b.wind) st.wind = b.wind; st.pu = b.pu; st.stats = b.stats;
  const jump = Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) > 200;
  Object.assign(st.b, b.b);
  if (!jump) { st.b.x = L(a.b.x, b.b.x); st.b.y = L(a.b.y, b.b.y); st.b.a = L(a.b.a, b.b.a); }
  [0, 1].forEach(i => { const pa = a.p[i], pb = b.p[i], p = st.p[i]; Object.assign(p, pb); if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 200) { p.x = L(pa.x, pb.x); p.y = L(pa.y, pb.y); } });
}

function openOnline() { $("nameIn").value = S.name || ""; netNote(""); showScreen("online"); }
function hostGame() {
  if (!Net.available()) { netNote("Online-Modus konnte nicht geladen werden. Prüf deine Internetverbindung.", true); return; }
  saveName($("nameIn").value);
  App.opp = null;
  App.netCfg = { arena: owns("arenas", S.arena) ? S.arena : "stadion", dur: S.dur, rules: { ...S.rules } };
  $("lobbyCode").textContent = "····"; $("lobbyLink").textContent = ""; $("qrBox").innerHTML = "";
  lobbyUI("host");
  $("lobbyNote").textContent = "Raum wird geöffnet…";
  showScreen("lobby");
  setTimeout(() => { if (App.screen === "lobby" && $("lobbyCode").textContent === "····") $("lobbyNote").textContent = "Der Online-Server antwortet gerade nicht. Prüf deine Verbindung und versuch es nochmal."; }, 9000);
  Net.host({
    onReady: code => {
      const link = location.origin + location.pathname + "?join=" + code.toUpperCase();
      $("lobbyCode").textContent = code.toUpperCase(); $("lobbyLink").textContent = link;
      $("lobbyNote").textContent = "Schick den Link. Sobald dein Kumpel ihn öffnet, ist er hier.";
      makeQR(link);
    },
    onConn: () => { $("lobbyNote").textContent = "Verbunden. Gleich geht's los…"; },
    onData: hostData,
    onClose: () => {
      App.opp = null;
      if (inGame() || App.screen === "end" || App.screen === "pause") { toast("Gegner hat die Verbindung verloren"); backToLobby(); }
      lobbyUI("host"); $("lobbyNote").textContent = "Gegner ist weg. Schick den Link nochmal.";
    },
    onError: t => { $("lobbyNote").textContent = "Raum konnte nicht geöffnet werden (" + t + "). Versuch es nochmal."; },
  });
}
function hostData(d) {
  switch (d.t) {
    case "hello":
      App.opp = { name: (d.name || "Gast").slice(0, 12), ch: charById(d.ch).id };
      Net.send({ t: "welcome", name: S.name || "Gastgeber", ch: S.char, cfg: App.netCfg, v: VERSION });
      lobbyUI("host"); A.sfx("coin"); toast(App.opp.name + " ist da!", "i-users");
      break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; lobbyUI("host"); } break;
    case "i": if (Array.isArray(d.i)) App.guestIn = d.i.slice(0, 5); break;
    case "emo": if (App.mode === "host" && App.st && EMOTES.includes(d.e)) emote(App.st, 1, d.e); break;
    case "ping": Net.send({ t: "pong", c: d.c }); break;
    case "rematch": toast((App.opp ? App.opp.name : "Gast") + " will Revanche!", "i-swap"); break;
  }
}
function hostStart() {
  if (!App.opp) return;
  const c = App.netCfg;
  const cfg = { mode: "host", chars: [S.char, App.opp.ch], arena: c.arena, dur: c.dur, rules: c.rules, mod: null, golden: true, names: [S.name || "Du", App.opp.name], labels: ["DU", null], ball: S.ball };
  App.mid++;
  Net.send({ t: "start", mid: App.mid, cfg: { ...cfg, mode: "guest", labels: [null, "DU"] } });
  beginMatch(cfg);
}
function tryJoin(code) {
  code = String(code || $("codeIn").value).trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) { netNote("Der Code hat 4 Zeichen.", true); return; }
  if (!Net.available()) { netNote("Online-Modus lädt noch. Versuch es gleich nochmal.", true); return; }
  saveName($("nameIn").value);
  netNote("Verbinde mit " + code.toUpperCase() + "…");
  Net.join(code, {
    onConn: () => Net.send({ t: "hello", name: S.name || "Gast", ch: S.char, v: VERSION }),
    onData: guestData,
    onClose: () => { if (App.mode === "guest" || App.screen === "lobby" || App.screen === "end") { toast("Gastgeber hat das Spiel verlassen"); quitToMenu(); } },
    onError: (t, wasOk) => {
      if (wasOk) return;
      Net.close();
      const msg = t === "peer-unavailable" ? "Kein Raum mit Code " + code.toUpperCase() + " gefunden." : t === "timeout" ? "Verbindung kam nicht zustande. Manche Netze (Schule, Firma) blockieren das. Mobile Daten helfen oft." : "Verbindung fehlgeschlagen (" + t + ").";
      if (App.screen !== "online") showScreen("online");
      netNote(msg, true);
    },
  });
}
function guestData(d) {
  switch (d.t) {
    case "welcome": App.opp = { name: (d.name || "Gastgeber").slice(0, 12), ch: charById(d.ch).id }; App.netCfg = d.cfg; lobbyUI("guest"); showScreen("lobby"); A.sfx("coin"); break;
    case "cfg": App.netCfg = d.cfg; lobbyUI("guest"); break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; lobbyUI("guest"); } break;
    case "full": Net.close(); showScreen("online"); netNote("Der Raum ist schon voll.", true); break;
    case "start": App.mid = d.mid; beginMatch({ ...d.cfg, mode: "guest", labels: [null, "DU"] }); App.st.ph = "cd"; break;
    case "s":
      if (App.mode !== "guest" || d.mid !== App.mid) break; // alte Pakete vom letzten Spiel ignorieren
      App.snaps.push({ at: performance.now(), s: d.s });
      if (App.snaps.length > 12) App.snaps.shift();
      if (Array.isArray(d.ev)) d.ev.forEach(e => { if (e.t === "goal") App.replay = App.rec.slice(-160); onEvent(e, true); });
      break;
    case "lobby": backToLobby(); break;
    case "pong": App.rtt = performance.now() - d.c; break;
  }
}
function backToLobby() {
  document.body.classList.remove("ingame");
  $("gameBtns").hidden = true;
  A.crowdOff();
  const role = Net.role();
  startDemo(); updateBand();
  lobbyUI(role === "host" ? "host" : "guest");
  App.stack = ["home"];
  showScreen("lobby");
}
function sendNetCfg() { Net.send({ t: "cfg", cfg: App.netCfg }); lobbyUI(Net.role() === "host" ? "host" : "guest"); }
function lobbyUI(role) {
  const host = role === "host";
  $("inviteBox").hidden = !host;
  $("btnLobbyStart").hidden = !host;
  $("btnLobbyStart").disabled = !App.opp;
  $("lobbyOpts").classList.toggle("locked", !host);
  const me = { name: S.name || "Du", ch: S.char };
  const left = host ? me : App.opp, right = host ? App.opp : me;
  const put = (n, p, you) => {
    const av = $("vsAv" + n); av.innerHTML = "";
    if (p) { av.append(avatarCanvas(p.ch, 110, { dir: n ? -1 : 1 })); $("vsName" + n).textContent = p.name + (you ? " (du)" : ""); $("vsCh" + n).textContent = charById(p.ch).name + " · " + SUPERS[charById(p.ch).super].name; }
    else { av.innerHTML = '<span class="wait">?</span>'; $("vsName" + n).textContent = "Warte…"; $("vsCh" + n).textContent = ""; }
  };
  put(0, left, host); put(1, right, !host);
  if (!host) $("lobbyNote").textContent = App.opp ? "Warte, bis " + App.opp.name + " anpfeift." : "Verbinde…";
  else if (App.opp) $("lobbyNote").textContent = App.opp.name + " ist bereit. Anpfiff, wenn du willst!";
  const c = App.netCfg || { arena: S.arena, dur: S.dur, rules: {} };
  seg($("segLobbyArena"), ARENAS.map(a => ({ v: a.id, t: a.name, dis: host && !owns("arenas", a.id) })), c.arena, v => { App.netCfg.arena = v; sendNetCfg(); });
  seg($("segLobbyDur"), [60, 90, 120].map(v => ({ v, t: v + " s", dis: !!(c.rules && c.rules.win) })), c.dur, v => { App.netCfg.dur = v; sendNetCfg(); });
  $("lobbyRulesSum").textContent = rulesSummary(c.rules);
}
function makeQR(link) {
  const box = $("qrBox"); box.innerHTML = "";
  if (!window.qrcode) return;
  try { const q = window.qrcode(0, "M"); q.addData(link); q.make(); const img = new Image(); img.src = q.createDataURL(5, 2); img.alt = "QR-Code zum Beitreten"; box.append(img); } catch (_) {}
}
function netNote(t, err) { const n = $("netNote"); n.textContent = t || "Wenn dein Kumpel dir einen Link geschickt hat, öffne einfach den Link."; n.classList.toggle("err", !!err); }
function saveName(v) { v = String(v || "").trim().slice(0, 12); if (v) { S.name = v; save(); } }

// ========================================================================
// Modi
// ========================================================================
function cpuNames(opp) { return [S.name || "Du", charById(opp).name]; }
function startMode(id) {
  A.sfx("click");
  switch (id) {
    case "quick": setupScreen({ mode: "cpu" }); break;
    case "local": App.local2 = [S.char]; selectScreen({ title: "Spieler 2: Kopf wählen", cur: CHARS.find(c => c.id !== S.char && owns("chars", c.id)).id, p2: true, okText: "Weiter", onDone: id2 => { App.local2[1] = id2; setupScreen({ mode: "local" }); } }); break;
    case "online": openOnline(); break;
    case "cup": startCup(); break;
    case "endless": startEndless(); break;
    case "daily": dailyBriefing(); break;
    case "train": setupScreen({ mode: "train" }); break;
  }
}

// Cup
function startCup() {
  const pool = CHARS.filter(c => c.id !== S.char).sort(() => Math.random() - 0.5);
  const owned = ARENAS.filter(a => owns("arenas", a.id)).map(a => a.id);
  App.run = { kind: "cup", ops: pool.slice(0, 3).map((c, n) => ({ ch: c.id, diff: [1, 2, 3][n], arena: owned[Math.floor(Math.random() * owned.length)] })), round: 0, res: [], done: false };
  runScreen();
}
// Endlos
function startEndless() {
  App.run = { kind: "endless", streak: 0, done: false, next: endlessOpp(0) };
  runScreen();
}
function endlessOpp(n) {
  const pool = CHARS.filter(c => c.id !== S.char);
  return { ch: pool[Math.floor(Math.random() * pool.length)].id, diff: n < 2 ? 1 : n < 5 ? 2 : 3, arena: ARENAS[Math.floor(Math.random() * ARENAS.length)].id };
}
function runScreen() {
  const r = App.run, br = $("bracket"); br.innerHTML = "";
  const btn = $("btnRunNext");
  if (r.kind === "cup") {
    $("runTitle").textContent = "Kopfball-Cup";
    const titles = ["Viertelfinale", "Halbfinale", "Finale"];
    r.ops.forEach((o, n) => {
      const d = document.createElement("div"); d.className = "round";
      const res = r.res[n];
      if (n === r.round && !r.done) d.classList.add("now");
      if (res) d.classList.add(res.win ? "won" : "lost");
      d.innerHTML = `<small>${titles[n]}</small>`;
      d.append(avatarCanvas(o.ch, 76, { dir: -1, mood: res ? (res.win ? "sad" : "happy") : "" }));
      d.insertAdjacentHTML("beforeend", `<b>${charById(o.ch).name}</b><em>${DIFFS[o.diff].name} · ${arenaById(o.arena).name}</em>` + (res ? `<span class="res">${res.s[0]} : ${res.s[1]}</span>` : ""));
      br.append(d);
    });
    const tr = document.createElement("div"); tr.className = "round trophy" + (r.done && r.round >= 3 ? " won" : ""); tr.innerHTML = svg("i-trophy") + "<b>Pokal</b><em>+300</em>"; br.append(tr);
    if (r.done) { $("runNote").textContent = r.round >= 3 ? "Pokalsieger!" : "Ausgeschieden. Nächstes Mal!"; btn.textContent = "Zurück"; }
    else { $("runNote").textContent = `${titles[r.round]} gegen ${charById(r.ops[r.round].ch).name}`; btn.textContent = r.round === 0 ? "Los geht's" : "Nächstes Spiel"; }
  } else {
    $("runTitle").textContent = "Endlos";
    const cur = document.createElement("div"); cur.className = "round";
    cur.innerHTML = `<small>Siege am Stück</small><span class="streakbig">${r.streak}</span><em>Rekord: ${Math.max(S.endlessBest, r.streak)}</em>`;
    br.append(cur);
    if (!r.done) {
      const o = r.next, d = document.createElement("div"); d.className = "round now";
      d.innerHTML = "<small>Nächster Gegner</small>";
      d.append(avatarCanvas(o.ch, 76, { dir: -1 }));
      d.insertAdjacentHTML("beforeend", `<b>${charById(o.ch).name}</b><em>${DIFFS[o.diff].name} · ${arenaById(o.arena).name} · Erster bis 3</em>`);
      br.append(d);
      $("runNote").textContent = r.streak ? "Weiter so!" : "Wie viele Siege schaffst du am Stück?";
      btn.textContent = r.streak ? "Nächstes Spiel" : "Los geht's";
    } else { $("runNote").textContent = `Aus nach ${r.streak} ${r.streak === 1 ? "Sieg" : "Siegen"}.`; btn.textContent = "Zurück"; }
  }
  App.stack = ["home"];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-run"); App.screen = "run"; $("touch").hidden = true; $("gameBtns").hidden = true;
  document.body.classList.remove("ingame");
  if (App.mode !== "demo") { startDemo(); updateBand(); A.crowdOff(); A.music(true, "menu"); }
}
function runNext() {
  const r = App.run; A.sfx("click");
  if (!r || r.done) { App.run = null; quitToMenu(); return; }
  if (r.kind === "cup") { const o = r.ops[r.round]; beginMatch({ mode: "cup", chars: [S.char, o.ch], arena: o.arena, dur: 60, rules: {}, golden: true, diff: o.diff, names: cpuNames(o.ch), labels: ["DU", null], ball: S.ball }); }
  else { const o = r.next; beginMatch({ mode: "endless", chars: [S.char, o.ch], arena: o.arena, dur: 90, rules: { win: 3 }, golden: true, diff: o.diff, names: cpuNames(o.ch), labels: ["DU", null], ball: S.ball }); }
}
// Tages-Challenge
function dailyChallenge() {
  const c = challenge();
  if (c.opp === S.char) c.opp = CHARS[(CHARS.findIndex(x => x.id === c.opp) + 1) % CHARS.length].id;
  return c;
}
function dailyBriefing() {
  const c = dailyChallenge(), o = charById(c.opp);
  const lines = [`Gegner: <b>${o.name}</b> (${DIFFS[c.diff].name})`, `Arena: <b>${arenaById(c.arena).name}</b>`, `Regeln: <b>${c.presetName}</b>${c.rules.win ? `, Erster bis ${c.rules.win}` : ", 60 Sekunden"}`];
  modal({ title: "Tages-Challenge", icon: "i-cal", body: `<div class="briefav"></div><p>${lines.join("<br>")}</p><p>${c.done ? "Heute schon geschafft. Du kannst trotzdem spielen." : `Sieg bringt <b>+${c.reward}</b> Münzen.`}</p>`, btn: "Anpfiff", onOk: () => beginMatch({ mode: "daily", chars: [S.char, c.opp], arena: c.arena, dur: c.dur, rules: c.rules, golden: true, diff: c.diff, names: cpuNames(c.opp), labels: ["DU", null], ball: S.ball }), cancel: "Später" });
  const box = document.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.opp, 110, { dir: -1, mood: "angry" }));
}

// ========================================================================
// Spielende und Belohnungen
// ========================================================================
function seriesKey() {
  if (App.mode === "local") return "local";
  if (App.mode === "host" || App.mode === "guest") return "net:" + (App.opp ? App.opp.name : "");
  if (App.mode === "cpu") return "cpu:" + App.st.p[1].ch;
  return null;
}
function seriesText() {
  const k = seriesKey(); if (!k || !App.series[k]) return "";
  const s = App.series[k]; if (s[0] + s[1] === 0) return "";
  return "Serie " + s[0] + " : " + s[1];
}
function matchEnd() {
  const st = App.st, me = myIdx(), op = me >= 0 ? 1 - me : -1;
  const [a, b] = st.s, k = seriesKey();
  if (k) { App.series[k] = App.series[k] || [0, 0]; if (a > b) App.series[k][0]++; else if (b > a) App.series[k][1]++; }
  const win = me >= 0 && st.s[me] > st.s[op];
  const myS = me >= 0 ? st.stats[me] : null;
  const lines = [];
  let coins = 0;
  const add = (label, c) => { if (c) { coins += c; lines.push([label, c]); } };
  const m = DIFFS[(App.cfg && App.cfg.diff) ?? 1].coins;
  switch (App.mode) {
    case "cpu": add(win ? "Sieg" : "Teilnahme", win ? Math.round(40 * m) : 12); break;
    case "cup": add(win ? "Cup-Sieg" : "Ausgeschieden", win ? Math.round(50 * m) : 15); break;
    case "endless": add(win ? "Sieg" : "Teilnahme", win ? Math.round(35 * m) : 10); break;
    case "daily": { const c = challenge(); if (win && !c.done) { add("Tages-Challenge", c.reward); challengeDone(); } else add(win ? "Sieg" : "Teilnahme", win ? 30 : 10); break; }
    case "host": case "guest": add(win ? "Online-Sieg" : "Online-Spiel", win ? 70 : 25); break;
    case "local": add("Spiel zu zweit", 20); break;
  }
  if (myS && myS.goals) add(myS.goals + (myS.goals === 1 ? " Tor" : " Tore"), myS.goals * (vsCpu() ? 8 : 5));
  if (win && st.s[op] === 0) add("Zu null", 20);
  // Läufe
  let runInfo = null;
  if (App.run && App.run.kind === "cup" && App.mode === "cup") {
    const r = App.run; r.res[r.round] = { s: [a, b], win };
    if (win) { r.round++; if (r.round >= r.ops.length) { r.done = true; add("Pokal", 300); runInfo = "cup"; S.cupBest = 3; } } else r.done = true;
  }
  if (App.run && App.run.kind === "endless" && App.mode === "endless") {
    const r = App.run;
    if (win) { r.streak++; r.next = endlessOpp(r.streak); } else { r.done = true; add("Endlos-Lauf", r.streak * 25); if (r.streak > S.endlessBest) { S.endlessBest = r.streak; runInfo = "record"; } }
  }
  addCoins(coins);
  const ups = addXP(Math.round(coins * 1.2) + 15);
  S.stats.games++;
  if (win) S.stats.wins++;
  if (myS) ["goals", "headGoals", "pus", "stomps", "supers"].forEach(f => S.stats[f] += myS[f]);
  const online = App.mode === "guest" || App.mode === "host";
  const inc = myS ? { wins: win ? 1 : 0, goals: myS.goals, headGoals: myS.headGoals, supers: myS.supers, pus: myS.pus, stomps: myS.stomps, online: online ? 1 : 0, hard: win && vsCpu() && (App.cfg.diff ?? 1) >= 2 ? 1 : 0, cupRound: win && App.mode === "cup" ? 1 : 0 } : { pus: st.stats[0].pus + st.stats[1].pus, stomps: st.stats[0].stomps + st.stats[1].stomps };
  taskProgress(inc).forEach((t, n) => setTimeout(() => { toast(`Aufgabe geschafft: ${t.text} (+${t.reward})`, "i-tasks", true); A.sfx("coin"); }, 600 + n * 1300));
  const achs = me >= 0 ? checkAch({ win, myGoals: myS.goals, conceded: st.s[op], superGoals: myS.superGoals, lastSec: myS.lastSecGoals, longGoals: myS.longGoals, maxDeficit: App.maxDef, cupWon: runInfo === "cup", diff: App.cfg.diff, mode: online ? "online" : App.mode === "cup" || App.mode === "endless" || App.mode === "daily" ? "cpu" : App.mode }) : checkAch({});
  save();
  showEnd({ win, me, lines, ups, achs, runInfo });
  A.sfx(me < 0 || win ? "win" : "lose");
  if (win || me < 0) fx.burst("goal", W / 2, 300, { col: COL.gold });
}
function showEnd(r) {
  const st = App.st, [a, b] = st.s, me = r.me;
  const t = $("endTitle");
  if (me < 0) { t.textContent = a === b ? "Unentschieden" : (App.names[a > b ? 0 : 1]) + " gewinnt!"; t.className = "ribbon gold"; }
  else if (r.win) { t.textContent = r.runInfo === "cup" ? "Pokalsieger!" : "Sieg!"; t.className = "ribbon" + (r.runInfo === "cup" ? " gold" : ""); }
  else { t.textContent = a === b ? "Unentschieden" : "Niederlage"; t.className = "ribbon " + (a === b ? "draw" : "lose"); }
  [0, 1].forEach(i => { const av = $("endAv" + i); av.innerHTML = ""; const won = st.s[i] > st.s[1 - i]; av.append(avatarCanvas(st.p[i].ch, 92, { dir: i ? -1 : 1, mood: won ? "happy" : st.s[i] < st.s[1 - i] ? "sad" : "" })); $("endN" + i).textContent = App.names[i]; });
  $("endS0").textContent = a; $("endS1").textContent = b;
  const s0 = st.stats[0], s1 = st.stats[1];
  const rows = [["Schüsse", s0.shots, s1.shots], ["Kopfbälle", s0.heads, s1.heads], ["Spezialschüsse", s0.supers, s1.supers], ["Power-ups", s0.pus, s1.pus], ["Schubser", s0.stomps, s1.stomps]].filter(r => r[1] + r[2] > 0);
  $("endStats").innerHTML = rows.map(([l, x, y]) => `<span class="v">${x}</span><span class="lbl">${l}</span><span class="v r">${y}</span>`).join("");
  const rw = $("endRewards"); rw.innerHTML = "";
  r.lines.forEach(([l, c], n) => { const d = document.createElement("div"); d.className = "rw-line"; d.style.animationDelay = (0.2 + n * 0.22) + "s"; d.innerHTML = `<span class="coin"></span><b>+${c}</b><span>${esc(l)}</span>`; rw.append(d); setTimeout(() => A.sfx("coin"), 200 + n * 220); });
  if (r.lines.length) {
    const xp = document.createElement("div"); xp.className = "xpwrap rw-line"; xp.style.animationDelay = (0.3 + r.lines.length * 0.22) + "s";
    xp.innerHTML = `<span>Level ${S.level}</span><span class="xpbar"><i style="width:0%"></i></span>`; rw.append(xp);
    setTimeout(() => { const i = xp.querySelector("i"); if (i) i.style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%"; }, 50);
  }
  r.achs.forEach((ac, n) => setTimeout(() => { toast(`Erfolg: ${ac.name} (+${ac.reward})`, "i-star", true); A.sfx("levelup"); }, 900 + n * 1200));
  if (r.ups.length) setTimeout(() => levelModal(r.ups[r.ups.length - 1]), 1500);
  if (r.runInfo === "record") setTimeout(() => toast("Neuer Endlos-Rekord!", "i-inf", true), 700);
  const again = $("btnEndAgain"), note = $("endNote"), menu = $("btnEndMenu");
  note.textContent = ""; again.hidden = false; again.disabled = false; again.className = "btn yellow big";
  menu.textContent = "Menü";
  switch (App.mode) {
    case "cup": case "endless": again.textContent = App.run && !App.run.done ? "Weiter" : "Fertig"; break;
    case "guest": again.textContent = "Revanche!"; note.textContent = "Der Gastgeber startet die nächste Runde."; menu.textContent = "Verlassen"; break;
    case "host": again.textContent = "Revanche"; menu.textContent = "Lobby"; break;
    case "daily": again.textContent = "Nochmal"; break;
    default: again.textContent = "Revanche";
  }
  showScreen("end");
}
function endAgain() {
  A.sfx("click");
  if (App.mode === "cup" || App.mode === "endless") { if (App.run && App.run.done && App.run.kind === "cup" && App.run.round >= 3) trophyModal(); runScreen(); return; }
  if (App.mode === "guest") { Net.send({ t: "rematch" }); $("endNote").textContent = "Anfrage gesendet. Warte auf den Gastgeber…"; $("btnEndAgain").disabled = true; return; }
  if (App.mode === "host") { hostStart(); return; }
  beginMatch({ ...App.lastCfg, chars: [...App.lastCfg.chars] });
}
function endMenu() { A.sfx("click"); if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); return; } quitToMenu(); }
function shareResult() {
  const st = App.st, me = myIdx(), url = location.origin + location.pathname;
  let text;
  if (me >= 0) { const w = st.s[me] > st.s[1 - me]; text = w ? `${st.s[me]}:${st.s[1 - me]} gegen ${App.names[1 - me]} gewonnen in Kopfball Duell. Traust du dich? ${url}` : `${st.s[me]}:${st.s[1 - me]} verloren in Kopfball Duell. Wer rächt mich? ${url}`; }
  else text = `${App.names[0]} ${st.s[0]}:${st.s[1]} ${App.names[1]} in Kopfball Duell ${url}`;
  shareOrCopy({ title: "Kopfball Duell", text });
}
function shareOrCopy(d) {
  if (navigator.share) { navigator.share(d).catch(() => {}); return; }
  copyText([d.text, d.url].filter(Boolean).join(" "));
}
function copyText(s) { try { navigator.clipboard.writeText(s).then(() => toast("Kopiert", "i-check"), () => toast(s)); } catch (_) { toast(s); } }

// ========================================================================
// Bildschirme
// ========================================================================
function showScreen(id, root) {
  if (id && !root && App.screen && App.screen !== id && !["end", "pause"].includes(App.screen)) App.stack.push(App.screen);
  if (root) App.stack = [];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-" + id);
  App.screen = id;
  document.body.dataset.scr = id || "";
  $("touch").hidden = !!id;
  if (App.mode !== "demo") $("gameBtns").hidden = !!id;
  const fn = { home: homeScreen, shop: shopScreen, ach: achScreen, settings: settingsScreen, tasks: tasksScreen, modes: modesScreen }[id];
  if (fn) fn();
  if (id && I.usedPad) { const f = $("scr-" + id).querySelector(".btn-play, .btn.big, .btn, button:not(.iconback)"); if (f) f.focus({ preventScroll: true }); }
}
function goBack() {
  A.sfx("click");
  if (App.screen === "lobby") { Net.close(); App.stack = ["home"]; $$(".screen").forEach(s => s.hidden = s.id !== "scr-online"); App.screen = "online"; return; }
  if (App.screen === "run") { App.run = null; }
  if (App.screen === "rules" && rulesCtx && rulesCtx.onDone) rulesCtx.onDone();
  const prev = App.stack.pop() || "home";
  showScreen(prev, true);
  App.stack = App.stack.length ? App.stack : [];
  if (prev === "lobby") lobbyUI(Net.role() === "host" ? "host" : "guest");
  if (prev === "setup") refreshSetup();
}

// ---------- Startseite ----------
let showcaseT = 0, showcaseTap = 0, juggle = { y: 0, vy: 0, a: 0, hits: 0 };
function homeScreen() {
  refreshTop();
  const c = charById(S.char), rar = rarityOf(c);
  $("stName").textContent = c.name; $("stSuper").textContent = SUPERS[c.super].name;
  const rb = $("stRarity"); rb.textContent = RARITY[rar]; rb.style.setProperty("--rc", RCOL[rar]);
  const m = MODES.find(x => x.id === S.mode) || MODES[0];
  $("mcTitle").textContent = m.name;
  let sub = m.desc;
  if (m.id === "daily") { const ch = dailyChallenge(); sub = ch.done ? "Heute geschafft" : `Heute: ${charById(ch.opp).name}, ${ch.presetName}`; }
  if (m.id === "endless" && S.endlessBest) sub = `Rekord: ${S.endlessBest} Siege`;
  $("mcSub").textContent = sub;
  $("mcIcon").innerHTML = svg(m.icon);
  $("mcIcon").style.background = `linear-gradient(${m.c1}, ${m.c2})`;
  const pf = $("pfAv"); pf.innerHTML = ""; pf.append(avatarCanvas(S.char, 50));
  $("pfName").textContent = S.name || "Spieler";
  // Tages-Challenge
  const ch = dailyChallenge();
  $("hsDaily").classList.toggle("done", ch.done);
  $("hdOpp").textContent = charById(ch.opp).name;
  $("hdRules").textContent = ch.presetName + (ch.rules.win ? `, bis ${ch.rules.win}` : ", 60 s") + " · " + DIFFS[ch.diff].name;
  $("hdRw").innerHTML = ch.done ? "✓ Geschafft" : `<span class="coin"></span>+${ch.reward}`;
  const ha = $("hdAv"); ha.innerHTML = ""; ha.append(avatarCanvas(ch.opp, 60, { dir: -1, mood: "angry" }));
  // Aufgaben
  const tl = tasks();
  $("htCount").textContent = tl.filter(t => t.done).length + "/" + tl.length;
  $("htList").innerHTML = tl.map(t => `<span class="ht-row${t.done ? " done" : ""}"><span>${esc(t.text)}</span><span class="rw">${t.done ? "✓" : `<span class="coin"></span>${t.reward}`}</span><span class="pb"><i style="width:${Math.round(t.prog / t.n * 100)}%"></i></span></span>`).join("");
  // Nächster Kopf
  const next = CHARS.filter(x => !owns("chars", x.id)).sort((x, y) => x.price - y.price)[0];
  const nu = $("hsNext"); nu.hidden = !next;
  if (next) {
    const nr = rarityOf(next);
    $("nuName").textContent = next.name; $("nuNum").textContent = Math.min(S.coins, next.price) + "/" + next.price;
    $("nuFill").style.width = Math.min(100, Math.round(S.coins / next.price * 100)) + "%";
    const av = $("nuAv"); av.innerHTML = ""; av.style.setProperty("--rc", RCOL[nr]); av.append(avatarCanvas(next.id, 52));
    nu.classList.toggle("ready", S.coins >= next.price);
    nu.querySelector("small").textContent = S.coins >= next.price ? "Jetzt freischalten!" : "Nächster Kopf";
    nu.onclick = () => { A.sfx("click"); selectScreen({ title: "Köpfe", cur: next.id, okText: "Auswählen", onDone: id => { S.char = id; save(); goBack(); } }); };
  }
}
function refreshTop() {
  $$(".coinNum").forEach(e => e.textContent = S.coins);
  $("lvlNum").textContent = S.level;
  $("xpFill").style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%";
  $("xpTxt").textContent = S.xp + "/" + xpFor(S.level);
  $("starNum").textContent = Object.keys(S.ach).length;
  const tl = tasks(), open = tl.filter(t => !t.done).length, ch = challenge();
  const tb = $("taskBadge"); const n = open + (ch.done ? 0 : 1); tb.hidden = !n; tb.textContent = n;
  const dl = deal(); $("shopBadge").hidden = !(dl && S.coins >= dl.price) && !CHARS.some(c => !owns("chars", c.id) && c.price <= S.coins);
}
function drawShowcase(dt) {
  const cv = $("showcase"); if (!cv || App.screen !== "home") return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  showcaseT += dt; showcaseTap = Math.max(0, showcaseTap - dt);
  const t = showcaseT;
  // Platz unter dem Kopf für Namensschild freihalten
  const plate = document.querySelector("#scr-home .plate"), nu = $("hsNext");
  const reserve = (plate ? plate.offsetHeight : 90) + (nu && !nu.hidden && nu.offsetParent ? nu.offsetHeight + 12 : 0) + 24;
  const avail = h - reserve;
  const r = Math.max(30, Math.min(w * 0.2, avail * 0.3));
  const baseY = avail - r * 0.15; // Boden der Bühne
  const cx = w / 2;
  // Spot
  const sp = x.createRadialGradient(cx, baseY - r * 1.4, 10, cx, baseY - r * 1.4, r * 3.2);
  sp.addColorStop(0, "rgba(255,255,255,.30)"); sp.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = sp; x.fillRect(0, 0, w, h);
  // Podest
  const pw = r * 1.7, ph = r * 0.32;
  x.save();
  x.shadowColor = "rgba(120,180,255,.7)"; x.shadowBlur = 30;
  x.fillStyle = "#15112e"; x.beginPath(); x.ellipse(cx, baseY + ph * 0.45, pw, ph, 0, 0, Math.PI * 2); x.fill();
  x.shadowBlur = 0;
  const pg = x.createLinearGradient(0, baseY - ph, 0, baseY + ph); pg.addColorStop(0, "#5d8dff"); pg.addColorStop(1, "#1a3fc4");
  x.fillStyle = pg; x.beginPath(); x.ellipse(cx, baseY, pw, ph, 0, 0, Math.PI * 2); x.fill();
  x.lineWidth = 3; x.strokeStyle = "#15112e"; x.stroke();
  x.fillStyle = "rgba(255,255,255,.22)"; x.beginPath(); x.ellipse(cx, baseY - ph * 0.25, pw * 0.7, ph * 0.45, 0, 0, Math.PI * 2); x.fill();
  x.restore();
  // Jonglieren: Ball fällt auf den Kopf, Kopf nickt ihn wieder hoch
  const headY = baseY - r * 1.02, top = headY - r;
  const j = juggle, g = r * 9;
  if (!j.init) { j.init = true; j.y = top - r * 2.4; j.vy = 0; }
  j.vy += g * dt; j.y += j.vy * dt; j.a += dt * 3;
  let bump = 0;
  const br = r * 0.32;
  if (j.y + br > top && j.vy > 0) { j.y = top - br; const hh = Math.max(r * 0.6, Math.min(r * (1.6 + 0.6 * Math.abs(Math.sin(t * 1.3))), top - br * 2 - 8)); j.vy = -Math.sqrt(2 * g * hh); j.hits++; showcaseTap = Math.max(showcaseTap, 0.25); }
  if (showcaseTap > 0) bump = Math.sin((1 - showcaseTap / 0.5) * Math.PI) * 0.1;
  const bx = cx + Math.sin(t * 1.9) * r * 0.12;
  // Schatten des Balls
  x.fillStyle = "rgba(0,0,0,.18)"; x.beginPath(); x.ellipse(bx, top + 4, br * (0.6 + 0.4 * (1 - Math.min(1, (top - j.y) / (r * 3)))), br * 0.2, 0, 0, Math.PI * 2); x.fill();
  // Kopf
  x.save(); x.translate(cx, baseY); x.scale(1 + bump * 0.8, 1 - bump); x.translate(-cx, -baseY);
  const look = -Math.PI / 2 + Math.sin(t * 2) * 0.3;
  drawHead(x, S.char, cx, headY - bump * r * 0.4, r, { dir: 1, look, mood: showcaseTap > 0.3 ? "happy" : "", blink: Math.sin(t * 1.7) > 0.97, t });
  x.restore();
  drawBall(x, S.ball, bx, j.y, br, j.a);
}
// ---------- Modus-Auswahl ----------
function modesScreen() {
  const g = $("modeGrid"); g.innerHTML = "";
  MODES.forEach(m => {
    const b = document.createElement("button"); b.className = "mcard" + (S.mode === m.id ? " on" : "");
    b.style.setProperty("--c1", m.c1); b.style.setProperty("--c2", m.c2);
    let tags = [...m.tags];
    if (m.id === "daily") { const c = challenge(); tags = [c.done ? "Heute geschafft" : `+${c.reward} heute`]; }
    if (m.id === "endless" && S.endlessBest) tags = [`Rekord ${S.endlessBest}`];
    b.innerHTML = `<svg class="big-ic"><use href="#${m.icon}"/></svg><b>${m.name}</b><p>${m.desc}</p><span class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join("")}</span>` + (m.isNew ? '<span class="newflag">NEU</span>' : "");
    b.onclick = () => { A.sfx("click"); S.mode = m.id; save(); App.stack = []; showScreen("home", true); };
    g.append(b);
  });
}

// ---------- Kopf-Auswahl ----------
let selCtx = null;
function selectScreen(opts) {
  selCtx = { ...opts, pick: opts.cur || S.char };
  $("selTitle").textContent = opts.title;
  const grid = $("charGrid"); grid.innerHTML = "";
  CHARS.forEach(c => {
    const b = document.createElement("button"); b.className = "ccard"; b.dataset.id = c.id;
    const locked = !owns("chars", c.id), rar = rarityOf(c);
    b.style.setProperty("--rc", RCOL[rar]);
    b.classList.toggle("locked", locked);
    b.append(avatarCanvas(c.id, 84));
    b.insertAdjacentHTML("beforeend", `<b>${c.name}</b>` + (locked ? `<svg class="lockt"><use href="#i-lock"/></svg><span class="price"><span class="coin"></span>${c.price}</span>` : ""));
    if (opts.p2 && c.id === S.char) b.insertAdjacentHTML("beforeend", '<span class="p2tag">P1</span>');
    b.onclick = () => { A.sfx("click"); selCtx.pick = c.id; selUpdate(); };
    grid.append(b);
  });
  selUpdate();
  showScreen("select");
}
function selUpdate() {
  const c = charById(selCtx.pick), locked = !owns("chars", c.id), rar = rarityOf(c);
  $$(".ccard").forEach(t => { t.classList.toggle("on", t.dataset.id === c.id); t.querySelector(".check")?.remove(); });
  const cur = $$(".ccard").find(t => t.dataset.id === (selCtx.p2 ? "" : S.char)); if (cur && !selCtx.p2) cur.insertAdjacentHTML("beforeend", `<span class="check">${svg("i-check")}</span>`);
  $("detTop").style.setProperty("--rc", RCOL[rar]);
  $("ciRarity").textContent = RARITY[rar];
  const big = $("bigAv"); big.innerHTML = ""; big.append(avatarCanvas(c.id, innerHeight < 520 ? 130 : 180, { mood: "happy" }));
  $("ciName").textContent = c.name;
  $("ciSuper").textContent = SUPERS[c.super].name; $("ciDesc").textContent = SUPERS[c.super].desc;
  const bar = (l, v) => `<span>${l}</span><span class="bar"><i style="width:${Math.round(clamp((v - 0.8) / 0.45, 0.08, 1) * 100)}%"></i></span>`;
  $("ciStats").innerHTML = bar("Tempo", c.spd) + bar("Sprung", c.jmp) + bar("Schuss", c.pow);
  const ok = $("btnSelOk");
  if (locked) { ok.className = "btn yellow"; ok.disabled = S.coins < c.price; ok.innerHTML = S.coins >= c.price ? `<span class="coin"></span>Freischalten · ${c.price}` : `Noch ${c.price - S.coins} Münzen`; }
  else { ok.className = "btn green"; ok.disabled = false; ok.textContent = selCtx.okText || "Auswählen"; }
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}
function selOk() {
  const c = charById(selCtx.pick);
  if (!owns("chars", c.id)) {
    if (buy("chars", c.id, c.price)) { A.sfx("levelup"); unlockModal(c); checkAch({}); refreshTop(); selectScreen({ ...selCtx, cur: c.id }); App.stack.pop(); }
    return;
  }
  A.sfx("click");
  selCtx.onDone(c.id);
}

// ---------- Spiel einstellen ----------
let setupCtx = null;
function setupScreen(ctx) {
  setupCtx = ctx;
  $("setupTitle").textContent = ctx.mode === "train" ? "Training" : ctx.mode === "local" ? "Zu zweit" : "Schnelles Spiel";
  $("optDiff").hidden = ctx.mode !== "cpu";
  $("optDur").hidden = ctx.mode === "train";
  refreshSetup();
  showScreen("setup");
}
function refreshSetup() {
  if (!setupCtx) return;
  renderArenas();
  seg($("segDiff"), DIFFS.map(d => ({ v: d.id, t: d.name })), S.diff, v => { S.diff = v; save(); });
  const win = S.rules && S.rules.win;
  seg($("segDur"), [60, 90, 120].map(v => ({ v, t: v + " s", dis: !!win })), S.dur, v => { S.dur = v; save(); });
  $("rulesSum").textContent = rulesSummary(S.rules);
}
function renderArenas() {
  const list = $("arenaList"); list.innerHTML = "";
  if (!owns("arenas", S.arena)) S.arena = "stadion";
  ARENAS.forEach(a => {
    const b = document.createElement("button"); b.className = "atile"; const locked = !owns("arenas", a.id);
    b.classList.toggle("locked", locked); b.classList.toggle("on", S.arena === a.id);
    b.append(arenaThumb(a.id, 240, 150));
    b.insertAdjacentHTML("beforeend", `<span class="cap"><b>${a.name}</b><small>${a.desc}</small></span>` + (locked ? `<span class="lock"><span class="coin"></span>${a.price}</span>` : ""));
    b.onclick = () => {
      if (locked) { if (buy("arenas", a.id, a.price)) { A.sfx("coin"); toast(a.name + " freigeschaltet!", "i-stadium", true); refreshTop(); } else { toast(`Dafür brauchst du ${a.price} Münzen`, "i-lock"); return; } }
      A.sfx("click"); S.arena = a.id; save(); renderArenas();
    };
    list.append(b);
  });
}
function kickoffFromSetup() {
  A.sfx("click");
  const base = { arena: S.arena, dur: S.dur, rules: { ...S.rules }, golden: true, ball: S.ball };
  if (setupCtx.mode === "cpu") {
    const pool = CHARS.filter(c => c.id !== S.char);
    const opp = pool[Math.floor(Math.random() * pool.length)].id;
    beginMatch({ ...base, mode: "cpu", chars: [S.char, opp], diff: S.diff, names: cpuNames(opp), labels: ["DU", null] });
  } else if (setupCtx.mode === "local") {
    beginMatch({ ...base, mode: "local", chars: [App.local2[0], App.local2[1]], diff: 1, names: ["Spieler 1", "Spieler 2"], labels: ["P1", "P2"] });
  } else if (setupCtx.mode === "train") {
    const pool = CHARS.filter(c => c.id !== S.char);
    const opp = pool[Math.floor(Math.random() * pool.length)].id;
    beginMatch({ ...base, mode: "train", train: true, keeper: true, mod: "superfast", rules: { ...S.rules, win: 0 }, chars: [S.char, opp], diff: 1, golden: false, names: [S.name || "Du", "Torwart"], labels: ["DU", null] });
  }
}

// ---------- Regeln ----------
let rulesCtx = null;
function rulesSummary(r) {
  r = r || {};
  const parts = RULE_OPTS.filter(o => r[o.k] !== undefined && r[o.k] !== DEFAULT_RULES[o.k]).map(o => { const v = o.opts.find(x => x[0] === r[o.k]); return v ? `${o.name}: ${v[1]}` : ""; }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "Standard";
}
function rulesScreen(target, onDone) {
  rulesCtx = { target, onDone };
  renderRules();
  showScreen("rules");
}
function renderRules() {
  const r = rulesCtx.target;
  const pr = $("rulePresets"); pr.innerHTML = "";
  RULE_PRESETS.forEach(p => {
    const b = document.createElement("button"); b.className = "preset"; b.style.setProperty("--c1", p.c1); b.style.setProperty("--c2", p.c2);
    b.innerHTML = `<b>${p.name}</b><small>${p.desc}</small>`;
    b.onclick = () => { A.sfx("click"); const win = r.win; Object.keys(r).forEach(k => delete r[k]); Object.assign(r, p.rules); if (win) r.win = win; renderRules(); };
    pr.append(b);
  });
  const list = $("ruleList"); list.innerHTML = "";
  RULE_OPTS.forEach(o => {
    const d = document.createElement("div"); d.className = "rule";
    d.innerHTML = `<h4>${o.name}${o.hint ? ` <small>${o.hint}</small>` : ""}</h4><div class="seg"></div>`;
    const cur = r[o.k] !== undefined ? r[o.k] : DEFAULT_RULES[o.k];
    seg(d.querySelector(".seg"), o.opts.map(([v, t]) => ({ v, t })), cur, v => { if (v === DEFAULT_RULES[o.k]) delete r[o.k]; else r[o.k] = v; });
    list.append(d);
  });
}

// ---------- Shop ----------
let shopTab = "chars";
function shopScreen() {
  $$("#shopTabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === shopTab));
  const dl = deal(), db = $("dealBox"); db.innerHTML = "";
  if (dl) {
    const c = document.createElement("div"); c.className = "dealcard";
    const av = document.createElement("div"); av.className = "dav";
    if (dl.kind === "chars") av.append(avatarCanvas(dl.id, 90)); else { const cv = ballCanvas(dl.id, 90); av.append(cv); }
    c.append(av);
    c.insertAdjacentHTML("beforeend", `<div class="dtxt"><small>Angebot des Tages</small><b>${dl.name}</b><em><s>${dl.old}</s>${dl.price} Münzen</em></div><span class="off">-30%</span>`);
    const bb = document.createElement("button"); bb.className = "btn yellow"; bb.innerHTML = `<span class="coin"></span>${dl.price}`; bb.disabled = S.coins < dl.price;
    bb.onclick = () => { if (buyDeal(dl)) { A.sfx("levelup"); if (dl.kind === "chars") { S.char = dl.id; unlockModal(charById(dl.id)); } else { S.ball = dl.id; toast(dl.name + " gekauft!", "i-ball", true); } save(); checkAch({}); refreshTop(); shopScreen(); } };
    c.append(bb); db.append(c);
  }
  const g = $("shopGrid"); g.innerHTML = "";
  const kind = shopTab, items = kind === "chars" ? CHARS : kind === "balls" ? BALLS : ARENAS;
  items.forEach(it => {
    const d = document.createElement("div"); d.className = "sitem";
    const own = owns(kind, it.id), eq = (kind === "chars" ? S.char : kind === "balls" ? S.ball : S.arena) === it.id;
    const rar = rarityOf(it); d.style.setProperty("--rc", RCOL[rar]);
    d.classList.toggle("eq", eq);
    const prev = document.createElement("div"); prev.className = "prev";
    if (kind === "chars") prev.append(avatarCanvas(it.id, 108));
    else if (kind === "balls") prev.append(ballCanvas(it.id, 84));
    else { const c = arenaThumb(it.id, 220, 118); c.className = "wide"; prev.append(c); }
    d.append(prev);
    d.insertAdjacentHTML("beforeend", `<span class="rarity" style="--rc:${RCOL[rar]}">${RARITY[rar]}</span>`);
    const desc = kind === "chars" ? "Super: " + SUPERS[it.super].name : kind === "arenas" ? it.desc : "Ballmuster";
    d.insertAdjacentHTML("beforeend", `<b>${it.name}</b><small>${desc}</small>`);
    const btn = document.createElement("button");
    const equip = () => { if (kind === "chars") S.char = it.id; else if (kind === "balls") S.ball = it.id; else S.arena = it.id; save(); };
    if (eq) { btn.className = "btn ghost small"; btn.innerHTML = svg("i-check") + "Ausgewählt"; btn.disabled = true; }
    else if (own) { btn.className = "btn green small"; btn.textContent = "Auswählen"; btn.onclick = () => { A.sfx("click"); equip(); shopScreen(); }; }
    else { btn.className = "btn yellow small"; btn.innerHTML = `<span class="coin"></span>${it.price}`; btn.disabled = S.coins < it.price; btn.onclick = () => { if (buy(kind, it.id, it.price)) { A.sfx("levelup"); equip(); if (kind === "chars") unlockModal(it); else toast(it.name + " gekauft!", kind === "balls" ? "i-ball" : "i-stadium", true); checkAch({}); refreshTop(); shopScreen(); } }; }
    d.append(btn); g.append(d);
  });
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}
function ballCanvas(id, px) {
  const c = document.createElement("canvas"), r = Math.min(2, devicePixelRatio || 1);
  c.width = c.height = px * r; c.style.width = c.style.height = px + "px";
  const x = c.getContext("2d"); x.scale(r, r); drawBall(x, id, px / 2, px / 2, px * 0.36, 0.4); return c;
}

// ---------- Aufgaben ----------
function tasksScreen() {
  const c = dailyChallenge(), o = charById(c.opp), card = $("challengeCard");
  card.innerHTML = `<div class="ch-head">${svg("i-cal")}<h3>Tages-Challenge</h3></div>`;
  const row = document.createElement("div"); row.className = "ch-row";
  row.append(avatarCanvas(c.opp, 76, { dir: -1, mood: "angry" }));
  row.insertAdjacentHTML("beforeend", `<ul><li>Gegner: <b>${o.name}</b> (${DIFFS[c.diff].name})</li><li>Arena: <b>${arenaById(c.arena).name}</b></li><li>Regeln: <b>${c.presetName}</b>${c.rules.win ? `, bis ${c.rules.win}` : ""}</li></ul>`);
  card.append(row);
  if (c.done) card.insertAdjacentHTML("beforeend", '<div class="done">Heute geschafft ✓</div>');
  const b = document.createElement("button"); b.className = "btn yellow big"; b.innerHTML = c.done ? "Nochmal spielen" : `<span class="coin"></span>+${c.reward} holen`;
  b.onclick = () => { S.mode = "daily"; save(); dailyBriefing(); };
  card.append(b);
  const icons = { wins: "i-trophy", goals: "i-ball", headGoals: "i-ball", supers: "i-bolt", pus: "i-gift", stomps: "i-users", online: "i-globe", hard: "i-crown", cupRound: "i-trophy" };
  $("taskList").innerHTML = tasks().map(t => `<div class="task${t.done ? " done" : ""}"><span class="tk-ic">${svg(t.done ? "i-check" : icons[t.id] || "i-star")}</span><div class="tk-main"><b>${esc(t.text)}</b><div class="prog"><i style="width:${Math.round(t.prog / t.n * 100)}%"></i></div></div><span class="tk-rw">${t.done ? "✓" : `<span class="coin"></span>${t.reward}`}</span></div>`).join("");
}

// ---------- Erfolge ----------
function achScreen() {
  const st = S.stats;
  $("profileBox").innerHTML = [["Spiele", st.games], ["Siege", st.wins], ["Tore", st.goals], ["Kopfballtore", st.headGoals], ["Spezialschüsse", st.supers], ["Endlos-Rekord", S.endlessBest]].map(([l, v]) => `<div class="pstat"><b>${v}</b><span>${l}</span></div>`).join("");
  const l = $("achList"); l.innerHTML = "";
  ACHIEVEMENTS.forEach(a => {
    const done = !!S.ach[a.id], p = achProgress(a);
    const d = document.createElement("div"); d.className = "ach" + (done ? " done" : "");
    d.innerHTML = `<span class="medal">${svg(done ? "i-star" : "i-lock")}</span><div style="flex:1;min-width:0"><b>${a.name}</b><p>${a.desc}</p>${a.stat && !done ? `<div class="prog"><i style="width:${Math.round(p * 100)}%"></i></div>` : ""}</div><span class="rw">${done ? svg("i-check").replace("<svg>", '<svg style="width:22px;height:22px">') : `<span class="coin"></span>${a.reward}`}</span>`;
    l.append(d);
  });
  $("achSum").textContent = Object.keys(S.ach).length + " / " + ACHIEVEMENTS.length;
}

// ---------- Einstellungen ----------
function settingsScreen() {
  $("setName").value = S.name || "";
  toggle($("tglSfx"), S.sfx, v => { S.sfx = v; A.setSfx(v); save(); });
  toggle($("tglMusic"), S.music, v => { S.music = v; A.setMusic(v); save(); });
  toggle($("tglVib"), S.vib, v => { S.vib = v; I.setVibration(v); save(); });
  seg($("segQual"), [{ v: "high", t: "Hoch" }, { v: "low", t: "Schnell" }], S.quality, v => { S.quality = v; setQuality(v); save(); });
}

// ---------- Kleine Helfer ----------
function seg(el, opts, cur, on) {
  el.innerHTML = "";
  opts.forEach(o => {
    const b = document.createElement("button"); b.textContent = o.t; b.classList.toggle("on", o.v === cur); b.disabled = !!o.dis;
    b.onclick = () => { A.sfx("click"); $$("button", el).forEach(x => x.classList.remove("on")); b.classList.add("on"); on(o.v); };
    el.append(b);
  });
}
function toggle(el, v, on) {
  el.setAttribute("aria-pressed", v ? "true" : "false");
  el.onclick = () => { const nv = el.getAttribute("aria-pressed") !== "true"; el.setAttribute("aria-pressed", nv ? "true" : "false"); A.sfx("click"); on(nv); };
}
function toast(text, icon, gold) {
  const t = document.createElement("div"); t.className = "toast" + (gold ? " gold" : "");
  t.innerHTML = (icon ? svg(icon) : "") + `<span>${esc(text)}</span>`;
  $("toasts").append(t); setTimeout(() => t.remove(), 3300);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
}
function modal({ title, icon, body, btn = "Weiter", onOk, cancel, ribbon = "gold" }) {
  const m = $("modal"), c = $("modalCard");
  c.innerHTML = `<div class="ribbon ${ribbon}">${esc(title)}</div>` + (icon ? `<svg class="bigic"><use href="#${icon}"/></svg>` : "") + body + `<button class="btn yellow big" id="modalOk">${btn}</button>` + (cancel ? `<button class="btn ghost small" id="modalCancel">${cancel}</button>` : "");
  m.hidden = false;
  $("modalOk").onclick = () => { A.sfx("click"); m.hidden = true; onOk && onOk(); };
  if (cancel) $("modalCancel").onclick = () => { A.sfx("click"); m.hidden = true; };
  if (I.usedPad) $("modalOk").focus();
}
function dailyModal(d) {
  const days = Array.from({ length: 7 }, (_, n) => `<i class="${n < d.streak ? "on" : ""}">${n + 1}</i>`).join("");
  modal({ title: "Tagesbonus", icon: "i-gift", body: `<p>Tag ${d.streak} in Folge: <b>+${d.amount} Münzen</b></p><div class="streak">${days}</div><p style="font-size:14px;opacity:.7">Morgen gibt's mehr.</p>`, btn: "Einsammeln", onOk: () => { A.sfx("coin"); refreshTop(); } });
}
function levelModal(lvl) {
  A.sfx("levelup");
  const bonus = 50 + lvl * 10; addCoins(bonus); save(); refreshTop();
  const next = CHARS.find(c => !owns("chars", c.id));
  modal({ title: "Level " + lvl, icon: "i-star", body: `<p>Bonus: <b>+${bonus} Münzen</b></p>` + (next ? `<p style="font-size:15px;opacity:.75">Nächster Kopf im Shop: ${next.name} (${next.price})</p>` : "") });
}
function unlockModal(c) {
  const rar = rarityOf(c);
  modal({ title: "Neuer Kopf!", body: `<div class="briefav"></div><p><b>${c.name}</b> · ${RARITY[rar]}</p><p style="font-size:15px">Super: ${SUPERS[c.super].name}</p>`, btn: "Nice", ribbon: "" });
  const box = document.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.id, 130, { mood: "happy" }));
}
function trophyModal() { A.sfx("levelup"); modal({ title: "Pokalsieger!", icon: "i-trophy", body: "<p>Drei Gegner, drei Siege. Der Pokal gehört dir.</p>", btn: "Feiern" }); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ========================================================================
// Pause, Tasten, Controller
// ========================================================================
function pause(on) {
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
function onKey(code) {
  A.unlock();
  if (code === "Escape" || code === "KeyP") {
    if (inGame()) { pause(true); return; }
    if (App.screen === "pause") { pause(false); return; }
    if (!$("modal").hidden) { $("modal").hidden = true; return; }
    if (code === "Escape" && App.screen && !["home", "end"].includes(App.screen)) { goBack(); return; }
  }
  if (inGame() && /^Digit[1-6]$/.test(code) && App.mode !== "local") sendEmote(EMOTES[+code.slice(5) - 1]);
  if (inGame() && App.st.ph === "goal" && (code === "Space" || code === "Enter") && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st);
}
function onPad(btn) {
  A.unlock();
  if (btn === 9) { if (inGame()) pause(true); else if (App.screen === "pause") pause(false); return; }
  if (inGame()) { if (btn === 0 && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st); return; }
  if (!$("modal").hidden) { if (btn === 0) $("modalOk").click(); if (btn === 1) $("modal").hidden = true; return; }
  const scr = App.screen && $("scr-" + App.screen);
  if (!scr) return;
  if (btn === 1) { const b = scr.querySelector("[data-back], #btnLobbyLeave"); if (b) b.click(); else if (App.screen === "pause") pause(false); return; }
  if (btn === 0) { const a = document.activeElement; if (a && scr.contains(a)) a.click(); else focusFirst(scr); return; }
  const dirs = { 12: [0, -1], 13: [0, 1], 14: [-1, 0], 15: [1, 0] };
  if (dirs[btn]) moveFocus(scr, dirs[btn]);
}
function focusFirst(scr) { const f = scr.querySelector(".btn-play, .btn:not(:disabled), button:not(:disabled)"); if (f) f.focus(); }
function moveFocus(scr, [dx, dy]) {
  const items = $$("button:not(:disabled), input", scr).filter(e => e.offsetParent !== null);
  const cur = document.activeElement;
  if (!cur || !scr.contains(cur)) { focusFirst(scr); return; }
  const r0 = cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
  let best = null, bd = 1e9;
  for (const e of items) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2];
    const vx = c[0] - c0[0], vy = c[1] - c0[1], along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const d = along + Math.abs(vx * dy - vy * dx) * 2.2;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }); A.sfx("tick"); }
}
function sendEmote(e) {
  if (!inGame()) return;
  $("emoteBar").hidden = true;
  if (App.mode === "guest") { Net.send({ t: "emo", e }); return; }
  emote(App.st, 0, e);
}

// ========================================================================
// Verdrahtung
// ========================================================================
function wireUI() {
  $$("[data-back]").forEach(b => b.onclick = goBack);
  $("btnPlay").onclick = () => startMode(S.mode);
  $("modeCard").onclick = () => { A.sfx("click"); showScreen("modes"); };
  $("navHeads").onclick = () => { A.sfx("click"); selectScreen({ title: "Köpfe", okText: "Auswählen", onDone: id => { S.char = id; save(); goBack(); } }); };
  $("showcase").onclick = () => { showcaseTap = 0.5; juggle.vy = Math.min(juggle.vy, -200); A.sfx("head"); };
  $("hsDaily").onclick = () => { A.sfx("click"); dailyBriefing(); };
  $("hsTasks").onclick = () => { A.sfx("click"); showScreen("tasks"); };
  $("navShop").onclick = () => { A.sfx("click"); showScreen("shop"); };
  $("navTasks").onclick = () => { A.sfx("click"); showScreen("tasks"); };
  $("navAch").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("homeStars").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("btnProfile").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("btnSettings").onclick = () => { A.sfx("click"); showScreen("settings"); };
  $("homeCoins").onclick = () => { A.sfx("click"); showScreen("shop"); };
  $("btnSelOk").onclick = selOk;
  $("btnKickoff").onclick = kickoffFromSetup;
  $("btnRules").onclick = () => { A.sfx("click"); S.rules = S.rules || {}; rulesScreen(S.rules, () => save()); };
  $("btnRulesDone").onclick = () => goBack();
  $("btnRulesReset").onclick = () => { A.sfx("click"); const r = rulesCtx.target; Object.keys(r).forEach(k => delete r[k]); renderRules(); };
  $("btnRunNext").onclick = runNext;
  $("btnHost").onclick = () => { A.sfx("click"); hostGame(); };
  $("btnJoin").onclick = () => { A.sfx("click"); tryJoin(); };
  $("codeIn").addEventListener("keydown", e => { if (e.key === "Enter") tryJoin(); });
  $("btnLobbyLeave").onclick = goBack;
  $("btnLobbyStart").onclick = () => { A.sfx("click"); hostStart(); };
  $("btnLobbyRules").onclick = () => { A.sfx("click"); App.netCfg.rules = App.netCfg.rules || {}; rulesScreen(App.netCfg.rules, () => { S.rules = { ...App.netCfg.rules }; save(); Net.send({ t: "cfg", cfg: App.netCfg }); }); };
  $("btnLobbyHead").onclick = () => { A.sfx("click"); selectScreen({ title: "Kopf wechseln", okText: "Übernehmen", onDone: id => { S.char = id; save(); Net.send({ t: "pick", ch: id }); goBack(); } }); };
  $("btnShare").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) shareOrCopy({ title: "Kopfball Duell", text: "Kopfball Duell gegen mich? Tipp auf den Link: " + link }); };
  $("btnCopyLink").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) copyText(link); };
  $$("#shopTabs button").forEach(b => b.onclick = () => { A.sfx("click"); shopTab = b.dataset.tab; shopScreen(); });
  $("btnEndAgain").onclick = endAgain;
  $("btnEndMenu").onclick = endMenu;
  $("btnEndShare").onclick = shareResult;
  $("btnPause").onclick = () => { A.sfx("click"); pause(true); };
  $("btnResume").onclick = () => { A.sfx("click"); pause(false); };
  $("btnRestart").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; beginMatch({ ...App.lastCfg }); };
  $("btnQuit").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); } else if (App.run && !App.run.done && ["cup", "endless"].includes(App.mode)) { App.run.done = true; runScreen(); } else quitToMenu(); };
  $("btnFull").onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFullscreen(); };
  $("setName").addEventListener("change", e => { saveName(e.target.value); refreshTop(); });
  $("btnReset").onclick = () => { if (confirm("Wirklich alles löschen? Münzen, Köpfe und Erfolge sind dann weg.")) { resetSave(); location.reload(); } };
  const bar = $("emoteBar");
  EMOTES.forEach((e, n) => { const b = document.createElement("button"); b.textContent = e; b.title = "Taste " + (n + 1); b.onclick = () => sendEmote(e); bar.append(b); });
  $("btnEmote").onclick = () => { bar.hidden = !bar.hidden; };
  $("cv").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st); });
  $("touch").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START - 0.3) skipCelebration(App.st); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && inGame() && App.mode !== "host" && App.mode !== "guest") pause(true); });
}

boot();
