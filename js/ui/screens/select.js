// Kopf-Auswahl und Freischalten
import { charById, CHARS, clamp, HEAD_MAX_LEVEL, headBonus, leveledStats, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { buy, checkAch, headStat, owns, S, shopLevel } from "../../app/profile.js";
import { cosById, MASTERY, masteryReward } from "../../content/cosmetics.js";
import { avatarCanvas } from "../render/art.js";
import { App } from "../../app/state.js";
import { $, $$, esc, RCOL, svg, toast } from "../dom.js";
import { unlockModal } from "../modals.js";
import { showScreen } from "../nav.js";
import { refreshTop } from "./home.js";
import { audio as A } from "../../app/services.js";
import { online as serverOn, upgradeCost, upgradeHead } from "../../app/account.js";
import { headLevel } from "../../app/game.js";
import { lang, t } from "../../content/i18n.js";

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
    if (!locked && headLevel(c.id) > 1) b.insertAdjacentHTML("beforeend", `<span class="lvtag">${t("head.lvShort", { n: headLevel(c.id) })}</span>`);
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
  $$(".ccard").forEach(card => { card.classList.toggle("on", card.dataset.id === c.id); card.querySelector(".check")?.remove(); });
  const cur = $$(".ccard").find(card => card.dataset.id === (selCtx.p2 ? "" : S.char)); if (cur && !selCtx.p2) cur.insertAdjacentHTML("beforeend", `<span class="check">${svg("i-check")}</span>`);
  $("detTop").style.setProperty("--rc", RCOL[rar]);
  $("ciRarity").textContent = RARITY[rar];
  const big = $("bigAv"); big.innerHTML = ""; big.append(avatarCanvas(c.id, innerHeight < 430 ? 86 : innerHeight < 520 ? 120 : 180, { mood: "happy" }));
  $("ciName").textContent = c.name;
  $("ciSuper").textContent = SUPERS[c.super].name; $("ciDesc").textContent = SUPERS[c.super].desc;
  const bar = (l, v) => `<span>${l}</span><span class="bar"><i style="width:${Math.round(clamp((v - 0.8) / 0.45, 0.08, 1) * 100)}%"></i></span>`;
  const lc = leveledStats(c, locked ? 1 : headLevel(c.id));   // Balken mit Kopf-Level
  $("ciStats").innerHTML = bar(t("head.speed"), lc.spd) + bar(t("head.jump"), lc.jmp) + bar(t("head.shot"), lc.pow);
  levelBox(c, locked);
  masteryBox(c, locked);
  const ok = $("btnSelOk");
  const need = shopLevel("chars", c.id);
  if (locked && S.level < need) { ok.className = "btn ghost"; ok.disabled = true; ok.innerHTML = svg("i-lock") + t("shop.fromLevel", { n: need }); }
  else if (locked) { ok.className = "btn yellow"; ok.disabled = S.coins < c.price; ok.innerHTML = S.coins >= c.price ? `<span class="coin"></span>${t("head.unlock", { n: c.price })}` : t("head.coinsMissing", { n: c.price - S.coins }); }
  else { ok.className = "btn green"; ok.disabled = false; ok.textContent = selCtx.okText || t("ui.select"); }
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}

// Meisterschaft: 5 Stufen pro Kopf, nächstes Ziel, nächste Belohnung
function masteryBox(c, locked) {
  const box = $("ciMastery"); box.hidden = locked; if (locked) return;
  const h = headStat(c.id), next = MASTERY[h.mastery];
  const dots = MASTERY.map((m, i) => `<i class="${i < h.mastery ? "on" : i === h.mastery ? "next" : ""}" title="${esc(cosById(masteryReward(c.id, i + 1)).name)}">${i + 1}</i>`).join("");
  box.innerHTML = `<div class="ms-top"><b>${t("mastery.title")}</b><span class="ms-dots">${dots}</span></div>` + (next
    ? `<small>${t("mastery.need." + next.stat, { n: next.n, name: c.name })}: ${Math.min(h[next.stat] || 0, next.n)}/${next.n} · ${t("mastery.next", { item: cosById(masteryReward(c.id, h.mastery + 1)).name })}${next.chest ? " + " + t("chest." + next.chest) : ""}</small>`
    : `<small>${t("mastery.done", { name: c.name })}</small>`);
}

// Kopf-Level (nur mit Server): Stufe, Kopf-XP aus Spielen, Aufwerten mit Münzen (fehlende XP mit Juwelen)
const pct = v => new Intl.NumberFormat(lang(), { style: "percent", maximumFractionDigits: 1 }).format(v);
function levelBox(c, locked) {
  const box = $("ciLevel"); box.hidden = !serverOn() || locked || !(S.heads && S.heads[c.id]); if (box.hidden) return;
  const lv = headLevel(c.id), cost = upgradeCost(c.id, HEAD_MAX_LEVEL), b = headBonus(lv);
  const h = S.heads[c.id];
  box.innerHTML = `<div class="hl-top"><b>${t("level.title", { n: lv })}</b><small>${t("head.ofMax", { n: HEAD_MAX_LEVEL })}</small><span class="grow"></span><em>${b ? t("head.bonus", { p: pct(b) }) : t("head.base")}</em></div>`
    + (cost ? `<span class="hl-bar"><i style="width:${Math.min(100, Math.round(h.xp / cost.need * 100))}%"></i><em>${t("head.xp", { a: Math.min(h.xp, cost.need), b: cost.need })}</em></span>` : `<p class="hint">${t("head.max")}</p>`);
  if (!cost) return;
  const btn = document.createElement("button");
  const gems = cost.missing > 0;
  btn.className = "btn small " + (gems ? "pink" : "yellow");
  btn.innerHTML = `${t("head.upgrade")} · <span class="coin"></span>${cost.coins}` + (gems ? ` + <span class="gem"></span>${cost.gems}` : "");
  btn.disabled = S.coins < cost.coins || (gems && (S.gems || 0) < cost.gems);
  btn.title = gems ? t("head.missingTitle", { n: cost.missing }) : "";
  btn.onclick = async () => {
    btn.disabled = true;
    try { await upgradeHead(c.id, gems); A.sfx("levelup"); toast(t("head.upgraded", { name: c.name, n: headLevel(c.id) }), "i-star", true); refreshTop(); selectScreen({ ...selCtx, cur: c.id }); App.stack.pop(); }
    catch (e) { toast(t("head.upgradeFailed"), "i-close"); btn.disabled = false; }
  };
  box.append(btn);
  if (gems) box.insertAdjacentHTML("beforeend", `<p class="hint">${t("head.missingHint", { n: cost.missing, name: c.name })}</p>`);
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
