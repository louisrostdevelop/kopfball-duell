// Modus-Wahl: Reiter Online / Offline mit Kacheln. Je Reiter eine große Kachel (Ranked, Karriere), darunter die übrigen.
// Breite Bildschirme (Desktop, iPad quer) zeigen beide Seiten nebeneinander, ohne Reiter. Alles passt ohne Scrollen.
// Jede Kachel: Szene (eigener Kopf, eigener Ball, echte Gegner), Name, höchstens eine Angabe, die bei der Wahl hilft.
import { CHARS, charById, MODES } from "../../content/config.js";
import { CAREER } from "../../content/career.js";
import { MAX_STARS, nextGame, totalStars } from "../../core/career.js";
import { S, save } from "../../app/profile.js";
import { App } from "../../app/state.js";
import { $, toast } from "../dom.js";
import { showScreen, registerScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";
import { online as serverOn, serverState } from "../../app/account.js";
import { LEAGUES, league, MIN_LEVEL } from "../../app/matchmaking.js";
import { activity } from "../../app/activity.js";
import { t, has } from "../../content/i18n.js";
import { drawModeScene } from "../render/modeart.js";
import { dailyChallenge } from "../../app/modes.js";

/** Modi, die es gerade gibt (Casual/Ranked nur mit Server) */
export const availableModes = () => MODES.filter(m => !m.server || serverOn());
/** Warum ein Server-Modus gesperrt ist: "level" | "account" | "season" | "" */
export function modeLock(id) {
  if (id !== "casual" && id !== "ranked") return "";
  if (S.level < MIN_LEVEL[id]) return "level";
  if (id === "ranked" && S.guest !== false) return "account";
  if (id === "ranked" && serverState() && !serverState().season) return "season";
  return "";
}
/** Kurztext für die Sperre */
export const lockText = (lock, id) => (lock ? t("lock." + lock, { n: MIN_LEVEL[id] }) : "");

/** Kurztext zur Aktivität für einen Modus: suchen > spielen > andere online > ruhig */
export function activityText(a, id) {
  const n = a[id] || 0;
  if (n > 0) return { text: t(n === 1 ? "act.search1" : "act.search", { n }), on: true };
  if (a.playing > 0) return { text: t("act.playing", { n: a.playing }), on: true };
  if (a.active >= 1) return { text: t("act.active", { n: a.active }), on: false };
  return { text: t("act.quiet"), on: false };
}

// Gegner im nächsten Karriere-Spiel (wie startCareer: ist es der eigene Kopf, spielt der nächste in der Liste)
const careerOpp = ng => { const ch = CAREER[ng.li].games[ng.gi].ch; return ch !== S.char ? ch : CHARS[(CHARS.findIndex(x => x.id === ch) + 1) % CHARS.length].id; };
const rating = () => { const r = serverState() && serverState().season && serverState().season.rating; return r ? r.mmr : 1000; };
const tierOf = mmr => LEAGUES.find(([m]) => mmr >= m)[1];

/**
 * Was eine Kachel (und die Modus-Karte auf der Startseite) zeigt:
 * info (eine Zeile), badge [Art, Text], bar { pct, text } (nur große Kachel), lock
 */
export function modeInfo(m) {
  const lock = modeLock(m.id);
  const o = { info: has(`mode.${m.id}.short`) ? t(`mode.${m.id}.short`) : "", badge: null, bar: null, lock };
  switch (m.id) {
    case "ranked": {
      // Balken über höchstens 300 Punkte vor der nächsten Liga (Bronze beginnt bei 0, gestartet wird bei 1000)
      const mmr = rating(), up = [...LEAGUES].reverse().find(([v]) => v > mmr), cur = Math.max(LEAGUES.find(([v]) => mmr >= v)[0], up ? up[0] - 300 : 0);
      o.info = league(mmr) + " · " + mmr;
      o.bar = up ? { pct: (mmr - cur) / (up[0] - cur), text: t("mode.ranked.toNext", { n: up[0] - mmr, name: t("league." + up[1]) }) } : { pct: 1, text: t("mode.ranked.top") };
      break;
    }
    case "career": {
      const n = totalStars(S.career), ng = nextGame(S.career);
      o.badge = ["", "★ " + n + "/" + MAX_STARS];
      o.info = ng ? CAREER[ng.li].name : t("mode.career.allDone");
      o.bar = { pct: n / MAX_STARS, text: ng ? t("mode.career.next", { name: charById(careerOpp(ng)).name }) : t("mode.career.stars", { n: MAX_STARS - n }) };
      break;
    }
    case "daily": {
      const c = dailyChallenge();
      o.badge = c.done ? ["done", "✓"] : ["gold", "+" + c.reward];
      o.info = c.done ? t("mode.daily.doneShort") : t("mode.daily.vs", { name: charById(c.opp).name });
      break;
    }
    case "endless": o.info = S.endlessBest ? t("mode.endless.record", { n: S.endlessBest }) : t("mode.endless.tags.0"); break;
    case "cup": o.info = t("mode.cup.tags.0"); break;
  }
  if (lock) { o.info = lockText(lock, m.id); o.bar = null; }
  return o;
}

// Wer auf den Szenen mitspielt: eigener Kopf, Ball, Gegner (fest pro Tag, damit es nicht flackert)
function sceneData() {
  const you = S.char, others = CHARS.filter(c => c.id !== you), day = Math.floor(Date.now() / 864e5);
  const pickOpp = k => others[(day + k) % others.length].id;
  const ng = nextGame(S.career), c = dailyChallenge();
  return {
    you, ball: S.ball, opp: pickOpp(0), mate: pickOpp(3), tier: tierOf(rating()), record: S.endlessBest || 0, day: new Date().getDate(), code: "K7Q2",
    career: ng ? careerOpp(ng) : pickOpp(5), daily: c.opp,
  };
}
const sceneFor = (id, d) => (id === "career" ? { ...d, opp: d.career } : id === "daily" ? { ...d, opp: d.daily } : d);

// ---------- Darstellung ----------
let scenes = null;    // ResizeObserver: malt eine Szene neu, wenn sich ihre Kachel ändert
let data = null;
const sideOf = id => (MODES.find(m => m.id === id) || {}).side || "off";
const LAYOUT = () => {
  const w = innerWidth, h = innerHeight;
  if (w > h && w >= 1000 && h >= 600) return "both";
  return w > h ? "wide" : "narrow";
};

function tile(m) {
  const o = modeInfo(m), b = document.createElement("button");
  b.className = "mcard" + (S.mode === m.id ? " on" : "") + (o.lock ? " locked" : "");
  b.dataset.mode = m.id; b.style.setProperty("--c1", m.c1); b.style.setProperty("--c2", m.c2);
  const badge = o.lock ? `<span class="mbadge lock"><svg><use href="#i-lock"/></svg></span>` : o.badge ? `<span class="mbadge ${o.badge[0]}">${o.badge[1]}</span>` : "";
  const bar = o.bar ? `<span class="mbar"><i style="width:${Math.round(Math.max(0.04, Math.min(1, o.bar.pct)) * 100)}%"></i></span><small>${o.bar.text}</small>` : "";
  b.innerHTML = `<span class="mbody"><span class="mscn"><canvas class="mscene" aria-hidden="true"></canvas></span><span class="mfoot"><b>${m.name}</b>${o.info ? `<em>${o.info}</em>` : ""}${bar}</span></span>${badge}`;
  b.onclick = () => pick(m, o.lock);
  return b;
}

function pick(m, lock) {
  A.sfx("click");
  if (lock === "account") { toast(t("lock.rankedAccount"), "i-user"); showScreen("profile"); return; }
  if (lock === "level") { toast(t("lock.levelHint", { n: MIN_LEVEL[m.id] }), "i-lock"); return; }
  if (lock) { toast(lockText(lock, m.id), "i-lock"); return; }
  S.mode = m.id; save(); App.modeTab = m.side; App.stack = []; showScreen("home", true);
}

export function modesScreen() {
  const g = $("modeGrid"); g.innerHTML = "";
  data = sceneData();
  const list = availableModes();
  App.modeTab ||= sideOf(S.mode);
  for (const side of ["on", "off"]) {
    const ms = list.filter(m => m.side === side); if (!ms.length) continue;
    const sec = document.createElement("section"); sec.className = "mside"; sec.dataset.side = side; sec.setAttribute("role", "tabpanel");
    sec.innerHTML = `<h3 class="mside-h"><svg><use href="#${side === "on" ? "i-globe" : "i-play"}"/></svg>${t("modes.side." + side)}<span class="cnt" hidden></span></h3><div class="mgrid"></div>`;
    const grid = sec.lastChild;
    let group = null;
    ms.forEach((m, i) => {
      if (m.group && m.group !== group) { group = m.group; const l = document.createElement("span"); l.className = "mlab"; l.textContent = t("modes.group." + group); grid.append(l); }
      const el = tile(m); if (i === 0) el.classList.add("hero"); grid.append(el);
    });
    g.append(sec);
  }
  // nur eine Seite da (ohne Server gibt es online nur „Mit Freunden“): trotzdem beide Reiter, es fehlt nichts
  if (!g.querySelector(`[data-side="${App.modeTab}"]`)) App.modeTab = g.firstChild ? g.firstChild.dataset.side : "off";
  setTab(App.modeTab);
  layout();
  watchScenes();
  liveCounts();
}

function setTab(side) {
  App.modeTab = side;
  for (const b of document.querySelectorAll("#modeTabs [data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === side));
  for (const s of document.querySelectorAll("#modeGrid .mside")) s.classList.toggle("cur", s.dataset.side === side);
  layout();
}

// Raster je Bildschirm: hochkant große Kachel oben, quer links, breit beide Seiten nebeneinander
function layout() {
  const scr = $("scr-modes"), g = $("modeGrid"); if (!scr || scr.hidden) return;
  const lay = LAYOUT(); scr.dataset.lay = lay;
  const sides = [...g.querySelectorAll(".mside")];
  const info = sides.map(sec => { const n = sec.querySelectorAll(".mcard").length - 1; return { sec, rest: n, cols: lay === "both" ? (n <= 2 ? 1 : 3) : 0 }; });
  const rmax = Math.max(1, ...info.map(i => Math.ceil(i.rest / Math.max(1, i.cols))));
  // beide Seiten: eine Spalte (wenige Modi) ist schmaler als drei, die Zeilen liegen auf gleicher Höhe
  g.style.gridTemplateColumns = lay === "both" ? info.map(i => (i.cols === 1 ? 2 : i.cols) + "fr").join(" ") : "";
  for (const { sec, rest, cols } of info) {
    const grid = sec.querySelector(".mgrid"), hero = grid.querySelector(".hero");
    const items = [...grid.children];
    items.forEach(el => { el.style.gridColumn = ""; el.style.gridRow = ""; });
    if (lay === "narrow") {
      // Höhe so aufteilen, dass der Bildschirm gefüllt ist: große Kachel 1,25 Teile, jede Reihe 1 Teil (mit Obergrenzen)
      const c = rest <= 2 || rest === 4 ? 2 : 3, w = g.clientWidth || 360, H = g.clientHeight || 600, gap = 10;
      const kinds = []; let inRow = 0;   // Zeilen: l = Abschnitt, h = große Kachel, t = Reihe Kacheln
      for (const el of items) {
        if (el.classList.contains("mlab")) { kinds.push("l"); inRow = 0; }
        else if (el === hero) { el.style.gridColumn = "1 / -1"; kinds.push("h"); inRow = 0; }
        else { if (inRow === 0) kinds.push("t"); inRow = (inRow + 1) % c; }
      }
      const n = k => kinds.filter(x => x === k).length, cw = (w - gap * (c - 1)) / c;
      const unit = (H - n("l") * 24 - (kinds.length - 1) * gap) / (1.25 * n("h") + n("t"));
      const tmax = Math.round(Math.max(100, Math.min(unit, cw * 1.6, 300))), hmax = Math.round(Math.max(130, Math.min(unit * 1.25, w * 0.75, 360)));
      grid.style.gridTemplateColumns = `repeat(${c}, minmax(0, 1fr))`;
      grid.style.gridTemplateRows = kinds.map(k => (k === "l" ? "auto" : k === "h" ? `minmax(130px, ${hmax}px)` : `minmax(100px, ${tmax}px)`)).join(" ");
    } else if (lay === "wide") {
      const R = rest <= 2 ? Math.max(rest, 1) : 2, c = Math.ceil(rest / R);
      grid.style.gridTemplateColumns = `minmax(0, 1.4fr)` + (rest ? ` repeat(${c}, minmax(0, 1fr))` : "");
      grid.style.gridTemplateRows = `repeat(${R}, minmax(0, 1fr))`;
      hero.style.gridRow = `1 / span ${R}`;
    } else {
      const R = Math.max(1, Math.ceil(rest / cols));
      grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      grid.style.gridTemplateRows = `minmax(0, 1.2fr)` + (rest ? ` repeat(${R}, minmax(0, ${rmax / R}fr))` : "");
      hero.style.gridColumn = "1 / -1";
    }
  }
}

function watchScenes() {
  if (!scenes) scenes = new ResizeObserver(es => { for (const e of es) paint(e.target); });
  scenes.disconnect();
  for (const cv of document.querySelectorAll("#modeGrid .mscene")) { scenes.observe(cv); paint(cv); }
}
function paint(cv) {
  const card = cv.closest(".mcard"), id = card && card.dataset.mode;
  if (id && data) drawModeScene(cv, id, sceneFor(id, data));
}

// Aktivität: wie viele gerade suchen (Casual, Ranked) und wie viele andere online sind (Reiter; active zählt einen selbst nicht)
function liveCounts() {
  activity().then(a => {
    if (!a || App.screen !== "modes") return;
    for (const id of ["casual", "ranked"]) {
      const card = document.querySelector(`#modeGrid [data-mode="${id}"]`);
      if (!card || card.classList.contains("locked")) continue;
      const { text, on } = activityText(a, id);
      let el = card.querySelector(".mbadge.live");
      if (!el) { el = document.createElement("span"); el.className = "mbadge live"; card.append(el); }
      el.classList.toggle("on", on); el.textContent = text;
    }
    const n = a.active || 0;
    for (const el of document.querySelectorAll("#modeTabs .cnt, #modeGrid [data-side=on] .cnt")) { el.hidden = n < 1; el.textContent = n; }
  });
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initModes() {
  registerScreen("modes", { show: modesScreen });
  for (const b of document.querySelectorAll("#modeTabs [data-tab]")) b.onclick = () => { if (b.dataset.tab !== App.modeTab) A.sfx("click"); setTab(b.dataset.tab); };
  let tm = 0;
  addEventListener("resize", () => { clearTimeout(tm); tm = setTimeout(() => { if (App.screen === "modes") layout(); }, 60); });
  // Szenen brauchen die Spielschrift (Raumcode, Rekord): nach dem Laden neu malen
  if (document.fonts) document.fonts.ready.then(() => { if (App.screen === "modes") watchScenes(); });
  setInterval(() => { if (App.screen === "modes" && !document.hidden) liveCounts(); }, 10000);
}
