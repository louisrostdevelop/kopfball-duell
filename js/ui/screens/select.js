// Kopf-Auswahl und Freischalten
import { charById, CHARS, clamp, HEAD_MAX_LEVEL, headBonus, leveledStats, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { buy, checkAch, owns, S } from "../../app/profile.js";
import { avatarCanvas } from "../render/art.js";
import { App } from "../../app/state.js";
import { $, $$, RCOL, svg, toast } from "../dom.js";
import { unlockModal } from "../modals.js";
import { showScreen } from "../nav.js";
import { refreshTop } from "./home.js";
import { audio as A } from "../../app/services.js";
import { online as serverOn, upgradeCost, upgradeHead } from "../../app/account.js";
import { headLevel } from "../../app/game.js";

export let selCtx = null;

export function selectScreen(opts) {
  selCtx = { ...opts, pick: opts.cur || S.char };
  $("selTitle").textContent = opts.title;
  const grid = $("charGrid"); grid.innerHTML = "";
  CHARS.forEach(c => {
    const b = document.createElement("button"); b.className = "ccard"; b.dataset.id = c.id;
    const locked = !owns("chars", c.id), rar = rarityOf(c);
    b.style.setProperty("--rc", RCOL[rar]);
    b.classList.toggle("locked", locked);
    b.append(avatarCanvas(c.id, 84));
    if (!locked && headLevel(c.id) > 1) b.insertAdjacentHTML("beforeend", `<span class="lvtag">Lv ${headLevel(c.id)}</span>`);
    b.insertAdjacentHTML("beforeend", `<b>${c.name}</b>` + (locked ? `<svg class="lockt"><use href="#i-lock"/></svg><span class="price"><span class="coin"></span>${c.price}</span>` : ""));
    if (opts.p2 && c.id === S.char) b.insertAdjacentHTML("beforeend", '<span class="p2tag">P1</span>');
    b.onclick = () => { A.sfx("click"); selCtx.pick = c.id; selUpdate(); };
    grid.append(b);
  });
  selUpdate();
  showScreen("select");
}

export function selUpdate() {
  const c = charById(selCtx.pick), locked = !owns("chars", c.id), rar = rarityOf(c);
  $$(".ccard").forEach(t => { t.classList.toggle("on", t.dataset.id === c.id); t.querySelector(".check")?.remove(); });
  const cur = $$(".ccard").find(t => t.dataset.id === (selCtx.p2 ? "" : S.char)); if (cur && !selCtx.p2) cur.insertAdjacentHTML("beforeend", `<span class="check">${svg("i-check")}</span>`);
  $("detTop").style.setProperty("--rc", RCOL[rar]);
  $("ciRarity").textContent = RARITY[rar];
  const big = $("bigAv"); big.innerHTML = ""; big.append(avatarCanvas(c.id, innerHeight < 430 ? 86 : innerHeight < 520 ? 120 : 180, { mood: "happy" }));
  $("ciName").textContent = c.name;
  $("ciSuper").textContent = SUPERS[c.super].name; $("ciDesc").textContent = SUPERS[c.super].desc;
  const bar = (l, v) => `<span>${l}</span><span class="bar"><i style="width:${Math.round(clamp((v - 0.8) / 0.45, 0.08, 1) * 100)}%"></i></span>`;
  const lc = leveledStats(c, locked ? 1 : headLevel(c.id));   // Balken mit Kopf-Level
  $("ciStats").innerHTML = bar("Tempo", lc.spd) + bar("Sprung", lc.jmp) + bar("Schuss", lc.pow);
  levelBox(c, locked);
  const ok = $("btnSelOk");
  if (locked) { ok.className = "btn yellow"; ok.disabled = S.coins < c.price; ok.innerHTML = S.coins >= c.price ? `<span class="coin"></span>Freischalten · ${c.price}` : `Noch ${c.price - S.coins} Münzen`; }
  else { ok.className = "btn green"; ok.disabled = false; ok.textContent = selCtx.okText || "Auswählen"; }
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}

// Kopf-Level (nur mit Server): Stufe, Kopf-XP aus Spielen, Aufwerten mit Münzen (fehlende XP mit Juwelen)
const pct = v => (Math.round(v * 1000) / 10).toString().replace(".", ",") + " %";
function levelBox(c, locked) {
  const box = $("ciLevel"); box.hidden = !serverOn() || locked || !(S.heads && S.heads[c.id]); if (box.hidden) return;
  const lv = headLevel(c.id), cost = upgradeCost(c.id, HEAD_MAX_LEVEL), b = headBonus(lv);
  const h = S.heads[c.id];
  box.innerHTML = `<div class="hl-top"><b>Level ${lv}</b><small>von ${HEAD_MAX_LEVEL}</small><span class="grow"></span><em>${b ? `+${pct(b)} Schuss · Super ${pct(b)} schneller` : "Grundwerte"}</em></div>`
    + (cost ? `<span class="hl-bar"><i style="width:${Math.min(100, Math.round(h.xp / cost.need * 100))}%"></i><em>${Math.min(h.xp, cost.need)}/${cost.need} Kopf-XP</em></span>` : '<p class="hint">Höchste Stufe erreicht.</p>');
  if (!cost) return;
  const btn = document.createElement("button");
  const gems = cost.missing > 0;
  btn.className = "btn small " + (gems ? "pink" : "yellow");
  btn.innerHTML = `Aufwerten · <span class="coin"></span>${cost.coins}` + (gems ? ` + <span class="gem"></span>${cost.gems}` : "");
  btn.disabled = S.coins < cost.coins || (gems && (S.gems || 0) < cost.gems);
  btn.title = gems ? `Es fehlen ${cost.missing} Kopf-XP. Die gibt es durch Spiele mit diesem Kopf oder für Juwelen.` : "";
  btn.onclick = async () => {
    btn.disabled = true;
    try { await upgradeHead(c.id, gems); A.sfx("levelup"); toast(`${c.name} ist jetzt Level ${headLevel(c.id)}`, "i-star", true); refreshTop(); selectScreen({ ...selCtx, cur: c.id }); App.stack.pop(); }
    catch (e) { toast("Aufwerten hat nicht geklappt", "i-close"); btn.disabled = false; }
  };
  box.append(btn);
  if (gems) box.insertAdjacentHTML("beforeend", `<p class="hint">Noch ${cost.missing} Kopf-XP: spiel mit ${c.name} oder füll mit Juwelen auf.</p>`);
}

export function selOk() {
  const c = charById(selCtx.pick);
  if (!owns("chars", c.id)) {
    if (buy("chars", c.id, c.price)) { A.sfx("levelup"); unlockModal(c); checkAch({}); refreshTop(); selectScreen({ ...selCtx, cur: c.id }); App.stack.pop(); }
    return;
  }
  A.sfx("click");
  selCtx.onDone(c.id);
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initSelect() {
  $("btnSelOk").onclick = selOk;
}
