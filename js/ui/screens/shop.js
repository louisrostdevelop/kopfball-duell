// Shop: Köpfe, Bälle, Arenen, Angebot des Tages
import { ARENAS, BALLS, charById, CHARS, gemPrice, gemsInEuro, PAYMENTS, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { arenaInShop, buy, buyDeal, checkAch, deal, owns, S, save, seasonNow, shopLevel } from "../../app/profile.js";
import { cosById, COS_PRICE } from "../../content/cosmetics.js";
import { cosIcon } from "./chests.js";
import { avatarCanvas, drawBall } from "../render/art.js";
import { arenaThumb } from "../render/render.js";
import { $, $$, RCOL, svg, toast } from "../dom.js";
import { unlockModal } from "../modals.js";
import { refreshTop } from "./home.js";
import { audio as A } from "../../app/services.js";
import { registerScreen, showScreen } from "../nav.js";
import { buyCos, buyWithGems, cosOfferNow, online as serverOn, shopProducts, startCheckout } from "../../app/account.js";
import { money, t } from "../../content/i18n.js";

export let shopTab = "chars";

export function setShopTab(tab) { shopTab = tab; shopScreen(); }

export function shopScreen() {
  $$(".gemOnly").forEach(e => e.hidden = !serverOn());
  $$(".payOnly").forEach(e => e.hidden = !serverOn() || !PAYMENTS);   // Juwelen-Tab: nur mit Echtgeld
  if (shopTab === "gems" && (!serverOn() || !PAYMENTS)) shopTab = "chars";
  $$("#shopTabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === shopTab));
  $$(".gemNum").forEach(e => e.textContent = S.gems || 0);
  if (shopTab === "gems") { gemShop(); return; }
  if (shopTab === "cos") { cosShop(); return; }
  const dl = deal(), db = $("dealBox"); db.innerHTML = "";
  if (dl) {
    const c = document.createElement("div"); c.className = "dealcard";
    const av = document.createElement("div"); av.className = "dav";
    if (dl.kind === "chars") av.append(avatarCanvas(dl.id, 90)); else { const cv = ballCanvas(dl.id, 90); av.append(cv); }
    c.append(av);
    c.insertAdjacentHTML("beforeend", `<div class="dtxt"><small>${t("shop.deal")}</small><b>${dl.name}</b><em><s>${dl.old}</s>${t("shop.coins", { n: dl.price })}</em></div><span class="off">-30%</span>`);
    const bb = document.createElement("button"); bb.className = "btn yellow"; bb.innerHTML = `<span class="coin"></span>${dl.price}`; bb.disabled = S.coins < dl.price;
    bb.onclick = () => { if (buyDeal(dl)) { A.sfx("levelup"); if (dl.kind === "chars") { S.char = dl.id; unlockModal(charById(dl.id)); } else { S.ball = dl.id; toast(t("shop.bought", { name: dl.name }), "i-ball", true); } save(); checkAch({}); refreshTop(); shopScreen(); } };
    c.append(bb); db.append(c);
  }
  const g = $("shopGrid"); g.innerHTML = "";
  const RANK = { basis: 0, selten: 1, episch: 2, legend: 3 };
  const kind = shopTab, items = kind === "chars" ? [...CHARS].sort((p, q) => RANK[rarityOf(p)] - RANK[rarityOf(q)] || p.price - q.price) : kind === "balls" ? BALLS : ARENAS;
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
    const desc = kind === "chars" ? t("unlock.super", { name: SUPERS[it.super].name }) : kind === "arenas" ? it.desc : t("shop.ballPattern");
    d.insertAdjacentHTML("beforeend", `<b>${it.name}</b><small>${desc}</small>`);
    const btn = document.createElement("button");
    const equip = () => { if (kind === "chars") S.char = it.id; else if (kind === "balls") S.ball = it.id; else S.arena = it.id; save(); };
    const need = shopLevel(kind, it.id);
    if (eq) { btn.className = "btn ghost small"; btn.innerHTML = svg("i-check") + t("shop.selected"); btn.disabled = true; }
    else if (!own && kind === "arenas" && !arenaInShop(it)) { btn.className = "btn ghost small"; btn.innerHTML = svg("i-lock") + (seasonNow() === it.season ? t("shop.inPass") : t("shop.fromSeason", { n: it.season })); btn.disabled = true; }
    else if (!own && S.level < need) { btn.className = "btn ghost small"; btn.innerHTML = svg("i-lock") + t("shop.fromLevel", { n: need }); btn.disabled = true; }
    else if (own) { btn.className = "btn green small"; btn.textContent = t("ui.select"); btn.onclick = () => { A.sfx("click"); equip(); shopScreen(); }; }
    else if (kind === "chars" && serverOn() && gemPrice(it)) {
      // Seltene Köpfe auch für Juwelen (Euro-Wert daneben)
      const gp = gemPrice(it), row = document.createElement("div"); row.className = "buy2";
      const bc = document.createElement("button"); bc.className = "btn yellow small"; bc.innerHTML = `<span class="coin"></span>${it.price}`; bc.disabled = S.coins < it.price;
      bc.onclick = () => { if (buy(kind, it.id, it.price)) { A.sfx("levelup"); equip(); unlockModal(it); checkAch({}); refreshTop(); shopScreen(); } };
      const bg = document.createElement("button"); bg.className = "btn pink small"; bg.innerHTML = `<span class="gem"></span>${gp}`; if (PAYMENTS) bg.title = "≈ " + gemsInEuro(gp);
      bg.disabled = (S.gems || 0) < gp;
      bg.onclick = async () => {
        bg.disabled = true;
        try { await buyWithGems(kind, it.id); A.sfx("levelup"); equip(); unlockModal(it); refreshTop(); shopScreen(); }
        catch (_) { toast(t("shop.buyFailed"), "i-close"); bg.disabled = false; }
      };
      row.append(bc, bg); d.append(row);
      if (PAYMENTS) d.insertAdjacentHTML("beforeend", `<small class="euro">≈ ${gemsInEuro(gp)}</small>`);
      g.append(d); return;
    }
    else { btn.className = "btn yellow small"; btn.innerHTML = `<span class="coin"></span>${it.price}`; btn.disabled = S.coins < it.price; btn.onclick = () => { if (buy(kind, it.id, it.price)) { A.sfx("levelup"); equip(); if (kind === "chars") unlockModal(it); else toast(t("shop.bought", { name: it.name }), kind === "balls" ? "i-ball" : "i-stadium", true); checkAch({}); refreshTop(); shopScreen(); } }; }
    d.append(btn); g.append(d);
  });
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}

