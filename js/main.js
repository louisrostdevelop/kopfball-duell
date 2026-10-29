// Kopfball Duell – Ablauf, Menüs, Online, Fortschritt
import { W, G, GOAL_W, CHARS, ARENAS, BALLS, SUPERS, POWERUPS, MODS, DIFFS, ACHIEVEMENTS, EMOTES, COL, charById, arenaById, clamp } from "./config.js";
import { newMatch, advance, emote, skipCelebration, predictPlayer, REPLAY_START, REPLAY_END, barY, fireSuper } from "./physics.js";
import { initRender, render, fx, setQuality, arenaThumb, resize } from "./render.js";
import { avatarCanvas, ballSprite, drawBall, drawHead } from "./art.js";
import * as A from "./audio.js";
import * as I from "./input.js";
import { makeAI, aiInput } from "./ai.js";
import * as Net from "./net.js";
import { S, save, reset as resetSave, addXP, addCoins, xpFor, owns, buy, dailyCheck, checkAch, achProgress, tasks, taskProgress } from "./store.js";

const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const VERSION = 2;
const PHRASES = ["WAS FÜR EIN DING!", "UNHALTBAR!", "DRIN DAS DING!", "DER SASS!", "EISKALT!", "SAUBER!", "KEINE CHANCE!", "WIE GEMALT!"];
const CELEB = { kalle: "🔥", yuki: "❄️", bolt: "⚡", rocco: "🚀", nala: "🍌", flummi: "🎈", phantom: "👻", tank: "💪", tina: "🌪️", magnus: "🧲", max: "☄️", kaiser: "👑" };

const App = {
  mode: "demo", st: null, ai: [null, null], cfg: null, acc: 0, paused: false, endShown: false,
  names: ["", ""], labels: [null, null], ball: "klassik",
  rec: [], replay: null, maxDef: 0, screen: "home", stack: [],
  cup: null, local2: null, series: {}, lastCfg: null,
  // online
  jug: { i: -1, n: 0 },
  opp: null, guestIn: [0, 0, 0, 0, 0], sendT: 0, outEv: [], snaps: [], gp: null, lastIn: "", inT: 0, pingT: 0, rtt: 0, netCfg: null, lobbyReady: false,
};

// ---------- Start ----------
function boot() {
  initRender($("cv"));
  setQuality(S.quality);
  A.setSfx(S.sfx); A.setMusic(S.music); I.setVibration(S.vib);
  I.initInput({
    inGame: () => inGame(),
    onKey: onKey,
    onPadButton: onPad,
    onTouch: () => A.unlock(),
  });
  wireUI();
  startDemo();
  refreshTop();
  showScreen("home", true);
  requestAnimationFrame(loop);
  const unlockOnce = () => { A.unlock(); if (!inGame()) A.music(true, "menu"); window.removeEventListener("pointerdown", unlockOnce); window.removeEventListener("keydown", unlockOnce); };
  window.addEventListener("pointerdown", unlockOnce); window.addEventListener("keydown", unlockOnce);
  const fontsReady = document.fonts ? Promise.all(["400 20px Bungee", "600 20px 'Barlow Condensed'", "700 20px 'Barlow Condensed'", "800 20px 'Barlow Condensed'"].map(f => document.fonts.load(f).catch(() => {}))) : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]).then(() => {
    $("loading").classList.add("done"); resize();
    const d = dailyCheck();
    if (d) setTimeout(() => dailyModal(d), 500);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone;
    if (ios && !S.iosHint) setTimeout(() => { toast("Tipp: Teilen → „Zum Home-Bildschirm“ = Vollbild ohne Leisten"); S.iosHint = true; save(); }, d ? 6000 : 2500);
    // Link mit #CODE: direkt beitreten
    const h = (location.hash || "").slice(1);
    if (/^[A-Za-z0-9]{4}$/.test(h)) { history.replaceState(null, "", location.pathname + location.search); $("codeIn").value = h.toUpperCase(); showScreen("online"); setTimeout(() => tryJoin(h), 400); }
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__kd = App; window.__kdFire = fireSuper; // für Tests
}

const inGame = () => ["cpu", "cup", "local", "host", "guest"].includes(App.mode) && App.screen === null;

// ---------- Spiel starten ----------
function startDemo() {
  const pool = CHARS.map(c => c.id);
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)]; if (b === a) b = pool[(pool.indexOf(a) + 3) % pool.length];
  App.mode = "demo";
  const ar = ARENAS[Math.floor(Math.random() * ARENAS.length)].id;
  App.st = newMatch({ chars: [a, b], arena: ar, dur: 600, pus: true, golden: false });
  App.st.ph = "play";
  App.ai = [makeAI(0, 2), makeAI(1, 2)];
  App.names = ["", ""]; App.labels = [null, null]; App.ball = S.ball;
  App.rec = []; App.replay = null; fx.clear();
  I.setLayout("none");
}

function beginMatch(cfg) {
  // cfg: { mode, chars, arena, dur, pus, mod, golden, diff, names, labels, ball }
  App.cfg = cfg; App.lastCfg = cfg;
  App.mode = cfg.mode;
  App.st = newMatch(cfg);
  App.ai = [null, null];
  if (cfg.mode === "cpu" || cfg.mode === "cup") App.ai[1] = makeAI(1, cfg.diff);
  App.names = cfg.names; App.labels = cfg.labels; App.ball = cfg.ball || S.ball;
  App.acc = 0; App.paused = false; App.endShown = false; App.rec = []; App.replay = null; App.maxDef = 0;
  App.snaps = []; App.gp = null; App.outEv = []; App.guestIn = [0, 0, 0, 0, 0];
  fx.clear();
  showScreen(null);
  I.setLayout(cfg.mode === "local" ? "split" : "single");
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
    ? ["Links ziehen = laufen, hoch wischen = springen", "Schuss halten = Powerschuss", "Leiste voll? SUPER drücken!"]
    : ["A/D laufen · W springen · S schießen", "Schuss halten = Powerschuss", "Leiste voll? E für deinen Super!"];
  lines.forEach((t, n) => setTimeout(() => toast(t), 300 + n * 1400));
}

function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(() => { try { screen.orientation.lock("landscape").catch(() => {}); } catch (_) {} }).catch(() => {});
}

function quitToMenu() {
  if (App.mode === "host" || App.mode === "guest") Net.close();
  App.cup = null;
  document.body.classList.remove("ingame");
  $("gameBtns").hidden = true;
  A.crowdOff(); A.music(true, "menu");
  startDemo();
  App.stack = [];
  showScreen("home", true);
}

