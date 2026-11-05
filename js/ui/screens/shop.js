// Shop: Köpfe, Bälle, Arenen, Angebot des Tages
import { ARENAS, BALLS, charById, CHARS, gemPrice, gemsInEuro, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { buy, buyDeal, checkAch, deal, owns, S, save } from "../../app/profile.js";
import { avatarCanvas, drawBall } from "../render/art.js";
import { arenaThumb } from "../render/render.js";
import { $, $$, RCOL, svg, toast } from "../dom.js";
import { unlockModal } from "../modals.js";
import { refreshTop } from "./home.js";
import { audio as A } from "../../app/services.js";
import { registerScreen, showScreen } from "../nav.js";
import { buyWithGems, online as serverOn, shopProducts, startCheckout } from "../../app/account.js";

export let shopTab = "chars";

export function setShopTab(t) { shopTab = t; shopScreen(); }

export function shopScreen() {
  $$(".gemOnly").forEach(e => e.hidden = !serverOn());
  if (shopTab === "gems" && !serverOn()) shopTab = "chars";
  $$("#shopTabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === shopTab));
  $$(".gemNum").forEach(e => e.textContent = S.gems || 0);
  if (shopTab === "gems") { gemShop(); return; }
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
    else if (kind === "chars" && serverOn() && gemPrice(it)) {
      // Seltene Köpfe auch für Juwelen (Euro-Wert daneben)
      const gp = gemPrice(it), row = document.createElement("div"); row.className = "buy2";
      const bc = document.createElement("button"); bc.className = "btn yellow small"; bc.innerHTML = `<span class="coin"></span>${it.price}`; bc.disabled = S.coins < it.price;
      bc.onclick = () => { if (buy(kind, it.id, it.price)) { A.sfx("levelup"); equip(); unlockModal(it); checkAch({}); refreshTop(); shopScreen(); } };
      const bg = document.createElement("button"); bg.className = "btn pink small"; bg.innerHTML = `<span class="gem"></span>${gp}`; bg.title = "≈ " + gemsInEuro(gp);
      bg.disabled = (S.gems || 0) < gp;
      bg.onclick = async () => {
        bg.disabled = true;
        try { await buyWithGems(kind, it.id); A.sfx("levelup"); equip(); unlockModal(it); refreshTop(); shopScreen(); }
        catch (_) { toast("Kauf hat nicht geklappt", "i-close"); bg.disabled = false; }
      };
      row.append(bc, bg); d.append(row);
      d.insertAdjacentHTML("beforeend", `<small class="euro">≈ ${gemsInEuro(gp)}</small>`);
      g.append(d); return;
    }
    else { btn.className = "btn yellow small"; btn.innerHTML = `<span class="coin"></span>${it.price}`; btn.disabled = S.coins < it.price; btn.onclick = () => { if (buy(kind, it.id, it.price)) { A.sfx("levelup"); equip(); if (kind === "chars") unlockModal(it); else toast(it.name + " gekauft!", kind === "balls" ? "i-ball" : "i-stadium", true); checkAch({}); refreshTop(); shopScreen(); } }; }
    d.append(btn); g.append(d);
  });
  $$(".coinNum").forEach(e => e.textContent = S.coins);
}

// Juwelen-Pakete und Starterpaket (Echtgeld, Preise vom Server)
const euro = c => (c / 100).toFixed(2).replace(".", ",") + " €";
const PNAME = { premium_pass: "Premium-Pass", starter: "Starterpaket" };
async function gemShop() {
  const g = $("shopGrid"); g.innerHTML = '<p class="hint center wide">Lädt…</p>';
  let list;
  try { list = await shopProducts(); } catch (_) { g.innerHTML = '<p class="hint center wide">Shop gerade nicht erreichbar.</p>'; return; }
  if (shopTab !== "gems") return;
  g.innerHTML = "";
  const guest = S.guest !== false;
  $("dealBox").innerHTML = guest
    ? '<div class="shopnote">Zum Kaufen brauchst du ein Konto, damit nichts verloren geht. <button class="btn small green" id="shopAcc">Konto anlegen</button></div>'
    : '<div class="shopnote">Bezahlt wird sicher über Stripe. Juwelen gibt es selten auch im Spiel.</div>';
  list.filter(p => p.id !== "premium_pass").forEach(p => {
    const d = document.createElement("div"); d.className = "sitem gempack" + (p.id === "starter" ? " starter" : "");
    // Mehr Juwelen pro Euro als im kleinsten Paket?
    const base = list.find(x => x.id === "gems_100"), extra = base ? Math.round((p.gems / p.priceCents) / (base.gems / base.priceCents) * 100 - 100) : 0;
    const off = p.id === "starter" ? "Einmalig" : extra >= 5 ? `+${extra} %` : "";
    d.innerHTML = `<div class="prev"><span class="gem big"></span>${off ? `<span class="off">${off}</span>` : ""}</div><b>${PNAME[p.id] || p.gems + " Juwelen"}</b><small>${p.id === "starter" ? p.gems + " Juwelen, nur einmal" : extra >= 5 ? extra + " % mehr pro Euro" : "Einstieg"}</small>`;
    const btn = document.createElement("button"); btn.className = "btn green small";
    btn.textContent = p.buyable ? euro(p.priceCents) : guest ? euro(p.priceCents) : "Gekauft";
    btn.disabled = !p.buyable && !guest;
    btn.onclick = async () => {
      A.sfx("click");
      if (guest) { showScreen("settings"); return; }
      btn.disabled = true; btn.textContent = "…";
      try { await startCheckout(p.id); } catch (_) { toast("Bezahlseite gerade nicht erreichbar", "i-close"); btn.disabled = false; btn.textContent = euro(p.priceCents); }
    };
    d.append(btn); g.append(d);
  });
  const acc = $("shopAcc"); if (acc) acc.onclick = () => { A.sfx("click"); showScreen("settings"); };
}

export function ballCanvas(id, px) {
  const c = document.createElement("canvas"), r = Math.min(2, devicePixelRatio || 1);
  c.width = c.height = px * r; c.style.width = c.style.height = px + "px";
  const x = c.getContext("2d"); x.scale(r, r); drawBall(x, id, px / 2, px / 2, px * 0.36, 0.4); return c;
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initShop() {
  registerScreen("shop", { show: shopScreen });
  $$("#shopTabs button").forEach(b => b.onclick = () => { A.sfx("click"); setShopTab(b.dataset.tab); });
}