// Juwelen-Pakete und Starterpaket (Echtgeld, Preise vom Server)
const euro = c => money(c);
const PNAME = { premium_pass: "shop.pack.premium", starter: "shop.pack.starter" };
async function gemShop() {
  const g = $("shopGrid"); g.innerHTML = `<p class="hint center wide">${t("ui.loading")}</p>`;
  let list;
  try { list = await shopProducts(); } catch (_) { g.innerHTML = `<p class="hint center wide">${t("shop.unreachable")}</p>`; return; }
  if (shopTab !== "gems") return;
  g.innerHTML = "";
  const guest = S.guest !== false;
  $("dealBox").innerHTML = guest
    ? `<div class="shopnote">${t("shop.needAccount")} <button class="btn small green" id="shopAcc">${t("shop.createAccount")}</button></div>`
    : `<div class="shopnote">${t("shop.stripeNote")} <a href="legal/terms.html" target="_blank" rel="noopener">${t("legal.terms")}</a></div>`;
  list.filter(p => p.id !== "premium_pass").forEach(p => {
    const d = document.createElement("div"); d.className = "sitem gempack" + (p.id === "starter" ? " starter" : "");
    // Mehr Juwelen pro Euro als im kleinsten Paket?
    const base = list.find(x => x.id === "gems_100"), extra = base ? Math.round((p.gems / p.priceCents) / (base.gems / base.priceCents) * 100 - 100) : 0;
    const off = p.id === "starter" ? t("shop.once") : extra >= 5 ? `+${extra} %` : "";
    d.innerHTML = `<div class="prev"><span class="gem big"></span>${off ? `<span class="off">${off}</span>` : ""}</div><b>${PNAME[p.id] ? t(PNAME[p.id]) : t("shop.gems", { n: p.gems })}</b><small>${p.id === "starter" ? t("shop.starterSub", { n: p.gems }) : extra >= 5 ? t("shop.morePerEuro", { n: extra }) : t("shop.entry")}</small>`;
    const btn = document.createElement("button"); btn.className = "btn green small";
    btn.textContent = p.buyable || guest ? euro(p.priceCents) : t("shop.owned");
    btn.disabled = !p.buyable && !guest;
    btn.onclick = async () => {
      A.sfx("click");
      if (guest) { showScreen("profile"); return; }
      btn.disabled = true; btn.textContent = "…";
      try { await startCheckout(p.id); } catch (_) { toast(t("shop.checkoutDown"), "i-close"); btn.disabled = false; btn.textContent = euro(p.priceCents); }
    };
    d.append(btn); g.append(d);
  });
  const acc = $("shopAcc"); if (acc) acc.onclick = () => { A.sfx("click"); showScreen("profile"); };
}