// ---------- Schleife ----------
let lastT = performance.now(), simT = 0, perf = { t: 0, n: 0, slow: 0 };
function loop(now) {
  const raw = (now - lastT) / 1000;
  const dt = Math.min(0.05, raw); lastT = now; simT += dt;
  // Läuft es ruckelig? Dann automatisch auf schnelle Grafik umschalten
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
    const inp = gatherInputs(dt);
    App.acc = advance(st, dt, inp, App.acc);
    if (App.mode === "host") hostSend(dt);
  }
  // Events
  if (st.ev.length) {
    const evs = st.ev.splice(0);
    for (const e of evs) { onEvent(e, false); if (App.mode === "host") App.outEv.push(e); }
  }
  // Wiederholung aufnehmen
  if (st.ph === "play") { App.rec.push(snap(st)); if (App.rec.length > 200) App.rec.shift(); }
  let replay = null, frac = 0;
  if (st.ph === "goal" && App.replay && st.pt < REPLAY_START && st.pt > REPLAY_END) { replay = App.replay; frac = (REPLAY_START - st.pt) / (REPLAY_START - REPLAY_END); }
  if (st.ph === "ko" || st.ph === "cd") App.rec = [];
  // Rückstand verfolgen (für Comeback)
  if (App.mode !== "demo") { const me = myIdx(); if (me >= 0) App.maxDef = Math.max(App.maxDef, st.s[1 - me] - st.s[me]); }
  const seriesTxt = seriesText();
  render(st, simT, { dt, names: App.names, labels: App.labels, ballSkin: App.ball, replay, replayFrac: frac, noHud: App.mode === "demo", canSkip: App.mode !== "guest", series: seriesTxt, modName: st.mod ? (MODS.find(m => m.id === st.mod) || {}).name : "" });
  if (App.mode !== "demo") I.touchHud(App.mode === "guest" && App.gp ? { p: [st.p[0], Object.assign({}, st.p[1], { charge: App.gp.charge })] } : st);
  // Spielende
  if (st.ph === "end" && !App.endShown) { App.endShown = true; if (App.mode === "demo") setTimeout(startDemo, 1500); else setTimeout(matchEnd, 900); }
  if (App.mode === "demo" && st.ph === "goal" && st.pt < 3.5) st.pt = Math.min(st.pt, 0.5);
  requestAnimationFrame(loop);
}

function gatherInputs(dt) {
  const st = App.st;
  switch (App.mode) {
    case "demo": return [aiInput(App.ai[0], st, dt), aiInput(App.ai[1], st, dt)];
    case "cpu": case "cup": return [I.getInput(0, "single"), aiInput(App.ai[1], st, dt)];
    case "local": return [I.getInput(0, "local"), I.getInput(1, "local")];
    case "host": { const g = App.guestIn; return [I.getInput(0, "single"), { l: !!g[0], r: !!g[1], j: !!g[2], k: !!g[3], s: !!g[4] }]; }
  }
  return [{}, {}];
}
function myIdx() { return App.mode === "guest" ? 1 : App.mode === "local" || App.mode === "demo" ? -1 : 0; }
function isHuman(i) { if (App.mode === "local") return true; if (App.mode === "demo") return false; return i === myIdx(); }

function snap(st) {
  return { arena: st.arena, s: st.s, t: st.t, ph: st.ph, gold: st.gold, mod: st.mod, wall: [...st.wall], bigGoal: [...st.bigGoal], pu: st.pu.map(u => ({ ...u })), b: { ...st.b }, p: st.p.map(p => ({ ...p })) };
}

// ---------- Effekte zu Events ----------
function onEvent(e, remote) {
  const demo = App.mode === "demo", st = App.st;
  const snd = (k, v) => { if (!demo) A.sfx(k, v); };
  const col = e.i !== undefined ? [COL.p1, COL.p2][e.i] : "#fff";
  switch (e.t) {
    case "go": snd(st.gold ? "whistle1" : "go"); if (!demo && st.s[0] + st.s[1] === 0 && !st.gold) snd("whistle1"); break;
    case "jump": if (remote && e.i === myIdx()) break; fx.burst("dust", e.x, e.y, { n: 4 }); snd("jump"); break;
    case "land": fx.burst("dust", e.x, e.y, { n: 6 }); snd("land"); break;
    case "swing": if (remote && e.i === myIdx()) break; snd("swing"); break;
    case "kick":
      if (App.jug.n >= 3 && App.jug.i === e.i) fx.burst("text", e.x, e.y - 70, { text: "VOLLEY!", col: COL.gold, size: 30 });
      App.jug.n = 0;
      fx.burst("kick", e.x, e.y, { pow: e.pow }); snd("kick", e.pow); fx.shake(3 * e.pow);
      if (e.pow > 1.6) { fx.burst("text", e.x, e.y - 40, { text: "WUMMS!", col: COL.gold, size: 30 }); fx.shake(6); }
      if (isHuman(e.i)) I.vibrate(e.pow > 1.4 ? 30 : 12);
      break;
    case "head": {
      fx.burst("head", e.x, e.y); snd("head"); if (e.v > 700) fx.shake(3);
      const j = App.jug; if (j.i === e.i) j.n++; else { j.i = e.i; j.n = 1; }
      if (j.n >= 3) { fx.burst("text", e.x, e.y - 50, { text: j.n + "x JONGLIERT!", col: j.n >= 5 ? COL.gold : "#fff", size: 22 + Math.min(14, j.n * 2) }); if (j.n === 5 || j.n === 8) snd("full"); }
      break;
    }
    case "bounce": App.jug.n = 0; if (e.v > 400) fx.burst("dust", e.x, e.y, { n: 4, col: "rgba(255,255,255,.35)" }); snd("bounce", e.v); break;
    case "post": fx.burst("post", e.x, e.y); snd("post"); snd("ohh"); fx.shake(7); fx.burst("text", e.x, e.y - 30, { text: "LATTE!", col: "#fff", size: 28 }); fx.hype(0.6); break;
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
  }
}

function onGoal(e) {
  const st = App.st, demo = App.mode === "demo";
  const side = e.i === 0 ? 1 : 0; // Tor, in das der Ball ging
  const gx = side ? W - GOAL_W / 2 : GOAL_W / 2;
  fx.burst("goal", gx, Math.min(e.y, G - 60), { col: [COL.p1, COL.p2][e.i] });
  fx.net(side, e.y, 1.4);
  fx.shake(24); fx.flash([COL.p1, COL.p2][e.i], 0.45); fx.hype(1);
  App.replay = App.rec.slice(-160);
  if (!demo) { A.sfx("goal"); }
  if (isHuman(e.i)) I.vibrate([60, 40, 120]);
  let text = "TOR!", col = [COL.p1, COL.p2][e.i];
  if (e.gold) text = "GOLDEN GOAL!";
  else if (e.kind === "own") text = "EIGENTOR!";
  else if (e.lastSec) text = "LAST SECOND!";
  else if (e.kind === "super") text = "SUPERTOR!";
  else if (e.long) text = "TRAUMTOR!";
  else if (e.kind === "head") text = "KOPFBALLTOR!";
  const scorer = st.stats[e.i].goals;
  let sub = "";
  if (scorer === 3 && e.kind !== "own") sub = "HATTRICK!";
  else if (e.s[0] === e.s[1]) sub = "AUSGLEICH!";
  else if (Math.abs(e.s[0] - e.s[1]) === 1 && e.s[e.i] > e.s[1 - e.i]) sub = "FÜHRUNG!";
  else sub = Math.random() < 0.5 ? (App.names[e.i] || "").toUpperCase() : PHRASES[Math.floor(Math.random() * PHRASES.length)];
  if (!demo) fx.callout(text, col, sub, 1.9, text.length > 9 ? 0.82 : 1);
  // Jubel: Torschütze zeigt sein Zeichen, CPU ärgert sich
  if (App.mode !== "guest" && e.kind !== "own") {
    const sc = App.st.p[e.i], s0 = App.st;
    setTimeout(() => { if (App.st === s0) emote(s0, e.i, CELEB[sc.ch] || "🔥"); }, 350);
  }
  if ((App.mode === "cpu" || App.mode === "cup") && e.i === 0 && Math.random() < 0.6) {
    const s0 = App.st;
    setTimeout(() => { if (App.st === s0) emote(s0, 1, ["😤", "😤", "🤡", "GG"][Math.floor(Math.random() * 4)]); }, 1100);
  }
}

