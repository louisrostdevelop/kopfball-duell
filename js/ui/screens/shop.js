// Shop: Köpfe, Bälle, Arenen, Angebot des Tages
import { ARENAS, BALLS, charById, CHARS, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { buy, buyDeal, checkAch, deal, owns, S, save } from "../../store.js";
import { avatarCanvas, drawBall } from "../render/art.js";
import { arenaThumb } from "../render/render.js";
import { $, $$, RCOL, svg, toast } from "../dom.js";
import { unlockModal } from "../modals.js";
import { refreshTop } from "./home.js";
import * as A from "../../adapters/audio/webaudio.js";

export let shopTab = "chars";

export function setShopTab(t) { shopTab = t; shopScreen(); }

export function shopScreen() {
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

export function ballCanvas(id, px) {
  const c = document.createElement("canvas"), r = Math.min(2, devicePixelRatio || 1);
  c.width = c.height = px * r; c.style.width = c.style.height = px + "px";
  const x = c.getContext("2d"); x.scale(r, r); drawBall(x, id, px / 2, px / 2, px * 0.36, 0.4); return c;
}
