// Startseite mit Bühne (jonglierender Kopf), Tageskarten und Kopfzeile
import { charById, CHARS, DIFFS, MODES, PAYMENTS, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { MAX_STARS, totalStars } from "../../core/career.js";
import { today } from "../../core/economy.js";
import { online as serverOn, passView } from "../../app/account.js";
import { matchLen } from "../../core/physics.js";
import { deal, owns, S, save, tasks, xpFor } from "../../app/profile.js";
import { avatarCanvas, drawBall, drawHead } from "../render/art.js";
import { dailyChallenge, startMode } from "../../app/modes.js";
import { App } from "../../app/state.js";
import { $, $$, esc, RCOL, svg } from "../dom.js";
import { goBack, registerScreen, showScreen } from "../nav.js";
import { selectScreen } from "./select.js";
import { audio as A } from "../../app/services.js";
import { dailyBriefing } from "./run.js";
import { setShopTab } from "./shop.js";
import { availableModes } from "./modes.js";
import { accountState } from "./profile.js";
import { t as tx } from "../../content/i18n.js";
import { canInstall, installAsk } from "../install.js";
import { canFullscreen } from "../../app/game.js";

export let showcaseT = 0, showcaseTap = 0;
export const juggle = { y: 0, vy: 0, a: 0, hits: 0 };

// Antippen der Bühne: Kopf nickt, Ball fliegt hoch
export function tapShowcase() { showcaseTap = 0.5; juggle.vy = Math.min(juggle.vy, -200); A.sfx("head"); }

export function homeScreen() {
  refreshTop();
  // einmal nach ein paar Spielen fragen, ob man die App installieren will (nie über einem anderen Fenster)
  // Auf dem iPhone gibt es im Browser kein Vollbild: dort schon nach dem ersten Spiel fragen, sonst nach drei
  const askAfter = canFullscreen() ? 3 : 1;
  if (canInstall() && !S.installAsked && (S.stats && S.stats.games) >= askAfter) setTimeout(() => {
    if (!$("modal").hidden || App.screen !== "home" || S.installAsked) return;
    S.installAsked = true; save(); installAsk();
  }, 900);
  const c = charById(S.char), rar = rarityOf(c);
  $("stName").textContent = c.name; $("stSuper").textContent = SUPERS[c.super].name;
  const rb = $("stRarity"); rb.textContent = RARITY[rar]; rb.style.setProperty("--rc", RCOL[rar]); rb.parentElement.style.setProperty("--rc", RCOL[rar]);
  const m = availableModes().find(x => x.id === S.mode) || MODES[0];
  $("mcTitle").textContent = m.name;
  let sub = m.desc;
  if (m.id === "daily") { const ch = dailyChallenge(); sub = ch.done ? tx("mode.daily.done") : tx("home.dailyToday", { name: charById(ch.opp).name, rules: ch.presetName }); }
  if (m.id === "endless" && S.endlessBest) sub = tx("home.endlessRecord", { n: S.endlessBest });
  if (m.id === "career" && totalStars(S.career)) sub = tx("career.stars", { n: totalStars(S.career), max: MAX_STARS });
  $("mcSub").textContent = sub;
  $("mcIcon").innerHTML = svg(m.icon);
  $("mcIcon").style.background = `linear-gradient(${m.c1}, ${m.c2})`;
  const pf = $("pfAv"); pf.innerHTML = ""; pf.append(avatarCanvas(S.char, 50, { fill: true }));
  $("pfName").textContent = S.name || tx("ui.player");
  $("pfGuest").hidden = accountState().kind !== "guest" && accountState().kind !== "pending";   // Gast mit Server: sichtbar, dass der Spielstand nicht gesichert ist
  // Tages-Challenge
  const ch = dailyChallenge();
  $("hsDaily").classList.toggle("done", ch.done);
  $("hdOpp").textContent = charById(ch.opp).name;
  $("hdRules").textContent = ch.presetName + ", " + (matchLen(ch.rules).win ? tx("home.upTo", { n: matchLen(ch.rules).win }) : "60 s") + " · " + DIFFS[ch.diff].name;
  $("hdRw").innerHTML = ch.done ? "✓ " + tx("home.done") : `<span class="coin"></span>+${ch.reward}`;
  const ha = $("hdAv"); ha.innerHTML = ""; ha.append(avatarCanvas(ch.opp, 60, { dir: -1, mood: "angry" }));
  // Aufgaben
  const tl = tasks();
  $("htCount").textContent = tl.filter(x => x.done).length + "/" + tl.length;
  $("htList").innerHTML = tl.map(t => `<span class="ht-row${t.done ? " done" : ""}"><span>${esc(t.text)}</span><span class="rw">${t.done ? "✓" : `<span class="coin"></span>${t.reward}`}</span><span class="pb"><i style="width:${Math.round(t.prog / t.n * 100)}%"></i></span></span>`).join("");
  // Nächster Kopf
  const next = CHARS.filter(x => !owns("chars", x.id)).sort((x, y) => x.price - y.price)[0];
  const nu = $("hsNext"); nu.hidden = !next;
  if (next) {
    const nr = rarityOf(next);
    $("nuName").textContent = next.name; $("nuNum").textContent = Math.min(S.coins, next.price) + "/" + next.price;
    $("nuFill").style.width = Math.min(100, Math.round(S.coins / next.price * 100)) + "%";
    const av = $("nuAv"); av.innerHTML = ""; av.style.setProperty("--rc", RCOL[nr]); av.append(avatarCanvas(next.id, 52));
    nu.classList.toggle("ready", S.coins >= next.price);
    nu.querySelector("small").textContent = tx(S.coins >= next.price ? "home.unlockNow" : "home.nextHead");
    nu.onclick = () => { A.sfx("click"); selectScreen({ title: tx("nav.heads"), cur: next.id, okText: tx("ui.select"), onDone: id => { S.char = id; save(); goBack(); } }); };
  }
}

export function refreshTop() {
  $$(".coinNum").forEach(e => e.textContent = S.coins);
  $$(".gemNum").forEach(e => e.textContent = S.gems || 0);
  $("homeGems").hidden = !serverOn();
  $("lvlNum").textContent = S.level;
  $("xpFill").style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%";
  $("xpTxt").textContent = S.xp + "/" + xpFor(S.level);
  $("starNum").textContent = Object.keys(S.ach).length;
  tasks();   // Tagesaufgaben für heute anlegen, falls neu
  // Zahl = was man wirklich abholen kann (Aufgaben werden automatisch gutgeschrieben, nur Pass-Stufen warten)
  const tb = $("taskBadge"); const pv = serverOn() && passView(); const n = pv ? pv.claimable : 0; tb.hidden = !n; tb.textContent = n;
  const cb = $("chestBadge"); cb.hidden = !S.chests.length; cb.textContent = S.chests.length;
  const dl = deal(); $("shopBadge").hidden = !(dl && S.coins >= dl.price && !owns(dl.kind, dl.id) && S.shopSeen !== today());
}

// Bühne hinter dem Kopf: weicher Schein in der Farbe der Seltenheit, klares Podest mit Lichtringen, wenige weiche Lichtpunkte
const RC = { basis: [63, 139, 255], selten: [47, 199, 96], episch: [166, 92, 255], legend: [255, 179, 0] };
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
function stageFx(x, w, cx, baseY, r, t) {
  const [cr, cg, cb] = RC[rarityOf(charById(S.char))] || RC.basis, col = a => `rgba(${cr},${cg},${cb},${a})`;
  const tint = (q, u) => `rgb(${Math.round(q[0] + (cr - q[0]) * u)},${Math.round(q[1] + (cg - q[1]) * u)},${Math.round(q[2] + (cb - q[2]) * u)})`;
  const headY = baseY - r * 1.02, pw = r * 1.55, ph = r * 0.3, depth = r * 0.26, TAU = Math.PI * 2;
  x.save();
  x.globalCompositeOperation = "lighter";
  // großer, weicher Schein hinter dem Kopf
  const pulse = 0.9 + 0.1 * Math.sin(t * 1.2), AR = Math.min(r * 2.1, w / 2 - 2), ag = x.createRadialGradient(cx, headY, r * 0.3, cx, headY, AR);
  ag.addColorStop(0, col(0.32 * pulse)); ag.addColorStop(0.5, col(0.1 * pulse)); ag.addColorStop(1, col(0));
  x.fillStyle = ag; x.beginPath(); x.arc(cx, headY, AR, 0, TAU); x.fill();
  // wenige große Lichtpunkte (Bokeh), steigen langsam
  for (let i = 0; i < 5; i++) {
    const u = (t * (0.035 + hash(i) * 0.03) + hash(i * 7)) % 1, px = cx + (hash(i * 3) - 0.5) * Math.min(r * 4, w - r * 0.6), py = baseY - u * r * 3.4;
    const z = r * (0.1 + hash(i * 5) * 0.16), al = Math.sin(u * Math.PI) * (0.16 + hash(i * 9) * 0.14);
    const bg = x.createRadialGradient(px, py, 0, px, py, z); bg.addColorStop(0, i % 3 ? col(al) : `rgba(255,255,255,${al})`); bg.addColorStop(0.7, i % 3 ? col(al * 0.6) : `rgba(255,255,255,${al * 0.6})`); bg.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = bg; x.beginPath(); x.arc(px, py, z, 0, TAU); x.fill();
  }
  // Lichtringe auf dem Boden, laufen langsam nach außen
  for (let k = 0; k < 2; k++) {
    const u = (t * 0.32 + k / 2) % 1, s = 1 + u * Math.min(0.75, Math.max(0, (w / 2 - 2) / pw - 1));
    x.beginPath(); x.ellipse(cx, baseY + depth, pw * s, ph * s, 0, 0, TAU);
    x.strokeStyle = col(0.5 * (1 - u)); x.lineWidth = Math.max(1.5, r * 0.025); x.stroke();
  }
  const fg = x.createRadialGradient(cx, baseY + depth, pw * 0.3, cx, baseY + depth, pw * 1.6);
  fg.addColorStop(0, col(0.35)); fg.addColorStop(1, col(0));
  x.fillStyle = fg; x.beginPath(); x.ellipse(cx, baseY + depth, pw * 1.6, ph * 1.7, 0, 0, TAU); x.fill();
  x.globalCompositeOperation = "source-over";
  // Podest: Seite
  const side = x.createLinearGradient(cx - pw, 0, cx + pw, 0);
  side.addColorStop(0, "#0a0f30"); side.addColorStop(0.4, tint([34, 48, 120], 0.25)); side.addColorStop(1, "#070b24");
  x.beginPath(); x.moveTo(cx - pw, baseY); x.lineTo(cx - pw, baseY + depth); x.ellipse(cx, baseY + depth, pw, ph, 0, Math.PI, 0, true); x.lineTo(cx + pw, baseY); x.closePath();
  x.fillStyle = side; x.fill(); x.lineWidth = 3; x.lineJoin = "round"; x.strokeStyle = "#15112e"; x.stroke();
  // feine Lichtkante unten an der Seite
  x.beginPath(); x.ellipse(cx, baseY + depth, pw - 1.5, ph - 1.5, 0, Math.PI * 0.12, Math.PI * 0.88);
  x.strokeStyle = col(0.75); x.lineWidth = 2; x.stroke();
  // Deckel: Farbe der Seltenheit, zur Mitte heller
  const top = x.createRadialGradient(cx, baseY - ph * 0.15, 2, cx, baseY, pw);
  top.addColorStop(0, tint([60, 80, 170], 0.55)); top.addColorStop(0.75, tint([30, 44, 120], 0.45)); top.addColorStop(1, tint([18, 26, 80], 0.35));
  x.beginPath(); x.ellipse(cx, baseY, pw, ph, 0, 0, TAU); x.fillStyle = top; x.fill();
  x.lineWidth = 3; x.strokeStyle = "#15112e"; x.stroke();
  // Innenring + heller Rand vorne
  x.beginPath(); x.ellipse(cx, baseY, pw * 0.82, ph * 0.74, 0, 0, TAU); x.strokeStyle = col(0.85); x.lineWidth = Math.max(1.5, r * 0.03); x.stroke();
  x.beginPath(); x.ellipse(cx, baseY, pw - 3, ph - 2.5, 0, Math.PI * 0.15, Math.PI * 0.85); x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 2; x.stroke();
  // Kontaktschatten unter dem Kopf
  const cs = x.createRadialGradient(cx, baseY, 0, cx, baseY, r * 0.9);
  cs.addColorStop(0, "rgba(4,8,30,.5)"); cs.addColorStop(1, "rgba(4,8,30,0)");
  x.fillStyle = cs; x.beginPath(); x.ellipse(cx, baseY, r * 0.9, ph * 0.6, 0, 0, TAU); x.fill();
  x.restore();
}

export function drawShowcase(dt) {
  const cv = $("showcase"); if (!cv || App.screen !== "home") return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  showcaseT += dt; showcaseTap = Math.max(0, showcaseTap - dt);
  const t = showcaseT;
  // Platz unter dem Kopf für Namensschild freihalten
  const plate = document.querySelector("#scr-home .plate"), nu = $("hsNext");
  const reserve = (plate ? plate.offsetHeight : 90) + (nu && !nu.hidden && nu.offsetParent ? nu.offsetHeight + 12 : 0) + 24;
  const avail = h - reserve;
  const r = Math.max(30, Math.min(w * 0.2, avail * 0.27, 150));   // auf großen Bildschirmen nicht riesig
  const baseY = avail - r * 0.15; // Boden der Bühne
  const cx = w / 2;
  stageFx(x, w, cx, baseY, r, t);
  // Jonglieren: Ball fällt auf den Kopf, Kopf nickt ihn wieder hoch
  const headY = baseY - r * 1.02, top = headY - r;
  const j = juggle, g = r * 9;
  if (!j.init) { j.init = true; j.y = top - r * 2.4; j.vy = 0; }
  j.vy += g * dt; j.y += j.vy * dt; j.a += dt * 3;
  let bump = 0;
  const br = r * 0.32;
  if (j.y + br > top && j.vy > 0) { j.y = top - br; const hh = Math.max(r * 0.6, Math.min(r * (1.6 + 0.6 * Math.abs(Math.sin(t * 1.3))), top - br * 2 - 8)); j.vy = -Math.sqrt(2 * g * hh); j.hits++; showcaseTap = Math.max(showcaseTap, 0.25); }
  if (showcaseTap > 0) bump = Math.sin((1 - showcaseTap / 0.5) * Math.PI) * 0.1;
  const bx = cx + Math.sin(t * 1.9) * r * 0.12;
  // Schatten des Balls
  x.fillStyle = "rgba(0,0,0,.18)"; x.beginPath(); x.ellipse(bx, top + 4, br * (0.6 + 0.4 * (1 - Math.min(1, (top - j.y) / (r * 3)))), br * 0.2, 0, 0, Math.PI * 2); x.fill();
  // Kopf
  x.save(); x.translate(cx, baseY); x.scale(1 + bump * 0.8, 1 - bump); x.translate(-cx, -baseY);
  const look = -Math.PI / 2 + Math.sin(t * 2) * 0.3;
  // Kopf mit Lichtkante in der Farbe der Seltenheit
  const [gr, gg, gb] = RC[rarityOf(charById(S.char))] || RC.basis;
  const hopt = { dir: 1, look, mood: showcaseTap > 0.3 ? "happy" : "", blink: Math.sin(t * 1.7) > 0.97, t }, hy = headY - bump * r * 0.4;
  // nur der Schatten landet im Bild (Kopf selbst weit außerhalb), sonst färbt der Schein das Gesicht ein
  const gl = x.createRadialGradient(cx, hy, r * 0.85, cx, hy, r * 1.32);
  gl.addColorStop(0, `rgba(${gr},${gg},${gb},.5)`); gl.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
  x.fillStyle = gl; x.beginPath(); x.arc(cx, hy, r * 1.32, 0, Math.PI * 2); x.fill();
  drawHead(x, S.char, cx, hy, r, hopt);
  x.restore();
  drawBall(x, S.ball, bx, j.y, br, j.a, 1, null, { t, vy: j.vy });
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initHome() {
  registerScreen("home", { show: homeScreen });
  $("btnPlay").onclick = () => startMode(S.mode);
  $("modeCard").onclick = () => { A.sfx("click"); showScreen("modes"); };
  $("navHeads").onclick = () => { A.sfx("click"); selectScreen({ title: tx("nav.heads"), okText: tx("ui.select"), onDone: id => { S.char = id; save(); goBack(); } }); };
  $("showcase").onclick = tapShowcase;
  $("hsDaily").onclick = () => { A.sfx("click"); dailyBriefing(); };
  $("hsTasks").onclick = () => { A.sfx("click"); showScreen("tasks"); };
  $("navShop").onclick = () => { A.sfx("click"); showScreen("shop"); };
  $("navTasks").onclick = () => { A.sfx("click"); showScreen("tasks"); };
  $("navAch").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("navChests").onclick = () => { A.sfx("click"); showScreen("chests"); };
  $("homeStars").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("btnProfile").onclick = () => { A.sfx("click"); showScreen("profile"); };
  $("btnSettings").onclick = () => { A.sfx("click"); showScreen("settings"); };
  $("homeCoins").onclick = () => { A.sfx("click"); showScreen("shop"); };
  $("homeGems").onclick = () => { A.sfx("click"); setShopTab(PAYMENTS ? "gems" : "chars"); showScreen("shop"); };
}