// ---------- Online: Host ----------
function packState(st) {
  const r = v => Math.round(v * 10) / 10;
  const P = p => ({ x: r(p.x), y: r(p.y), vx: r(p.vx), vy: r(p.vy), kick: r(p.kick * 100) / 100, kHeld: p.kHeld, charge: r(p.charge), sc: r(p.sc * 100) / 100, frz: r(p.frz), stun: r(p.stun), meter: Math.round(p.meter), full: p.full, armed: r(p.armed), fireNext: p.fireNext, bigT: r(p.bigT), miniT: r(p.miniT), spdT: r(p.spdT), jmpT: r(p.jmpT), mood: p.mood, emo: p.emo, emoT: r(p.emoT), land: r(p.land), onG: p.onG });
  const b = st.b;
  return {
    s: st.s, t: r(st.t), ph: st.ph, pt: r(st.pt), gold: st.gold, wall: st.wall.map(r), bigGoal: st.bigGoal.map(r),
    pu: st.pu.map(u => ({ id: u.id, k: u.k, x: r(u.x), y: r(u.y), t: r(u.t) })),
    b: { x: r(b.x), y: r(b.y), vx: r(b.vx), vy: r(b.vy), r: r(b.r), a: r(b.a), fx: b.fx, fxT: r(b.fxT), fxK: b.fxK, fxBX: r(b.fxBX), fxBY: r(b.fxBY), fxDX: r(b.fxDX), fxDY: r(b.fxDY), alpha: r(b.alpha), fxP: b.fxP },
    p: st.p.map(P), stats: st.stats,
  };
}
function hostSend(dt) {
  if (!Net.isOpen()) return;
  App.sendT += dt;
  if (App.sendT >= 1 / 30) {
    App.sendT = 0;
    const ev = App.outEv.splice(0).filter(e => e.t !== "bounce" || e.v > 400);
    Net.send({ t: "s", s: packState(App.st), ev });
  }
}

// ---------- Online: Gast ----------
function guestFrame(dt, now) {
  const st = App.st;
  // eigene Eingabe senden
  const me = I.getInput(1, "single");
  const iv = [me.l, me.r, me.j, me.k, me.s].map(v => (v ? 1 : 0)), key = iv.join("");
  App.inT += dt;
  if (key !== App.lastIn || App.inT > 0.15) { App.lastIn = key; App.inT = 0; Net.send({ t: "i", i: iv }); }
  App.pingT += dt; if (App.pingT > 2) { App.pingT = 0; Net.send({ t: "ping", c: performance.now() }); }
  // Interpolation
  const S2 = App.snaps;
  if (!S2.length) return;
  const rt = now - 80;
  while (S2.length > 2 && S2[1].at <= rt) S2.shift();
  let a = S2[0], b = S2[1] || S2[0];
  const k = b === a ? 1 : clamp((rt - a.at) / (b.at - a.at), 0, 1.3);
  applySnap(st, a.s, b.s, k);
  // Vorhersage der eigenen Figur
  const sp = b.s.p[1];
  if (!App.gp) App.gp = Object.assign({}, st.p[1]);
  const gp = App.gp;
  ["sc", "frz", "stun", "bigT", "miniT", "spdT", "jmpT", "armed"].forEach(f => gp[f] = sp[f]);
  predictPlayer(st, gp, me, dt);
  // zur Serverposition ziehen (Server ist etwas hinterher: mit Geschwindigkeit hochrechnen)
  const lat = Math.min(0.25, App.rtt / 2000 + 0.08);
  const tx = sp.x + sp.vx * lat, ty = sp.y + sp.vy * lat * 0.5;
  const ex = tx - gp.x, ey = ty - gp.y;
  if (Math.abs(ex) > 140 || Math.abs(ey) > 160 || st.ph !== "play") { gp.x += ex * 0.35; gp.y += ey * 0.35; }
  else { gp.x += ex * 0.08; gp.y += ey * (gp.onG && sp.onG ? 0.3 : 0.06); }
  Object.assign(st.p[1], { x: gp.x, y: gp.y, kick: Math.max(gp.kick, sp.kick), kHeld: gp.kHeld, charge: gp.charge, onG: gp.onG });
}
function applySnap(st, a, b, k) {
  const L = (x, y) => x + (y - x) * k;
  st.s = b.s; st.t = b.t; st.ph = b.ph; st.pt = b.pt; st.gold = b.gold; st.wall = b.wall; st.bigGoal = b.bigGoal; st.pu = b.pu; st.stats = b.stats;
  const jump = Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) > 200;
  Object.assign(st.b, b.b);
  if (!jump) { st.b.x = L(a.b.x, b.b.x); st.b.y = L(a.b.y, b.b.y); st.b.a = L(a.b.a, b.b.a); }
  [0, 1].forEach(i => {
    const pa = a.p[i], pb = b.p[i], p = st.p[i];
    Object.assign(p, pb);
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 200) { p.x = L(pa.x, pb.x); p.y = L(pa.y, pb.y); }
  });
}

