// Kopf-Auswahl und Freischalten
import { charById, CHARS, clamp, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { buy, checkAch, owns, S } from "../../store.js";
import { avatarCanvas } from "../render/art.js";
import { App } from "../../app/state.js";
import { $, $$, RCOL, svg } from "../dom.js";
import { unlockModal } from "../modals.js";
import { showScreen } from "../nav.js";
import { refreshTop } from "./home.js";
import * as A from "../../adapters/audio/webaudio.js";

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
  $("ciStats").innerHTML = bar("Tempo", c.spd) + bar("Sprung", c.jmp) + bar("Schuss", c.pow);
  const ok = $("btnSelOk");
  if (locked) { ok.className = "btn yellow"; ok.disabled = S.coins < c.price; ok.innerHTML = S.coins >= c.price ? `<span class="coin"></span>Freischalten · ${c.price}` : `Noch ${c.price - S.coins} Münzen`; }
  else { ok.className = "btn green"; ok.disabled = false; ok.textContent = selCtx.okText || "Auswählen"; }
  $$(".coinNum").forEach(e => e.textContent = S.coins);
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
