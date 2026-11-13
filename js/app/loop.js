// Hauptschleife: Eingaben sammeln, Spiel fortschreiben, zeichnen, Wiederholung aufnehmen
import { clamp, MODS } from "../content/config.js";
import { advance, REPLAY_END, REPLAY_START } from "../core/physics.js";
import { S, save } from "./profile.js";
import { render, setQuality, viewStamp } from "../ui/render/render.js";
import { onEvent } from "./effects.js";
import { netWaitTick, pingHud, pingTick, sessionTick, watchNet } from "./online.js";
import { rbFrame, rbView } from "./rbnet.js";
import { matchEnd, seriesText } from "./results.js";
import { App, inGame, myIdx, vsCpu } from "./state.js";
import { $, toast } from "../ui/dom.js";
import { drawShowcase } from "../ui/screens/home.js";
import { drawSearchJuggle } from "../ui/screens/search.js";
import { audio as A, input as I } from "./services.js";
import { t } from "../content/i18n.js";

export let lastT = performance.now(), simT = 0;
export const perf = { t: 0, n: 0, slow: 0 };
// Mess-Overlay nur mit ?perf (perfhud.js): sonst bleibt PH null und kostet nichts
let PH = null;
if (typeof location !== "undefined" && /[?&]perf(=|&|$)/.test(location.search)) import("./perfhud.js").then(m => { PH = m.startPerf(/[?&]perf=flush/.test(location.search)); });