// ---------- Online: Verbindungsaufbau ----------
function hostGame() {
  if (!Net.available()) { netNote("Online-Modus konnte nicht geladen werden. Prüf deine Internetverbindung.", true); return; }
  saveName();
  App.opp = null; App.lobbyReady = false;
  App.netCfg = { arena: S.arena, dur: S.dur, pus: S.pus };
  lobbyUI("host");
  $("lobbyCode").textContent = "····";
  $("lobbyNote").textContent = "Raum wird geöffnet…";
  showScreen("lobby");
  Net.host({
    onReady: code => {
      const link = location.origin + location.pathname + "#" + code.toUpperCase();
      $("lobbyCode").textContent = code.toUpperCase(); $("lobbyLink").textContent = link;
      $("lobbyNote").textContent = "Schick den Link. Sobald dein Kumpel ihn öffnet, ist er hier.";
      makeQR(link);
    },
    onConn: () => { $("lobbyNote").textContent = "Verbunden. Warte auf Kumpel…"; },
    onData: hostData,
    onClose: () => {
      App.opp = null;
      if (inGame() || App.screen === "end") { toast("Gegner hat die Verbindung verloren"); backToLobby(); }
      lobbyUI("host"); $("lobbyNote").textContent = "Gegner ist weg. Schick den Link nochmal.";
    },
    onError: t => { $("lobbyNote").textContent = "Raum konnte nicht geöffnet werden (" + t + "). Versuch es nochmal."; },
  });
}
function hostData(d) {
  switch (d.t) {
    case "hello":
      App.opp = { name: (d.name || "Gast").slice(0, 12), ch: charById(d.ch).id, v: d.v };
      Net.send({ t: "welcome", name: S.name || "Gastgeber", ch: S.char, cfg: App.netCfg, v: VERSION });
      lobbyUI("host"); A.sfx("coin"); toast(App.opp.name + " ist da!");
      break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; lobbyUI("host"); } break;
    case "i": if (Array.isArray(d.i)) App.guestIn = d.i.slice(0, 5); break;
    case "emo": if (App.mode === "host" && App.st && EMOTES.includes(d.e)) emote(App.st, 1, d.e); break;
    case "ping": Net.send({ t: "pong", c: d.c }); break;
    case "rematch": toast((App.opp ? App.opp.name : "Gast") + " will Revanche!"); break;
  }
}
function hostStart() {
  if (!App.opp) return;
  const cfg = { mode: "host", chars: [S.char, App.opp.ch], arena: App.netCfg.arena, dur: App.netCfg.dur, pus: App.netCfg.pus, mod: null, golden: true, names: [S.name || "Du", App.opp.name], labels: ["DU", null], ball: S.ball };
  Net.send({ t: "start", cfg: { ...cfg, mode: "guest", names: cfg.names, labels: [null, "DU"] } });
  beginMatch(cfg);
}
function tryJoin(code) {
  code = String(code || $("codeIn").value).trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) { netNote("Der Code hat 4 Zeichen.", true); return; }
  if (!Net.available()) { netNote("Online-Modus lädt noch… versuch es gleich nochmal.", true); return; }
  saveName();
  netNote("Verbinde mit " + code.toUpperCase() + "…");
  Net.join(code, {
    onConn: () => { Net.send({ t: "hello", name: S.name || "Gast", ch: S.char, v: VERSION }); },
    onData: guestData,
    onClose: () => { if (App.mode === "guest" || App.screen === "lobby" || App.screen === "end") { toast("Gastgeber hat das Spiel verlassen"); quitToMenu(); } },
    onError: (t, wasOk) => {
      if (wasOk) return;
      Net.close();
      const msg = t === "peer-unavailable" ? "Kein Spiel mit Code " + code.toUpperCase() + " gefunden." : t === "timeout" ? "Verbindung kam nicht zustande. Manche Netze (Schule, Firma) blockieren das. Mobile Daten helfen oft." : "Verbindung fehlgeschlagen (" + t + ").";
      if (App.screen !== "online") showScreen("online");
      netNote(msg, true);
    },
  });
}
function guestData(d) {
  switch (d.t) {
    case "welcome":
      App.opp = { name: (d.name || "Gastgeber").slice(0, 12), ch: charById(d.ch).id }; App.netCfg = d.cfg;
      lobbyUI("guest"); showScreen("lobby"); A.sfx("coin");
      break;
    case "cfg": App.netCfg = d.cfg; lobbyUI("guest"); break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; lobbyUI("guest"); } break;
    case "full": Net.close(); showScreen("online"); netNote("Das Spiel ist schon voll.", true); break;
    case "start": {
      const c = d.cfg;
      beginMatch({ ...c, mode: "guest", names: c.names, labels: [null, "DU"] });
      App.st.ph = "cd";
      break;
    }
    case "s":
      if (App.mode !== "guest") break;
      App.snaps.push({ at: performance.now(), s: d.s });
      if (App.snaps.length > 12) App.snaps.shift();
      if (Array.isArray(d.ev)) d.ev.forEach(e => { if (e.t === "goal") { App.replay = App.rec.slice(-160); } onEvent(e, true); });
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
  startDemo();
  App.mode = "demo";
  lobbyUI(role === "host" ? "host" : "guest");
  App.stack = ["home"];
  showScreen("lobby");
}

function lobbyUI(role) {
  const host = role === "host";
  $("inviteBox").hidden = !host;
  $("btnLobbyStart").hidden = !host;
  $("btnLobbyStart").disabled = !App.opp;
  $("lobbyOpts").classList.toggle("locked", !host);
  const me = { name: S.name || (host ? "Du" : "Du"), ch: S.char };
  const left = host ? me : App.opp, right = host ? App.opp : me;
  const put = (n, p, labelYou) => {
    const av = $("vsAv" + n); av.innerHTML = "";
    if (p) { av.append(avatarCanvas(p.ch, 110, { dir: n ? -1 : 1 })); $("vsName" + n).textContent = p.name + (labelYou ? " (du)" : ""); $("vsCh" + n).textContent = SUPERS[charById(p.ch).super].name; }
    else { av.innerHTML = '<span class="wait">?</span>'; $("vsName" + n).textContent = "Warte…"; $("vsCh" + n).textContent = ""; }
  };
  put(0, left, host); put(1, right, !host);
  if (!host) $("lobbyNote").textContent = App.opp ? "Warte, bis " + App.opp.name + " anpfeift." : "Verbinde…";
  else if (App.opp) $("lobbyNote").textContent = App.opp.name + " ist bereit. Anpfiff, wenn du willst!";
  const c = App.netCfg || { arena: S.arena, dur: S.dur, pus: S.pus };
  seg($("segLobbyArena"), ARENAS.map(a => ({ v: a.id, t: a.name, dis: host && !owns("arenas", a.id) })), c.arena, v => { App.netCfg.arena = v; Net.send({ t: "cfg", cfg: App.netCfg }); });
  seg($("segLobbyDur"), [60, 90, 120].map(v => ({ v, t: v + " s" })), c.dur, v => { App.netCfg.dur = v; Net.send({ t: "cfg", cfg: App.netCfg }); });
  toggle($("tglLobbyPu"), c.pus, v => { App.netCfg.pus = v; Net.send({ t: "cfg", cfg: App.netCfg }); });
}
function makeQR(link) {
  const box = $("qrBox"); box.innerHTML = "";
  if (!window.qrcode) return;
  try { const q = window.qrcode(0, "M"); q.addData(link); q.make(); const img = new Image(); img.src = q.createDataURL(5, 2); img.alt = "QR-Code zum Beitreten"; box.append(img); } catch (_) {}
}
function netNote(t, err) { const n = $("netNote"); n.textContent = t; n.classList.toggle("err", !!err); }
function saveName() { const v = $("nameIn").value.trim().slice(0, 12); if (v) { S.name = v; save(); } }

// ---------- Spielende & Belohnungen ----------
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
  const [a, b] = st.s;
  const k = seriesKey();
  if (k) { App.series[k] = App.series[k] || [0, 0]; if (a > b) App.series[k][0]++; else if (b > a) App.series[k][1]++; }
  const win = me >= 0 && st.s[me] > st.s[op];
  // Belohnung
  let coins = 0, lines = [];
  const myS = me >= 0 ? st.stats[me] : null;
  if (App.mode === "cpu") { const m = DIFFS[App.cfg.diff].coins; coins = win ? Math.round(40 * m) : 12; lines.push([win ? "Sieg" : "Teilnahme", coins]); }
  if (App.mode === "cup") { const m = DIFFS[App.cfg.diff].coins; coins = win ? Math.round(50 * m) : 15; lines.push([win ? "Cup-Sieg" : "Ausgeschieden", coins]); }
  if (App.mode === "host" || App.mode === "guest") { coins = win ? 70 : 25; lines.push([win ? "Online-Sieg" : "Online-Spiel", coins]); }
  if (App.mode === "local") { coins = 20; lines.push(["Spiel zu zweit", 20]); }
  if (myS && myS.goals) { const g = myS.goals * (App.mode === "cpu" || App.mode === "cup" ? 8 : 5); coins += g; lines.push([myS.goals + (myS.goals === 1 ? " Tor" : " Tore"), g]); }
  if (win && me >= 0 && st.s[op] === 0) { coins += 20; lines.push(["Zu null", 20]); }
  addCoins(coins);
  const ups = addXP(Math.round(coins * 1.2) + 15);
  // Statistik
  S.stats.games++;
  if (win) S.stats.wins++;
  if (myS) { S.stats.goals += myS.goals; S.stats.headGoals += myS.headGoals; S.stats.pus += myS.pus; S.stats.stomps += myS.stomps; S.stats.supers += myS.supers; }
  if (App.mode === "local") { const t = st.stats[0], u = st.stats[1]; S.stats.pus += t.pus + u.pus; }
  // Cup
  let cupWon = false;
  if (App.mode === "cup" && App.cup) {
    const c = App.cup; c.res[c.round] = { s: [a, b], win };
    if (win) { c.round++; if (c.round >= c.ops.length) { cupWon = true; c.done = true; addCoins(300); lines.push(["🏆 Pokal gewonnen", 300]); S.cupBest = Math.max(S.cupBest, 3); } }
    else c.done = true;
  }
  const isOnline = App.mode === "guest" || App.mode === "host";
  const inc = myS ? { wins: win ? 1 : 0, goals: myS.goals, headGoals: myS.headGoals, supers: myS.supers, pus: myS.pus, stomps: myS.stomps, online: isOnline ? 1 : 0, hard: win && (App.mode === "cpu" || App.mode === "cup") && App.cfg.diff >= 2 ? 1 : 0, cupRound: win && App.mode === "cup" ? 1 : 0 } : { pus: st.stats[0].pus + st.stats[1].pus, stomps: st.stats[0].stomps + st.stats[1].stomps };
  const tdone = taskProgress(inc);
  tdone.forEach((t, n) => setTimeout(() => { toast(`📋 Aufgabe geschafft: ${t.text} (+${t.reward})`, true); A.sfx("coin"); }, 600 + n * 1300));
  const achs = me >= 0 ? checkAch({ win, myGoals: myS.goals, conceded: st.s[op], superGoals: myS.superGoals, lastSec: myS.lastSecGoals, longGoals: myS.longGoals, maxDeficit: App.maxDef, cupWon, diff: App.cfg.diff, mode: App.mode === "guest" || App.mode === "host" ? "online" : App.mode }) : checkAch({});
  save();
  showEnd({ win, me, lines, coins, ups, achs, cupWon });
  A.sfx(me < 0 || win ? "win" : "lose");
  if (win || me < 0) fx.burst("goal", W / 2, 300, { col: COL.gold });
}

