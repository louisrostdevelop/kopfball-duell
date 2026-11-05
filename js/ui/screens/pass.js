// Saison-Pass (nur mit Server): Punkte aus Spielen, Stufen mit Gratis- und Premium-Belohnung
import { arenaById, BALLS, charById, gemsInEuro } from "../../content/config.js";
import { S } from "../../app/profile.js";
import { buyPassWithGems, claimPass, online as serverOn, passView, PASS_GEMS, shopProducts, startCheckout } from "../../app/account.js";
import { avatarCanvas } from "../render/art.js";
import { arenaThumb } from "../render/render.js";
import { ballCanvas } from "./shop.js";
import { refreshTop } from "./home.js";
import { $, $$, svg, toast } from "../dom.js";
import { registerScreen, showScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";

const euro = c => (c / 100).toFixed(2).replace(".", ",") + " €";
const daysLeft = iso => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 864e5));

function rewardEl(rw) {
  const d = document.createElement("div"); d.className = "rw-ic";
  if (!rw) return d;
  if (rw.coins) d.innerHTML = `<span class="coin"></span><b>${rw.coins}</b>`;
  else if (rw.gems) d.innerHTML = `<span class="gem"></span><b>${rw.gems}</b>`;
  else if (rw.item) {
    const [kind, id] = rw.item.split(":");
    if (kind === "head") { d.append(avatarCanvas(id, 54)); d.insertAdjacentHTML("beforeend", `<b>${charById(id).name}</b>`); }
    else if (kind === "ball") { d.append(ballCanvas(id, 50)); d.insertAdjacentHTML("beforeend", `<b>${(BALLS.find(b => b.id === id) || { name: id }).name}</b>`); }
    else if (kind === "arena") { const c = arenaThumb(id, 80, 46); d.append(c); d.insertAdjacentHTML("beforeend", `<b>${arenaById(id).name}</b>`); }
  }
  return d;
}

export function passScreen() {
  const v = passView(), top = $("passTop"), track = $("passTrack");
  $$(".gemNum").forEach(e => e.textContent = S.gems || 0);
  if (!v) { top.innerHTML = '<p class="hint center">Gerade läuft keine Saison.</p>'; track.innerHTML = ""; return; }
  const next = v.tiers.find(t => !t.reached), prev = [...v.tiers].reverse().find(t => t.reached);
  const span = next ? next.points - (prev ? prev.points : 0) : 1, inSpan = next ? v.points - (prev ? prev.points : 0) : 1;
  top.innerHTML = `<div class="pt-info"><b>Saison ${v.season}</b><small>noch ${daysLeft(v.endsAt)} Tage · ${v.points} Punkte${next ? ` · nächste Stufe bei ${next.points}` : " · alles erreicht"}</small>
    <span class="pt-bar"><i style="width:${Math.round(Math.min(1, inSpan / span) * 100)}%"></i></span><small class="hint">Punkte gibt es für jedes Spiel, mehr für Siege.</small></div>`;
  if (!v.premium) {
    const box = document.createElement("div"); box.className = "pt-premium";
    box.innerHTML = `<span>${svg("i-crown")}<b>Premium</b><small>Mehr Belohnungen auf jeder Stufe, auch rückwirkend.</small></span>`;
    const bg = document.createElement("button"); bg.className = "btn small pink"; bg.innerHTML = `<span class="gem"></span>${PASS_GEMS}`; bg.title = "≈ " + gemsInEuro(PASS_GEMS);
    bg.disabled = (S.gems || 0) < PASS_GEMS;
    bg.onclick = async () => { bg.disabled = true; try { await buyPassWithGems(); A.sfx("levelup"); toast("Premium-Pass aktiv", "i-crown", true); refreshTop(); passScreen(); } catch (_) { toast("Kauf hat nicht geklappt", "i-close"); bg.disabled = false; } };
    box.append(bg);
    shopProducts().then(list => {
      const p = list.find(x => x.id === "premium_pass"); if (!p || !p.buyable) return;
      const be = document.createElement("button"); be.className = "btn small green"; be.textContent = euro(p.priceCents);
      be.onclick = () => { be.disabled = true; startCheckout(p.id).catch(() => { toast("Bezahlseite gerade nicht erreichbar", "i-close"); be.disabled = false; }); };
      box.append(be);
    }).catch(() => {});
    top.append(box);
  } else top.insertAdjacentHTML("beforeend", `<div class="pt-premium on"><span>${svg("i-crown")}<b>Premium aktiv</b></span></div>`);

  track.innerHTML = "";
  v.tiers.forEach(t => {
    const col = document.createElement("div"); col.className = "ptier" + (t.reached ? " reached" : "");
    col.insertAdjacentHTML("beforeend", `<span class="pt-pts">${t.points}</span>`);
    for (const prem of [false, true]) {
      const cell = document.createElement("div"); cell.className = "pt-cell " + (prem ? "prem" : "free");
      cell.append(rewardEl(prem ? t.premium : t.free));
      const claimed = prem ? t.premiumClaimed : t.freeClaimed, canPrem = !prem || v.premium;
      const b = document.createElement("button");
      if (claimed) { b.className = "btn small ghost"; b.innerHTML = svg("i-check"); b.disabled = true; }
      else if (!t.reached || !canPrem) { b.className = "btn small ghost"; b.innerHTML = svg("i-lock"); b.disabled = true; }
      else {
        b.className = "btn small yellow"; b.textContent = "Holen";
        b.onclick = async () => { b.disabled = true; try { await claimPass(t.i, prem); A.sfx("coin"); refreshTop(); passScreen(); } catch (_) { toast("Abholen hat nicht geklappt", "i-close"); b.disabled = false; } };
      }
      cell.append(b); col.append(cell);
    }
    track.append(col);
  });
}

/** Knopf im Aufgaben-Bildschirm (mit Zahl abholbarer Stufen) */
export function passButton() {
  const b = $("btnPass"), v = serverOn() && passView(); b.hidden = !v; if (!v) return;
  const badge = $("passBadge"); badge.hidden = !v.claimable; badge.textContent = v.claimable;
}

export function initPass() {
  registerScreen("pass", { show: passScreen });
  $("btnPass").onclick = () => { A.sfx("click"); showScreen("pass"); };
}
