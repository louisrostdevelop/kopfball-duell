// Startseite mit Bühne (jonglierender Kopf), Tageskarten und Kopfzeile
import { charById, CHARS, DIFFS, MODES, RARITY, rarityOf, SUPERS } from "../../content/config.js";
import { matchLen } from "../../core/physics.js";
import { challenge, deal, owns, S, save, tasks, xpFor } from "../../store.js";
import { avatarCanvas, drawBall, drawHead } from "../render/art.js";
import { dailyChallenge } from "../../app/modes.js";
import { App } from "../../app/state.js";
import { $, $$, esc, RCOL, svg } from "../dom.js";
import { goBack } from "../nav.js";
import { selectScreen } from "./select.js";
import * as A from "../../adapters/audio/webaudio.js";

export let showcaseT = 0, showcaseTap = 0, juggle = { y: 0, vy: 0, a: 0, hits: 0 };

// Antippen der Bühne: Kopf nickt, Ball fliegt hoch
export function tapShowcase() { showcaseTap = 0.5; juggle.vy = Math.min(juggle.vy, -200); A.sfx("head"); }

export function homeScreen() {
  refreshTop();
  const c = charById(S.char), rar = rarityOf(c);
  $("stName").textContent = c.name; $("stSuper").textContent = SUPERS[c.super].name;
  const rb = $("stRarity"); rb.textContent = RARITY[rar]; rb.style.setProperty("--rc", RCOL[rar]);
  const m = MODES.find(x => x.id === S.mode) || MODES[0];
  $("mcTitle").textContent = m.name;
  let sub = m.desc;
  if (m.id === "daily") { const ch = dailyChallenge(); sub = ch.done ? "Heute geschafft" : `Heute: ${charById(ch.opp).name}, ${ch.presetName}`; }
  if (m.id === "endless" && S.endlessBest) sub = `Rekord: ${S.endlessBest} Siege`;
  $("mcSub").textContent = sub;
  $("mcIcon").innerHTML = svg(m.icon);
  $("mcIcon").style.background = `linear-gradient(${m.c1}, ${m.c2})`;
  const pf = $("pfAv"); pf.innerHTML = ""; pf.append(avatarCanvas(S.char, 50));
  $("pfName").textContent = S.name || "Spieler";
  // Tages-Challenge
  const ch = dailyChallenge();
  $("hsDaily").classList.toggle("done", ch.done);
  $("hdOpp").textContent = charById(ch.opp).name;
  $("hdRules").textContent = ch.presetName + (matchLen(ch.rules).win ? `, bis ${matchLen(ch.rules).win}` : ", 60 s") + " · " + DIFFS[ch.diff].name;
  $("hdRw").innerHTML = ch.done ? "✓ Geschafft" : `<span class="coin"></span>+${ch.reward}`;
  const ha = $("hdAv"); ha.innerHTML = ""; ha.append(avatarCanvas(ch.opp, 60, { dir: -1, mood: "angry" }));
  // Aufgaben
  const tl = tasks();
  $("htCount").textContent = tl.filter(t => t.done).length + "/" + tl.length;
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
    nu.querySelector("small").textContent = S.coins >= next.price ? "Jetzt freischalten!" : "Nächster Kopf";
    nu.onclick = () => { A.sfx("click"); selectScreen({ title: "Köpfe", cur: next.id, okText: "Auswählen", onDone: id => { S.char = id; save(); goBack(); } }); };
  }
}

export function refreshTop() {
  $$(".coinNum").forEach(e => e.textContent = S.coins);
  $("lvlNum").textContent = S.level;
  $("xpFill").style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%";
  $("xpTxt").textContent = S.xp + "/" + xpFor(S.level);
  $("starNum").textContent = Object.keys(S.ach).length;
  const tl = tasks(), open = tl.filter(t => !t.done).length, ch = challenge();
  const tb = $("taskBadge"); const n = open + (ch.done ? 0 : 1); tb.hidden = !n; tb.textContent = n;
  const dl = deal(); $("shopBadge").hidden = !(dl && S.coins >= dl.price) && !CHARS.some(c => !owns("chars", c.id) && c.price <= S.coins);
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
  const r = Math.max(30, Math.min(w * 0.2, avail * 0.3));
  const baseY = avail - r * 0.15; // Boden der Bühne
  const cx = w / 2;
  // Spot
  const sp = x.createRadialGradient(cx, baseY - r * 1.4, 10, cx, baseY - r * 1.4, r * 3.2);
  sp.addColorStop(0, "rgba(255,255,255,.30)"); sp.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = sp; x.fillRect(0, 0, w, h);
  // Podest
  const pw = r * 1.7, ph = r * 0.32;
  x.save();
  x.shadowColor = "rgba(120,180,255,.7)"; x.shadowBlur = 30;
  x.fillStyle = "#15112e"; x.beginPath(); x.ellipse(cx, baseY + ph * 0.45, pw, ph, 0, 0, Math.PI * 2); x.fill();
  x.shadowBlur = 0;
  const pg = x.createLinearGradient(0, baseY - ph, 0, baseY + ph); pg.addColorStop(0, "#5d8dff"); pg.addColorStop(1, "#1a3fc4");
  x.fillStyle = pg; x.beginPath(); x.ellipse(cx, baseY, pw, ph, 0, 0, Math.PI * 2); x.fill();
  x.lineWidth = 3; x.strokeStyle = "#15112e"; x.stroke();
  x.fillStyle = "rgba(255,255,255,.22)"; x.beginPath(); x.ellipse(cx, baseY - ph * 0.25, pw * 0.7, ph * 0.45, 0, 0, Math.PI * 2); x.fill();
  x.restore();
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
  drawHead(x, S.char, cx, headY - bump * r * 0.4, r, { dir: 1, look, mood: showcaseTap > 0.3 ? "happy" : "", blink: Math.sin(t * 1.7) > 0.97, t });
  x.restore();
  drawBall(x, S.ball, bx, j.y, br, j.a);
}