function showEnd(r) {
  const st = App.st, [a, b] = st.s, me = r.me;
  const t = $("endTitle");
  let title;
  if (me < 0) title = a === b ? "Unentschieden" : (App.names[a > b ? 0 : 1]) + " gewinnt!";
  else title = r.win ? (r.cupWon ? "Pokalsieger!" : "Gewonnen!") : "Verloren";
  t.textContent = title; t.className = me < 0 || r.win ? "win" : "lose";
  $("endScore").innerHTML = `<span style="color:var(--p1)">${esc(App.names[0])}</span> ${a} : ${b} <span style="color:var(--p2)">${esc(App.names[1])}</span>`;
  const winner = a >= b ? 0 : 1;
  const av = $("endAv"); av.innerHTML = ""; av.append(avatarCanvas(st.p[me >= 0 ? me : winner].ch, 96, { mood: me < 0 || r.win ? "happy" : "sad" }));
  // Statistik
  const s0 = st.stats[0], s1 = st.stats[1];
  const rows = [["Tore", s0.goals, s1.goals], ["Schüsse", s0.shots, s1.shots], ["Kopfbälle", s0.heads, s1.heads], ["Spezialschüsse", s0.supers, s1.supers], ["Power-ups", s0.pus, s1.pus]];
  $("endStats").innerHTML = `<span></span><span class="h" style="color:var(--p1)">${esc(App.names[0]).slice(0, 10)}</span><span class="h" style="color:var(--p2)">${esc(App.names[1]).slice(0, 10)}</span>` + rows.map(([l, x, y]) => `<span>${l}</span><span>${x}</span><span>${y}</span>`).join("");
  // Belohnungen
  const rw = $("endRewards"); rw.innerHTML = "";
  r.lines.forEach(([l, c], n) => { const d = document.createElement("div"); d.className = "rw-line"; d.style.animationDelay = (0.2 + n * 0.25) + "s"; d.innerHTML = `<span class="coin"></span>+${c} <span style="opacity:.7">${esc(l)}</span>`; rw.append(d); setTimeout(() => A.sfx("coin"), 200 + n * 250); });
  const xp = document.createElement("div"); xp.className = "xpwrap rw-line"; xp.style.animationDelay = (0.3 + r.lines.length * 0.25) + "s";
  xp.innerHTML = `<span>Level ${S.level}</span><span class="xpbar"><i style="width:${Math.round(S.xp / xpFor(S.level) * 100)}%"></i></span>`;
  rw.append(xp);
  r.achs.forEach((ac, n) => { setTimeout(() => { toast(`⭐ Erfolg: ${ac.name} (+${ac.reward})`, true); A.sfx("levelup"); }, 900 + n * 1200); });
  if (r.ups.length) setTimeout(() => levelModal(r.ups[r.ups.length - 1]), 1400);
  // Knöpfe
  const again = $("btnEndAgain"), note = $("endNote");
  note.textContent = "";
  again.hidden = false; again.disabled = false;
  if (App.mode === "cup") {
    again.textContent = App.cup.done ? (r.cupWon ? "Pokal feiern" : "Cup beenden") : "Weiter im Cup";
  } else if (App.mode === "guest") {
    again.textContent = "Revanche!"; note.textContent = "Der Gastgeber startet die nächste Runde.";
  } else again.textContent = "Revanche";
  $("btnEndMenu").textContent = App.mode === "host" || App.mode === "guest" ? "Lobby" : "Menü";
  if (App.mode === "guest") $("btnEndMenu").textContent = "Verlassen";
  showScreen("end");
  refreshTop();
}
function endAgain() {
  A.sfx("click");
  if (App.mode === "cup") { if (App.cup.done) { if (App.cup.res.filter(x => x && x.win).length === App.cup.ops.length) trophyModal(); App.cup = App.cup.done ? null : App.cup; } if (App.cup) { cupScreen(); return; } quitToMenu(); return; }
  if (App.mode === "guest") { Net.send({ t: "rematch" }); $("endNote").textContent = "Anfrage gesendet. Warte auf den Gastgeber…"; $("btnEndAgain").disabled = true; return; }
  if (App.mode === "host") { hostStart(); return; }
  const c = { ...App.lastCfg };
  if (c.mod !== null && S.chaos) c.mod = MODS[Math.floor(Math.random() * MODS.length)].id;
  beginMatch(c);
}
function endMenu() {
  A.sfx("click");
  if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); return; }
  quitToMenu();
}
function shareResult() {
  const st = App.st, me = myIdx(), url = location.origin + location.pathname;
  let text;
  if (me >= 0) { const w = st.s[me] > st.s[1 - me]; text = w ? `Ich hab ${st.s[me]}:${st.s[1 - me]} gegen ${App.names[1 - me]} gewonnen in Kopfball Duell 😎 Traust du dich?` : `${st.s[me]}:${st.s[1 - me]} verloren in Kopfball Duell 😤 Wer rächt mich?`; }
  else text = `${App.names[0]} ${st.s[0]}:${st.s[1]} ${App.names[1]} in Kopfball Duell ⚽`;
  shareOrCopy({ title: "Kopfball Duell", text, url });
}
function shareOrCopy(d) {
  if (navigator.share) { navigator.share(d).catch(() => {}); return; }
  const s = d.text ? d.text + " " + d.url : d.url;
  try { navigator.clipboard.writeText(s).then(() => toast("Link kopiert ✓"), () => toast(s)); } catch (_) { toast(s); }
}

