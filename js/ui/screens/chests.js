// Kisten: Übersicht (ungeöffnete Kisten, Splitter, Garantien, Chancen), Öffnen mit Enthüllung
import { charById, RARITY } from "../../content/config.js";
import { CHEST_TIERS, CHESTS, cosById, PITY } from "../../content/cosmetics.js";
import { S } from "../../app/profile.js";
import { onSync, openChest } from "../../app/account.js";
import { App } from "../../app/state.js";
import { avatarCanvas, shoeCanvas } from "../render/art.js";
import { chestSvg } from "../render/chest-art.js";
import { refreshTop } from "./home.js";
import { $, esc, modal, toast } from "../dom.js";
import { registerScreen, showScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";
import { num, t } from "../../content/i18n.js";

const pct = p => num(p >= 0.1 ? Math.round(p * 100) : Math.round(p * 1000) / 10) + " %";

/** Kiste als Bild (SVG, chest-art.js) */
export function chestEl(tier, size = 96) {
  const d = document.createElement("span");
  d.className = "chest t-" + tier; d.style.setProperty("--s", size + "px");
  d.innerHTML = chestSvg(tier);
  return d;
}
// Leuchtfarbe der Enthüllung nach bester Seltenheit
const RC = { basis: "#fff1a0", selten: "#4fc3ff", episch: "#c084ff", legend: "#ffd23f" };
const RANK = { basis: 0, selten: 1, episch: 2, legend: 3 };

/** Platzhalter-Symbol für Kosmetik: einfache Form in der Farbe des Gegenstands */
export function cosIcon(id, size = 56) {
  const c = cosById(id), d = document.createElement("span");
  d.className = "cosic k-" + (c ? c.kind : "x"); d.style.setProperty("--col", c ? c.col : "#ccc"); d.style.setProperty("--s", size + "px");
  if (c && c.kind === "emoji") d.textContent = c.glyph;
  else if (c && (c.kind === "emote" || (c.kind === "goalfx" && c.ic))) d.innerHTML = `<svg viewBox="0 0 48 48"><use href="#cos-${c.kind}"/></svg><b class="eic">${esc(c.ic)}</b>`;
  else if (c && c.skin) d.append(shoeCanvas(c.skin, size));
  else d.innerHTML = `<svg viewBox="0 0 48 48"><use href="#cos-${c ? c.kind : "shoes"}"/></svg><b>${c ? c.n : ""}</b>`;
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
  stage.className = "co-stage"; stage.innerHTML = '<div class="co-rays"></div>'; cards.innerHTML = ""; $("coNext").hidden = true; $("coDone").hidden = true;
  stage.style.removeProperty("--rc");
  // 1. Kiste fällt herein, 2. wackelt, bis der Server geantwortet hat (mindestens 1 s)
  const ch = chestEl(tier, 180); ch.classList.add("drop"); stage.append(ch);
  ov.hidden = false; A.sfx("click");
  // Weniger Bewegung gewünscht (Systemeinstellung): kurzer Ablauf ohne Wackeln und Aufladen
  const quick = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, q = ms => (quick ? Math.min(ms, 60) : ms); // i18n-ok: Media-Query
  const wait = ms => new Promise(res => { setTimeout(res, q(ms)); });
  const shake = { on: true };
  (async () => { await wait(420); if (!shake.on) return; ch.classList.remove("drop"); ch.classList.add("shake"); while (shake.on) { A.sfx("chest-shake"); await wait(260); } })();
  let r;
  try { [r] = await Promise.all([openChest(c.id), wait(1000)]); }
  catch (e) { shake.on = false; ov.hidden = true; busy = false; toast(t(e && e.code === "offline" ? "sync.buyOffline" : "chest.failed"), "i-lock"); return; }
  shake.on = false;
  // Beste Seltenheit bestimmt Farbe und Größe der Enthüllung; der beste Gegenstand kommt zuletzt
  const isHead = it => it.id.startsWith("head:");
  const items = [...r.items].sort((x, y) => isHead(x) - isHead(y) || RANK[x.rarity] - RANK[y.rarity]);
  const best = items.reduce((m, it) => (RANK[it.rarity] > RANK[m] ? it.rarity : m), "basis");
  const newHead = items.some(it => isHead(it) && !it.dup), big = newHead || best === "legend";
  stage.style.setProperty("--rc", RC[best]);
  // 3. kurz aufladen (bei Legendär länger), 4. Deckel springt auf, Strahlen, Funken
  ch.classList.remove("shake", "drop"); ch.classList.add("charge");
  await wait(big ? 650 : 380);
  ch.classList.remove("charge"); ch.classList.add("open"); stage.classList.add("open"); stage.classList.toggle("big", big);
  A.sfx("chest-open");
  setTimeout(() => A.sfx(newHead ? "chest-head" : "chest-" + (best === "basis" ? "selten" : best)), 120);
  for (let i = 0; i < (big ? 26 : 16); i++) {
    const s = document.createElement("i"), a = (i / (big ? 26 : 16)) * Math.PI * 2 + Math.random() * 0.3, d = 110 + Math.random() * (big ? 170 : 90);
    s.className = "cospark"; s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d * 0.8 - 30 + "px");
    s.style.animationDelay = Math.random() * 0.12 + "s"; stage.append(s);
  }
  if (big) { const f = document.createElement("div"); f.className = "co-flash"; ov.append(f); setTimeout(() => f.remove(), 700); }
  // 5. Karten fliegen aus der Kiste
  const list = [];
  if (r.coins) list.push({ html: `<span class="coin big"></span><b>+${num(r.coins)}</b>`, cls: "basis", snd: "coin" });
  if (r.gems) list.push({ html: `<span class="gem big"></span><b>+${num(r.gems)}</b>`, cls: "episch", snd: "coin" });
  for (const it of items) {
    const [kind, id] = it.id.split(":"), el = document.createElement("div");
    el.append(kind === "head" ? avatarCanvas(id, 76, { mood: "happy" }) : cosIcon(it.id, 66));
    const sub = it.dup ? (it.headXp ? t("chest.headXp", { n: it.headXp }) : t("chest.dupShards", { n: it.shards })) : t("chest.new");
    el.insertAdjacentHTML("beforeend", `<b>${esc(itemName(it.id))}</b><small>${RARITY[it.rarity]}${kind === "head" ? " · " + t("chest.head") : ""}</small><em class="${it.dup ? "dup" : "new"}">${sub}</em>`);
    list.push({ el, cls: it.rarity + (kind === "head" && !it.dup ? " newhead" : ""), snd: it.dup && it.shards ? "shards" : "chest-item" });
  }
  // Alle Karten gleich anlegen (unsichtbar) und nacheinander einblenden: so springt nichts, wenn eine dazukommt
  const t0 = q(480), gap = q(360);
  const slots = list.map(x => {
    const d = document.createElement("div"); d.className = "cocard wait r-" + x.cls;
    if (x.el) d.append(...x.el.childNodes); else d.innerHTML = x.html;
    cards.append(d); return d;
  });
  list.forEach((x, i) => setTimeout(() => { slots[i].classList.remove("wait"); A.sfx(x.snd); }, t0 + i * gap));
  setTimeout(() => {
    busy = false; refreshTop();
    const more = S.chests.some(x => x.tier === tier);
    $("coNext").hidden = !more; $("coDone").hidden = false;
    $("coNext").onclick = () => openNext(tier);
    if (App.screen === "chests") render();
  }, t0 + q(120) + list.length * gap);
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
