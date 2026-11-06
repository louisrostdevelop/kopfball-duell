// Kisten: Übersicht (ungeöffnete Kisten, Splitter, Garantien, Chancen), Öffnen mit Enthüllung
import { charById, RARITY } from "../../content/config.js";
import { CHEST_TIERS, CHESTS, cosById, PITY } from "../../content/cosmetics.js";
import { S } from "../../app/profile.js";
import { onSync, openChest } from "../../app/account.js";
import { App } from "../../app/state.js";
import { avatarCanvas } from "../render/art.js";
import { refreshTop } from "./home.js";
import { $, esc, modal, toast } from "../dom.js";
import { registerScreen, showScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";
import { num, t } from "../../content/i18n.js";

const pct = p => num(p >= 0.1 ? Math.round(p * 100) : Math.round(p * 1000) / 10) + " %";

/** Kiste als Bild (CSS), Farben nach Stufe */
export function chestEl(tier, size = 96) {
  const c = CHESTS[tier], d = document.createElement("span");
  d.className = "chest"; d.style.setProperty("--c1", c.c1); d.style.setProperty("--c2", c.c2); d.style.setProperty("--s", size + "px");
  d.innerHTML = "<i class=\"lid\"></i><i class=\"box\"></i><i class=\"lock\"></i>";
  return d;
}

/** Platzhalter-Symbol für Kosmetik: einfache Form in der Farbe des Gegenstands */
export function cosIcon(id, size = 56) {
  const c = cosById(id), d = document.createElement("span");
  d.className = "cosic k-" + (c ? c.kind : "x"); d.style.setProperty("--col", c ? c.col : "#ccc"); d.style.setProperty("--s", size + "px");
  if (c && c.kind === "emoji") d.textContent = c.glyph;
  else d.innerHTML = `<svg viewBox="0 0 48 48"><use href="#cos-${c ? c.kind : "hat"}"/></svg><b>${c ? c.n : ""}</b>`;
  return d;
}
export const itemName = id => { const [k, x] = id.split(":"); return k === "head" ? charById(x).name : (cosById(id) || { name: id }).name; };

function render() {
  $("chestShards").textContent = num(S.shards || 0);
  const grid = $("chestGrid"); grid.innerHTML = "";
  const count = Object.fromEntries(CHEST_TIERS.map(k => [k, S.chests.filter(c => c.tier === k).length]));
  for (const k of CHEST_TIERS) {
    const b = document.createElement("button"); b.className = "chesttile" + (count[k] ? "" : " empty"); b.dataset.tier = k;
    b.append(chestEl(k, 86));
    b.insertAdjacentHTML("beforeend", `<b>${t("chest." + k)}</b><em>${count[k] ? "×" + count[k] : t("chest.none")}</em>`);
    b.disabled = !count[k];
    b.onclick = () => openNext(k);
    grid.append(b);
  }
  const p = S.pity || {};
  $("chestPity").textContent = t("chest.pity", { epic: Math.max(1, PITY.epic - (p.epic || 0)), legend: Math.max(1, PITY.legend - (p.legend || 0)) });
  $("chestHint").textContent = S.chests.length ? t("chest.tapToOpen") : t("chest.howToGet");
}

/** Zeigt die Kisten (Startbildschirm, nach Level-Up) */
export function chestsScreen() { showScreen("chests"); }

let busy = false;
const openNext = tier => { const c = S.chests.find(x => x.tier === tier); if (c) openChestOverlay(c); };

/** Kiste über dem aktuellen Bildschirm öffnen (auch vom Endbildschirm aus, ohne ihn zu verlassen) */
export async function openChestOverlay(c) {
  if (busy || !c) return;
  const tier = c.tier;
  busy = true;
  const ov = $("chestOpen"), stage = $("coStage"), cards = $("coCards");
  stage.innerHTML = ""; cards.innerHTML = ""; $("coNext").hidden = true; $("coDone").hidden = true;
  const ch = chestEl(tier, 150); ch.classList.add("shake"); stage.append(ch);
  ov.hidden = false; A.sfx("click");
  let r;
  try { [r] = await Promise.all([openChest(c.id), new Promise(res => { setTimeout(res, 900); })]); }
  catch (e) { ov.hidden = true; busy = false; toast(t(e && e.code === "offline" ? "sync.buyOffline" : "chest.failed"), "i-lock"); return; }
  ch.classList.remove("shake"); ch.classList.add("open"); A.sfx("levelup");
  const list = [];
  if (r.coins) list.push({ html: `<span class="coin big"></span><b>+${num(r.coins)}</b>`, cls: "basis" });
  if (r.gems) list.push({ html: `<span class="gem big"></span><b>+${num(r.gems)}</b>`, cls: "episch" });
  for (const it of r.items) {
    const [kind, id] = it.id.split(":"), el = document.createElement("div");
    el.append(kind === "head" ? avatarCanvas(id, 76, { mood: "happy" }) : cosIcon(it.id, 66));
    const sub = it.dup ? (it.headXp ? t("chest.headXp", { n: it.headXp }) : t("chest.dupShards", { n: it.shards })) : t("chest.new");
    el.insertAdjacentHTML("beforeend", `<b>${esc(itemName(it.id))}</b><small>${RARITY[it.rarity]}${kind === "head" ? " · " + t("chest.head") : ""}</small><em class="${it.dup ? "dup" : "new"}">${sub}</em>`);
    list.push({ el, cls: it.rarity });
  }
  list.forEach((x, i) => setTimeout(() => {
    const d = document.createElement("div"); d.className = "cocard r-" + x.cls;
    if (x.el) d.append(...x.el.childNodes); else d.innerHTML = x.html;
    cards.append(d); A.sfx(i ? "coin" : "goal");
  }, 350 + i * 380));
  setTimeout(() => {
    busy = false; refreshTop();
    const more = S.chests.some(x => x.tier === tier);
    $("coNext").hidden = !more; $("coDone").hidden = false;
    $("coNext").onclick = () => openNext(tier);
    if (App.screen === "chests") render();
  }, 450 + list.length * 380);
}

function oddsModal() {
  const rows = CHEST_TIERS.map(k => {
    const c = CHESTS[k], cos = Object.entries(c.cos.rar).map(([r, p]) => `${RARITY[r]} ${pct(p * c.cos.p)}`).join(", ");
    const head = Object.entries(c.head).map(([r, p]) => `${RARITY[r]} ${pct(p)}`).join(", ");
    return `<tr><th>${t("chest." + k)}</th><td>${c.coins[1] ? `${c.coins[0]}–${c.coins[1]}` : "–"}${c.gems ? ` + ${t("chest.gems", { n: c.gems })}` : ""}</td><td>${cos}</td><td>${head}</td></tr>`;
  }).join("");
  modal({ title: t("chest.odds"), body: `<table class="oddtab"><tr><th></th><th>${t("chest.oddsCoins")}</th><th>${t("chest.oddsCos")}</th><th>${t("chest.oddsHead")}</th></tr>${rows}</table>
    <p class="hint">${t("chest.oddsNote", { epic: PITY.epic, legend: PITY.legend, head: PITY.head, lhead: PITY.legendHead })}</p>`, ribbon: "" });
}

export function initChests() {
  registerScreen("chests", { show: render });
  onSync(() => { if (App.screen === "chests" && !busy) render(); });
  $("btnChestOdds").onclick = () => { A.sfx("click"); oddsModal(); };
  $("btnLocker").onclick = () => { A.sfx("click"); showScreen("locker"); };
  $("coDone").onclick = () => { A.sfx("click"); $("chestOpen").hidden = true; if (App.screen === "chests") render(); };
}