// ---------- Bildschirme ----------
function showScreen(id, root) {
  if (id && !root && App.screen && App.screen !== id && !["end", "pause"].includes(App.screen)) App.stack.push(App.screen);
  if (root) App.stack = [];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-" + id);
  App.screen = id;
  $("touch").hidden = !!id;
  if (App.mode !== "demo") $("gameBtns").hidden = !!id;
  if (id === "home") homeScreen();
  if (id === "shop") shopScreen();
  if (id === "ach") achScreen();
  if (id === "settings") settingsScreen();
  if (id) { const first = $("scr-" + id).querySelector(".cta, .mbtn.primary, button:not(.back)"); if (first && I.usedPad) first.focus({ preventScroll: true }); }
}
function goBack() {
  A.sfx("click");
  if (App.screen === "lobby") { Net.close(); App.stack = []; showScreen("online", true); App.stack = ["home"]; return; }
  if (App.screen === "cup") { App.cup = null; }
  const prev = App.stack.pop() || "home";
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-" + prev);
  App.screen = prev;
  if (prev === "home") homeScreen();
  if (prev === "lobby") lobbyUI(Net.role() === "host" ? "host" : "guest");
}

function refreshTop() {
  $("coinNum").textContent = S.coins; $$(".coinNum").forEach(e => e.textContent = S.coins);
  $("lvlNum").textContent = S.level;
  $("xpFill").style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%";
  const done = Object.keys(S.ach).length; $("achCnt").textContent = done + "/" + ACHIEVEMENTS.length;
  const tl = tasks(); $("taskCnt").textContent = tl.filter(t => t.done).length + "/" + tl.length;
  const cheap = CHARS.some(c => !owns("chars", c.id) && c.price <= S.coins);
  $("shopDot").hidden = !cheap;
}
function homeScreen() {
  refreshTop();
  const c = $("meHeadCv"); c.innerHTML = ""; c.append(avatarCanvas(S.char, 64));
  $("meHeadName").textContent = charById(S.char).name;
}

// Kopf-Auswahl
let selCtx = null;
function selectScreen(opts) {
  // opts: { title, cur, onDone, p2 }
  selCtx = { ...opts, pick: opts.cur || S.char };
  $("selTitle").textContent = opts.title;
  const grid = $("charGrid"); grid.innerHTML = "";
  CHARS.forEach(c => {
    const b = document.createElement("button"); b.className = "ctile"; b.dataset.id = c.id;
    const locked = !owns("chars", c.id);
    b.classList.toggle("locked", locked);
    b.append(avatarCanvas(c.id, 78));
    b.insertAdjacentHTML("beforeend", `<b>${c.name}</b><small>${SUPERS[c.super].name}</small>` + (locked ? `<span class="price"><span class="coin"></span>${c.price}</span>` : ""));
    b.onclick = () => { A.sfx("click"); selCtx.pick = c.id; selUpdate(); };
    grid.append(b);
  });
  selUpdate();
  showScreen("select");
}
function selUpdate() {
  const c = charById(selCtx.pick), locked = !owns("chars", c.id);
  $$(".ctile").forEach(t => t.classList.toggle("on", t.dataset.id === c.id));
  const big = $("bigAv"); big.innerHTML = ""; big.append(avatarCanvas(c.id, innerHeight < 520 ? 104 : 170, { mood: "happy" }));
  $("ciName").textContent = c.name;
  $("ciSuper").textContent = "Super: " + SUPERS[c.super].name; $("ciDesc").textContent = SUPERS[c.super].desc;
  const bar = (l, v) => `<span>${l}</span><span class="bar"><i style="width:${Math.round(clamp((v - 0.8) / 0.45, 0.08, 1) * 100)}%"></i></span>`;
  $("ciStats").innerHTML = bar("Tempo", c.spd) + bar("Sprung", c.jmp) + bar("Schuss", c.pow);
  const ok = $("btnSelOk");
  if (locked) { ok.className = "cta buy"; ok.disabled = S.coins < c.price; ok.innerHTML = S.coins >= c.price ? `Freischalten · ${c.price}` : `Noch ${c.price - S.coins} Münzen`; }
  else { ok.className = "cta"; ok.disabled = false; ok.textContent = selCtx.okText || "Weiter"; }
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}
function selOk() {
  const c = charById(selCtx.pick);
  if (!owns("chars", c.id)) {
    if (buy("chars", c.id, c.price)) { A.sfx("coin"); toast(`${c.name} freigeschaltet!`, true); checkAch({}); refreshTop(); $$(".ctile").forEach(t => { if (t.dataset.id === c.id) { t.classList.remove("locked"); t.querySelector(".price")?.remove(); } }); selUpdate(); }
    return;
  }
  A.sfx("click");
  selCtx.onDone(c.id);
}

// Arena & Regeln
let setupCtx = null;
function setupScreen(ctx) {
  setupCtx = ctx;
  $("optDiff").hidden = !ctx.cpu;
  renderArenas();
  seg($("segDiff"), DIFFS.map(d => ({ v: d.id, t: d.name })), S.diff, v => { S.diff = v; save(); });
  seg($("segDur"), [60, 90, 120].map(v => ({ v, t: v + " s" })), S.dur, v => { S.dur = v; save(); });
  toggle($("tglPu"), S.pus, v => { S.pus = v; save(); });
  toggle($("tglChaos"), S.chaos, v => { S.chaos = v; save(); });
  showScreen("setup");
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
      if (locked) {
        if (buy("arenas", a.id, a.price)) { A.sfx("coin"); toast(a.name + " freigeschaltet!", true); refreshTop(); }
        else { toast(`Dafür brauchst du ${a.price} Münzen`); return; }
      }
      A.sfx("click"); S.arena = a.id; save(); renderArenas();
    };
    list.append(b);
  });
}
function kickoffFromSetup() {
  A.sfx("click");
  const mod = S.chaos ? MODS[Math.floor(Math.random() * MODS.length)].id : null;
  const base = { arena: S.arena, dur: S.dur, pus: S.pus, mod, golden: true, ball: S.ball };
  if (setupCtx.mode === "cpu") {
    const pool = CHARS.filter(c => c.id !== S.char);
    const opp = pool[Math.floor(Math.random() * pool.length)].id;
    beginMatch({ ...base, mode: "cpu", chars: [S.char, opp], diff: S.diff, names: [S.name || "Du", charById(opp).name], labels: ["DU", null] });
  } else if (setupCtx.mode === "local") {
    beginMatch({ ...base, mode: "local", chars: [App.local2[0], App.local2[1]], diff: 1, names: ["Spieler 1", "Spieler 2"], labels: ["P1", "P2"] });
  }
}