// Ein Fehler in einem Frame (z. B. beim Zeichnen) darf das Spiel nicht einfrieren: nächsten Frame immer anmelden,
// den Fehler einmal pro Meldung in die Konsole schreiben
const seenErr = new Set();
export function loop(now) {
  requestAnimationFrame(loop);
  if (PH) PH.begin(now);
  try { frame(now); } catch (e) { const k = String(e && e.message); if (!seenErr.has(k)) { seenErr.add(k); console.error("frame error", e); } }   // i18n-ok: Konsole
  if (PH) PH.end();
}
function frame(now) {
  const raw = (now - lastT) / 1000;
  const dt = Math.min(0.05, raw); lastT = now; simT += dt;
  if (S.quality === "high" && inGame() && raw < 0.5) {
    perf.t += raw; perf.n++;
    if (perf.t > 3) { if (perf.n / perf.t < 42) { perf.slow++; if (perf.slow >= 2) { S.quality = "low"; save(); setQuality("low"); toast(t("perf.lowQuality")); } } else perf.slow = 0; perf.t = 0; perf.n = 0; }
  }
  I.pollPads();
  let st = App.st;
  const rotated = I.isTouch && window.innerHeight > window.innerWidth && inGame();
  $("rotate").hidden = !rotated;
  watchNet(now);
  const netWait = netWaitTick(now);   // Verbindung weg: Spiel steht, bis der andere zurück ist oder die Zeit um ist
  if (PH) PH.simStart();
  if (netWait) { /* nur zeichnen */ }
  // Rollback: beide rechnen. Echte Zeit (bis 0,25 s): nach einem Hänger holt diese Seite auf, statt dauerhaft hinterherzulaufen
  else if (App.mode === "host" || App.mode === "guest") { if (App.rb) { rbFrame(Math.min(0.25, raw)); pingTick(dt); st = App.st; } }   // ohne Sitzung: wartet auf den Gast bzw. den Anpfiff
  else if (App.mode === "demo") { /* Menü: kein Spiel im Hintergrund, nur ein Standbild der Arena */ }
  else if (!App.paused && !rotated) App.acc = advance(st, dt, gatherInputs(), App.acc);
  if (PH) PH.simEnd();
  pingHud(dt);
  sessionTick(dt);
  takeEvents(st);
  // Wiederholung aufnehmen (Rollback: aus endgültigen Takten, rbnet.js)
  if (st.ph === "play" && App.mode !== "demo" && !App.rb) { App.rec.push(snap(st)); if (App.rec.length > 200) App.rec.shift(); }
  let replay = null, frac = 0;
  if (st.ph === "goal" && App.replay && st.pt < REPLAY_START && st.pt > REPLAY_END) { replay = App.replay; frac = (REPLAY_START - st.pt) / (REPLAY_START - REPLAY_END); }
  A.replayMusic(replay && App.mode !== "demo" && inGame() && !App.paused && !rotated && !netWait ? replay : null);
  if ((st.ph === "ko" || st.ph === "cd") && !App.rb) App.rec = [];
  if (App.mode !== "demo" && !App.rb) { const me = myIdx(); if (me >= 0) App.maxDef = Math.max(App.maxDef, st.s[1 - me] - st.s[me]); }   // Rollback: rbnet.js (endgültig)
  const la = st.ph === "cd" ? 1 : st.ph === "play" && App.goT >= 0 ? clamp(1 - (simT - App.goT - 1.5) / 0.6, 0, 1) : 0;
  const labels = (App.labels || []).map(lb => (lb ? { t: lb, a: la } : null));
  if (PH) PH.drawStart();
  if (App.mode === "demo") {
    // Standbild nur zeichnen, wenn es neu ist oder sich die Größe geändert hat
    // unscharf wie der CSS-Filter in style.css, wenn ein Menü darüber liegt (render.js rechnet die Unschärfe einmal ein)
    const blur = !["", "end", "pause"].includes(document.body.dataset.scr || "");
    const key = viewStamp() + ":" + st.arena + ":" + (document.fonts ? document.fonts.status : "") + ":" + blur;   // Schrift nachgeladen: neu zeichnen
    if (App.stillKey !== key) { App.stillKey = key; render(st, simT, { dt, still: true, noHud: true, blur }); }
  } else render(App.rb ? rbView(st) : st, simT, { dt, frozen: !!(App.paused || rotated || netWait), names: App.names, labels, ballSkin: App.ball, replay, replayFrac: frac, noHud: App.mode === "demo", canSkip: App.mode !== "guest", series: seriesText(), modName: st.mod ? (MODS.find(m => m.id === st.mod) || {}).name : "" });
  if (PH) PH.drawEnd($("cv"));
  if (App.mode !== "demo") I.touchHud(st);
  // Spielende (Rollback: erst wenn es endgültig ist, nicht schon nach einer Vorhersage)
  // (an genau dieses Spiel gebunden: wer in den 900 ms ins Menü geht oder ein neues Spiel bekommt, wird nicht gewertet)
  if (st.ph === "end" && !App.endShown && App.mode !== "demo" && (!App.rb || App.rb.ended)) {
    App.endShown = true;
    // offene Wertung mit eigenem Merkzeichen: läuft genau einmal, entweder hier nach 900 ms oder vorher beim Verlassen
    // (settlePending). Rollback: an die Sitzung gebunden, der angezeigte Zustand wechselt dort zum endgültigen.
    const pend = App.endPend = { s0: App.rb || App.st, mode: App.mode, key: App.matchKey };
    setTimeout(() => { if (App.endPend === pend && (App.rb || App.st) === pend.s0 && App.mode === pend.mode) { App.endPend = null; matchEnd(pend.key); } }, 900);
  }
  if (App.screen === "home") drawShowcase(dt);
  else if (App.screen === "search") drawSearchJuggle(dt);
}

function takeEvents(st) { if (st.ev.length) for (const e of st.ev.splice(0)) onEvent(e); }

/** Eingaben offline (der Computer-Gegner rechnet seine im Physikschritt selbst, st.bot) */
export function gatherInputs() {
  if (vsCpu()) return [I.getInput(0, "single"), {}];
  if (App.mode === "local") return [I.getInput(0, "local"), I.getInput(1, "local")];
  return [{}, {}];
}

/** Bild für die Wiederholung: was die Darstellung zeichnet, inklusive Feldwirkungen der Power-ups (Kopien, das Spiel läuft weiter) */
export function snap(st) {
  return { obsP: (st.obs || []).map(o => ({ x: o.x, y: o.y })), arena: st.arena, s: st.s, t: st.t, ph: st.ph, gold: st.gold, mod: st.mod, rules: st.rules,
    wind: { ...st.wind }, wall: [...st.wall], wallHp: [...st.wallHp], bigGoal: [...st.bigGoal], clone: st.clone.map(c => ({ ...c })), slow2: [...st.slow2],
    floatT: st.floatT, portal: st.portal && { ...st.portal }, pu: st.pu.map(u => ({ ...u })),
    b: { ...st.b, stick: st.b.stick && { ...st.b.stick } }, p: st.p.map(p => ({ ...p })) };
}
