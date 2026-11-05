// Spiel einstellen: Arena, Hindernisse, Gegner, Regeln
import { ARENAS, CHARS, DIFFS } from "../../content/config.js";
import { buildObstacles, layoutsFor, moveObstacles } from "../../content/layouts.js";
import { matchLen } from "../../core/physics.js";
import { buy, owns, S, save } from "../../app/profile.js";
import { arenaThumb, layoutPreview } from "../render/render.js";
import { beginMatch } from "../../app/game.js";
import { cpuNames } from "../../app/modes.js";
import { App } from "../../app/state.js";
import { $, seg, toast } from "../dom.js";
import { showScreen, registerScreen } from "../nav.js";
import { refreshTop } from "./home.js";
import { rulesSummary, rulesScreen } from "./rules.js";
import { audio as A } from "../../app/services.js";

export let setupCtx = null;

export function setupScreen(ctx) {
  setupCtx = ctx;
  $("setupTitle").textContent = ctx.mode === "train" ? "Training" : ctx.mode === "local" ? "Zu zweit" : "Schnelles Spiel";
  $("optDiff").hidden = ctx.mode !== "cpu";
  refreshSetup();
  showScreen("setup");
}

export function obsChoices(arena) {
  return [{ v: "off", t: "Aus" }, ...layoutsFor(arena).map((l, i) => ({ v: i, t: l.name })), { v: "rnd", t: "Zufall" }];
}

export function obsInfo(arena, v) {
  if (v === "off" || v === undefined) return { desc: "Klassisch, freies Feld.", list: [] };
  if (v === "rnd") return { desc: "Jedes Spiel ein anderes Layout dieser Arena.", list: [] };
  const l = layoutsFor(arena)[v]; if (!l) return { desc: "", list: [] };
  const list = buildObstacles(arena, v); moveObstacles(list, 0, 0);
  return { desc: l.desc, list };
}

export function renderObs() {
  const cur = S.rules.obs ?? "off";
  seg($("segObs"), obsChoices(S.arena), cur, v => { if (v === "off") delete S.rules.obs; else S.rules.obs = v; save(); renderObs(); });
  const info = obsInfo(S.arena, cur);
  const pv = $("obsPrev"); pv.innerHTML = ""; if (info.list.length) pv.append(layoutPreview(S.arena, info.list, 190, 84));
  $("obsDesc").textContent = info.desc;
}

export function refreshSetup() {
  if (!setupCtx) return;
  renderArenas();
  renderObs();
  seg($("segDiff"), DIFFS.map(d => ({ v: d.id, t: d.name })), S.diff, v => { S.diff = v; save(); });
  $("rulesSum").textContent = rulesSummary(S.rules);
}

export function renderArenas() {
  const list = $("arenaList"); list.innerHTML = "";
  if (!owns("arenas", S.arena)) S.arena = "stadion";
  ARENAS.forEach(a => {
    const b = document.createElement("button"); b.className = "atile"; const locked = !owns("arenas", a.id);
    b.classList.toggle("locked", locked); b.classList.toggle("on", S.arena === a.id);
    b.append(arenaThumb(a.id, 240, 150));
    b.insertAdjacentHTML("beforeend", `<span class="cap"><b>${a.name}</b><small>${a.desc}</small></span>` + (locked ? `<span class="lock"><span class="coin"></span>${a.price}</span>` : ""));
    b.onclick = () => {
      if (locked) { if (buy("arenas", a.id, a.price)) { A.sfx("coin"); toast(a.name + " freigeschaltet!", "i-stadium", true); refreshTop(); } else { toast(`Dafür brauchst du ${a.price} Münzen`, "i-lock"); return; } }
      A.sfx("click"); S.arena = a.id; save(); renderArenas(); renderObs();
    };
    list.append(b);
  });
}

export function kickoffFromSetup() {
  A.sfx("click");
  const base = { arena: S.arena, dur: matchLen(S.rules).dur, rules: { ...S.rules }, golden: true, ball: S.ball };
  if (setupCtx.mode === "cpu") {
    const pool = CHARS.filter(c => c.id !== S.char);
    const opp = pool[Math.floor(Math.random() * pool.length)].id;
    beginMatch({ ...base, mode: "cpu", chars: [S.char, opp], diff: S.diff, names: cpuNames(opp), labels: ["DU", null] });
  } else if (setupCtx.mode === "local") {
    beginMatch({ ...base, mode: "local", chars: [App.local2[0], App.local2[1]], diff: 1, names: ["Spieler 1", "Spieler 2"], labels: ["P1", "P2"] });
  } else if (setupCtx.mode === "train") {
    const pool = CHARS.filter(c => c.id !== S.char);
    const opp = pool[Math.floor(Math.random() * pool.length)].id;
    beginMatch({ ...base, mode: "train", train: true, keeper: true, mod: "superfast", rules: { ...S.rules, len: 90, win: 0 }, chars: [S.char, opp], diff: 1, golden: false, names: [S.name || "Du", "Torwart"], labels: ["DU", null] });
  }
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initSetup() {
  registerScreen("setup", { resume: refreshSetup });
  $("btnKickoff").onclick = kickoffFromSetup;
  $("btnRules").onclick = () => { A.sfx("click"); S.rules = S.rules || {}; rulesScreen(S.rules, () => save()); };
}