// Cup
function startCup() {
  const pool = CHARS.filter(c => c.id !== S.char).sort(() => Math.random() - 0.5);
  const owned = ARENAS.filter(a => owns("arenas", a.id)).map(a => a.id);
  App.cup = { ops: pool.slice(0, 3).map((c, n) => ({ ch: c.id, diff: [1, 2, 3][n], arena: owned[Math.floor(Math.random() * owned.length)] })), round: 0, res: [], done: false };
  cupScreen();
}
function cupScreen() {
  const c = App.cup, br = $("bracket"); br.innerHTML = "";
  const titles = ["Viertelfinale", "Halbfinale", "Finale"];
  c.ops.forEach((o, n) => {
    const d = document.createElement("div"); d.className = "round";
    const r = c.res[n];
    if (n === c.round && !c.done) d.classList.add("now");
    if (r) d.classList.add(r.win ? "won" : "lost");
    d.innerHTML = `<small>${titles[n]}</small>`;
    d.append(avatarCanvas(o.ch, 72, { dir: -1, mood: r ? (r.win ? "sad" : "happy") : "" }));
    d.insertAdjacentHTML("beforeend", `<b>${charById(o.ch).name}</b><small>${DIFFS[o.diff].name} · ${arenaById(o.arena).name}</small>` + (r ? `<span class="res">${r.s[0]} : ${r.s[1]}</span>` : ""));
    br.append(d);
  });
  const tr = document.createElement("div"); tr.className = "round trophy" + (c.done && c.round >= 3 ? " won" : ""); tr.textContent = "🏆"; br.append(tr);
  const btn = $("btnCupNext");
  if (c.done) { $("cupNote").textContent = c.round >= 3 ? "Du hast den Cup gewonnen! +300 Münzen" : "Ausgeschieden. Nächstes Mal!"; btn.textContent = "Zurück zum Menü"; }
  else { $("cupNote").textContent = `${titles[c.round]} gegen ${charById(c.ops[c.round].ch).name}`; btn.textContent = c.round === 0 ? "Los geht's!" : "Nächstes Spiel"; }
  App.stack = ["home"];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-cup"); App.screen = "cup"; $("touch").hidden = true;
  document.body.classList.remove("ingame"); $("gameBtns").hidden = true;
  if (App.mode !== "demo") { startDemo(); A.crowdOff(); A.music(true, "menu"); }
}
function cupNext() {
  const c = App.cup;
  if (c.done) { App.cup = null; quitToMenu(); return; }
  const o = c.ops[c.round];
  beginMatch({ mode: "cup", chars: [S.char, o.ch], arena: o.arena, dur: 60, pus: true, mod: null, golden: true, diff: o.diff, names: [S.name || "Du", charById(o.ch).name], labels: ["DU", null], ball: S.ball });
}