export function ballCanvas(id, px) {
  const c = document.createElement("canvas"), r = Math.min(2, devicePixelRatio || 1);
  c.width = c.height = px * r; c.style.width = c.style.height = px + "px";
  const x = c.getContext("2d"); x.scale(r, r); drawBall(x, id, px / 2, px / 2, px * 0.36, 0.4, 1, null, { t: 4.28 }); return c; // t: Mond hinter dem Ball, Orakel-Auge offen
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initShop() {
  registerScreen("shop", { show: shopScreen });
  $$("#shopTabs button").forEach(b => b.onclick = () => { A.sfx("click"); setShopTab(b.dataset.tab); });
}

// Kosmetik: 6 Angebote pro Woche, für Münzen oder Juwelen (Kisten gibt es hier nie)
function cosShop() {
  $("dealBox").innerHTML = `<p class="hint">${svg("i-cal")}${t("shop.cosWeek")}</p>`;
  const g = $("shopGrid"); g.innerHTML = "";
  for (const id of cosOfferNow()) {
    const c = cosById(id); if (!c) continue;
    const d = document.createElement("div"); d.className = "sitem"; d.style.setProperty("--rc", RCOL[c.rarity]); d.dataset.id = id;
    const prev = document.createElement("div"); prev.className = "prev"; prev.append(cosIcon(id, 84)); d.append(prev);
    d.insertAdjacentHTML("beforeend", `<span class="rarity" style="--rc:${RCOL[c.rarity]}">${RARITY[c.rarity]}</span><b>${c.name}</b><small>${t("cos.kind." + c.kind)}</small>`);
    const own = S.cos.includes(id), need = shopLevel("cos", id), pr = COS_PRICE[c.rarity];
    if (own) { const b = document.createElement("button"); b.className = "btn ghost small"; b.innerHTML = svg("i-check") + t("shop.owned"); b.disabled = true; d.append(b); }
    else if (S.level < need) { const b = document.createElement("button"); b.className = "btn ghost small"; b.innerHTML = svg("i-lock") + t("shop.fromLevel", { n: need }); b.disabled = true; d.append(b); }
    else {
      const row = document.createElement("div"); row.className = "buy2";
      const go = async (cur, b) => {
        b.disabled = true;
        try { await buyCos(id, cur); A.sfx("levelup"); toast(t("shop.bought", { name: c.name }), "i-star", true); refreshTop(); shopScreen(); }
        catch (e) { toast(t(e && e.code === "offline" ? "sync.buyOffline" : "shop.buyFailed"), "i-close"); b.disabled = false; }
      };
      const bc = document.createElement("button"); bc.className = "btn yellow small"; bc.innerHTML = `<span class="coin"></span>${pr.coins}`; bc.disabled = S.coins < pr.coins; bc.onclick = () => go("coins", bc);
      row.append(bc);
      if (serverOn()) { const bg = document.createElement("button"); bg.className = "btn pink small"; bg.innerHTML = `<span class="gem"></span>${pr.gems}`; if (PAYMENTS) bg.title = "≈ " + gemsInEuro(pr.gems); bg.disabled = (S.gems || 0) < pr.gems; bg.onclick = () => go("gems", bg); row.append(bg); }
      d.append(row);
    }
    g.append(d);
  }
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}