// Shop
let shopTab = "chars";
function shopScreen() {
  $$("#shopTabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === shopTab));
  const g = $("shopGrid"); g.innerHTML = "";
  const kind = shopTab;
  const items = kind === "chars" ? CHARS : kind === "balls" ? BALLS : ARENAS;
  items.forEach(it => {
    const d = document.createElement("div"); d.className = "sitem";
    const own = owns(kind, it.id), eq = (kind === "chars" ? S.char : kind === "balls" ? S.ball : S.arena) === it.id;
    d.classList.toggle("eq", eq);
    const prev = document.createElement("div"); prev.className = "prev";
    if (kind === "chars") prev.append(avatarCanvas(it.id, 100));
    else if (kind === "balls") { const c = document.createElement("canvas"); const r = Math.min(2, devicePixelRatio || 1); c.width = c.height = 90 * r; c.style.width = c.style.height = "90px"; const x = c.getContext("2d"); x.scale(r, r); drawBall(x, it.id, 45, 45, 32, 0.4); prev.append(c); }
    else { const c = arenaThumb(it.id, 200, 100); c.className = "wide"; prev.append(c); }
    d.append(prev);
    const desc = kind === "chars" ? "Super: " + SUPERS[it.super].name : kind === "arenas" ? it.desc : "Ballmuster";
    d.insertAdjacentHTML("beforeend", `<b>${it.name}</b><small>${desc}</small>`);
    const btn = document.createElement("button");
    if (eq) { btn.className = "ghost"; btn.textContent = "Ausgewählt"; btn.disabled = true; }
    else if (own) { btn.className = "ghost"; btn.textContent = "Auswählen"; btn.onclick = () => { A.sfx("click"); if (kind === "chars") S.char = it.id; else if (kind === "balls") S.ball = it.id; else S.arena = it.id; save(); shopScreen(); homeScreen(); }; }
    else { btn.className = "cta buy"; btn.innerHTML = `<span class="coin"></span>${it.price}`; btn.disabled = S.coins < it.price; btn.onclick = () => { if (buy(kind, it.id, it.price)) { A.sfx("coin"); toast(it.name + " gekauft!", true); if (kind === "chars") S.char = it.id; else if (kind === "balls") S.ball = it.id; else S.arena = it.id; save(); checkAch({}); refreshTop(); shopScreen(); } }; }
    d.append(btn); g.append(d);
  });
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}
function achScreen() {
  const l = $("achList"); l.innerHTML = "";
  const icons = ["🥇", "🎩", "🧤", "🗿", "⚡", "⏱️", "🚀", "🔄", "🏆", "👑", "🌐", "🎭", "🎁", "⚽", "🦘", "🔥"];
  ACHIEVEMENTS.forEach((a, n) => {
    const done = !!S.ach[a.id], p = achProgress(a);
    const d = document.createElement("div"); d.className = "ach" + (done ? " done" : "");
    d.innerHTML = `<span class="medal">${icons[n] || "⭐"}</span><div style="flex:1;min-width:0"><b>${a.name}</b><p>${a.desc}</p>${a.stat && !done ? `<div class="prog"><i style="width:${Math.round(p * 100)}%"></i></div>` : ""}</div><span class="rw">${done ? "✓" : "+" + a.reward}</span>`;
    l.append(d);
  });
  $("achSum").textContent = Object.keys(S.ach).length + " / " + ACHIEVEMENTS.length;
}
function settingsScreen() {
  toggle($("tglSfx"), S.sfx, v => { S.sfx = v; A.setSfx(v); save(); });
  toggle($("tglMusic"), S.music, v => { S.music = v; A.setMusic(v); save(); });
  toggle($("tglVib"), S.vib, v => { S.vib = v; I.setVibration(v); save(); });
  seg($("segQual"), [{ v: "high", t: "Hoch" }, { v: "low", t: "Schnell" }], S.quality, v => { S.quality = v; setQuality(v); save(); });
}

// Kleine UI-Helfer
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
function toast(text, gold) {
  const t = document.createElement("div"); t.className = "toast" + (gold ? " gold" : ""); t.textContent = text;
  $("toasts").append(t); setTimeout(() => t.remove(), 3300);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
}
function modal(html, btnText = "Weiter", onClose) {
  const m = $("modal"), c = $("modalCard");
  c.innerHTML = html + `<button class="cta big" id="modalOk">${btnText}</button>`;
  m.hidden = false;
  $("modalOk").onclick = () => { A.sfx("click"); m.hidden = true; onClose && onClose(); };
  if (I.usedPad) $("modalOk").focus();
}
function dailyModal(d) {
  const days = Array.from({ length: 7 }, (_, n) => `<i class="${n < d.streak ? "on" : ""}">${n + 1}</i>`).join("");
  modal(`<div class="bigemo">🎁</div><h3>Tagesbonus</h3><p>Tag ${d.streak} in Folge: <b>+${d.amount} Münzen</b></p><div class="streak">${days}</div><p style="font-size:15px;color:var(--muted)">Komm morgen wieder, dann gibt's mehr.</p>`, "Einsammeln", () => { A.sfx("coin"); refreshTop(); });
}
function levelModal(lvl) {
  A.sfx("levelup");
  const bonus = 50 + lvl * 10; addCoins(bonus); save(); refreshTop();
  const next = CHARS.find(c => !owns("chars", c.id));
  modal(`<div class="bigemo">⬆️</div><h3>Level ${lvl}!</h3><p>Bonus: <b>+${bonus} Münzen</b></p>` + (next ? `<p style="font-size:16px;color:var(--muted)">Nächster Kopf im Shop: ${next.name} (${next.price})</p>` : ""));
}
function tasksModal() {
  const tl = tasks();
  const rows = tl.map(t => `<div class="task${t.done ? " done" : ""}"><b>${esc(t.text)}<span>${t.done ? "✓" : "+" + t.reward}</span></b><div class="prog"><i style="width:${Math.round(t.prog / t.n * 100)}%"></i></div></div>`).join("");
  modal(`<h3>Tagesaufgaben</h3><div class="tasklist">${rows}</div><p style="font-size:15px;color:var(--muted)">Jeden Tag gibt's drei neue.</p>`, "Alles klar");
}
function trophyModal() {
  A.sfx("levelup");
  modal(`<div class="bigemo">🏆</div><h3>Pokalsieger!</h3><p>Drei Gegner, drei Siege. Der Pokal gehört dir.</p>`, "Feiern");
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Pause, Tasten, Controller ----------
function pause(on) {
  if (!inGame() && on) return;
  const online = App.mode === "host" || App.mode === "guest";
  App.paused = on && !online;
  if (on) {
    $("btnRestart").hidden = online || App.mode === "cup";
    $("btnQuit").textContent = online ? "Spiel verlassen" : App.mode === "cup" ? "Cup aufgeben" : "Aufgeben";
    $$(".screen").forEach(s => s.hidden = s.id !== "scr-pause"); App.screen = "pause"; $("touch").hidden = true;
    A.crowd(0);
  } else { $("scr-pause").hidden = true; App.screen = null; $("touch").hidden = false; A.crowd(0.3); }
}
function onKey(code) {
  A.unlock();
  if (code === "Escape" || code === "KeyP") {
    if (inGame()) { pause(true); return; }
    if (App.screen === "pause") { pause(false); return; }
    if (code === "Escape" && App.screen && !["home", "end"].includes(App.screen)) { goBack(); return; }
  }
  if (inGame() && /^Digit[1-6]$/.test(code) && App.mode !== "local") sendEmote(EMOTES[+code.slice(5) - 1]);
  if (inGame() && App.st.ph === "goal" && (code === "Space" || code === "Enter") && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st);
}
function onPad(btn) {
  A.unlock();
  if (btn === 9) { if (inGame()) pause(true); else if (App.screen === "pause") pause(false); return; }
  if (inGame()) { if (btn === 0 && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st); return; }
  if (!$("modal").hidden) { if (btn === 0) $("modalOk").click(); return; }
  const scr = App.screen && $("scr-" + App.screen);
  if (!scr) return;
  if (btn === 1) { const b = scr.querySelector("[data-back], #btnLobbyLeave"); if (b) b.click(); else if (App.screen === "pause") pause(false); return; }
  if (btn === 0) { const a = document.activeElement; if (a && scr.contains(a)) a.click(); else focusFirst(scr); return; }
  const dirs = { 12: [0, -1], 13: [0, 1], 14: [-1, 0], 15: [1, 0] };
  if (dirs[btn]) moveFocus(scr, dirs[btn]);
}
function focusFirst(scr) { const f = scr.querySelector(".cta:not(:disabled), .mbtn, button:not(:disabled)"); if (f) f.focus(); }
function moveFocus(scr, [dx, dy]) {
  const items = $$("button:not(:disabled), input", scr).filter(e => e.offsetParent !== null);
  const cur = document.activeElement;
  if (!cur || !scr.contains(cur)) { focusFirst(scr); return; }
  const r0 = cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
  let best = null, bd = 1e9;
  for (const e of items) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2];
    const vx = c[0] - c0[0], vy = c[1] - c0[1];
    const along = vx * dx + vy * dy; if (along <= 4) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const d = along + across * 2.2;
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

// ---------- Verdrahtung ----------
function wireUI() {
  $$("[data-back]").forEach(b => b.onclick = goBack);
  $("btnPlay").onclick = () => { A.sfx("click"); selectScreen({ title: "Wähle deinen Kopf", onDone: id => { S.char = id; save(); setupScreen({ mode: "cpu", cpu: true }); } }); };
  $("btnLocal").onclick = () => { A.sfx("click"); App.local2 = []; selectScreen({ title: "Spieler 1: Kopf wählen", cur: S.char, onDone: id => { App.local2[0] = id; selectScreen({ title: "Spieler 2: Kopf wählen", cur: CHARS.find(c => c.id !== id && owns("chars", c.id)).id, onDone: id2 => { App.local2[1] = id2; setupScreen({ mode: "local", cpu: false }); } }); } }); };
  $("btnCup").onclick = () => { A.sfx("click"); selectScreen({ title: "Mit wem holst du den Pokal?", onDone: id => { S.char = id; save(); startCup(); } }); };
  $("btnOnline").onclick = () => { A.sfx("click"); $("nameIn").value = S.name || ""; netNote(Net.available() ? "Spiel erstellen und den Link schicken. Kein Account nötig." : "Online-Modus lädt…"); showScreen("online"); };
  $("btnShop").onclick = () => { A.sfx("click"); showScreen("shop"); };
  $("btnAch").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("btnTasks").onclick = () => { A.sfx("click"); tasksModal(); };
  $("btnSettings").onclick = () => { A.sfx("click"); showScreen("settings"); };
  $("homeCoins").onclick = () => { A.sfx("click"); showScreen("shop"); };
  $("homeLvl").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("meHead").onclick = () => { A.sfx("click"); selectScreen({ title: "Dein Kopf", okText: "Übernehmen", onDone: id => { S.char = id; save(); goBack(); homeScreen(); } }); };
  $("btnSelOk").onclick = selOk;
  $("btnKickoff").onclick = kickoffFromSetup;
  $("btnCupNext").onclick = () => { A.sfx("click"); cupNext(); };
  $("btnHost").onclick = () => { A.sfx("click"); hostGame(); };
  $("btnJoin").onclick = () => { A.sfx("click"); tryJoin(); };
  $("codeIn").addEventListener("keydown", e => { if (e.key === "Enter") tryJoin(); });
  $("btnLobbyLeave").onclick = goBack;
  $("btnLobbyStart").onclick = () => { A.sfx("click"); hostStart(); };
  $("btnLobbyHead").onclick = () => { A.sfx("click"); selectScreen({ title: "Kopf wechseln", okText: "Übernehmen", onDone: id => { S.char = id; save(); Net.send({ t: "pick", ch: id }); goBack(); } }); };
  $("btnShare").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) shareOrCopy({ title: "Kopfball Duell", text: "Komm, Kopfball Duell gegen mich! 😤⚽", url: link }); };
  $$("#shopTabs button").forEach(b => b.onclick = () => { A.sfx("click"); shopTab = b.dataset.tab; shopScreen(); });
  $("btnEndAgain").onclick = endAgain;
  $("btnEndMenu").onclick = endMenu;
  $("btnEndShare").onclick = shareResult;
  $("btnPause").onclick = () => { A.sfx("click"); pause(true); };
  $("btnResume").onclick = () => { A.sfx("click"); pause(false); };
  $("btnRestart").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; beginMatch({ ...App.lastCfg }); };
  $("btnQuit").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); } else quitToMenu(); };
  $("btnFull").onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFullscreen(); };
  $("btnReset").onclick = () => { if (confirm("Wirklich alles löschen? Münzen, Köpfe und Erfolge sind dann weg.")) { resetSave(); location.reload(); } };
  const bar = $("emoteBar");
  EMOTES.forEach((e, n) => { const b = document.createElement("button"); b.textContent = e; b.title = "Taste " + (n + 1); b.onclick = () => sendEmote(e); bar.append(b); });
  $("btnEmote").onclick = () => { bar.hidden = !bar.hidden; };
  // Tippen auf das Feld überspringt die Wiederholung
  $("cv").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st); });
  $("touch").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START - 0.3) skipCelebration(App.st); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && inGame() && App.mode !== "host" && App.mode !== "guest") pause(true); });
}

boot();
