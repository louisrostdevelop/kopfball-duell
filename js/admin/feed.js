// Live-Verlauf fürs Admin-Dashboard: die letzten Sitzungen einzelner Spieler (api.admin_feed), nur unter Kürzel.
// Der Zustand lebt hier und übersteht das Neuzeichnen der Seite (Zeitraum, Auto-Abruf alle 2 Minuten): aufgeklappte
// Sitzungen, geladene ältere Seiten. Eigener Abruf alle 30 s; Fehler stehen nur in dieser Karte.
import { MODE_NAMES, SRC_NAMES } from "./view.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const errCode = e => esc((e && e.code) || "Fehler");
const TZ = { timeZone: "Europe/Berlin" };
const hm = t => new Date(t).toLocaleTimeString("de-DE", { ...TZ, hour: "2-digit", minute: "2-digit" });
const ymd = t => new Date(t).toLocaleDateString("en-CA", TZ);   // JJJJ-MM-TT in deutscher Zeit
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const FIRST = 10, MORE = 20;   // so viele Sitzungen zuerst, so viele je „Ältere laden“
const LIVE_MS = 5 * 60000;     // aktiv in den letzten 5 Minuten: „live“

// Modus im Satz („3 Spiele gegen Computer“)
const PHRASE = { cpu: "gegen Computer", cup: "im Cup", career: "in der Karriere", endless: "Endlos", daily: "Tages-Challenge", training: "Training",
  local: "zu zweit", friends: "mit Freunden", casual: "Casual", ranked: "Ranked", other: "sonstige" };
const NET_MODES = { ...MODE_NAMES, friend: "Mit Freunden" };
const REASONS = { dropped: "eigene Verbindung weg", opp_gone: "Gegner weg", void: "Start ungültig", desync: "nicht synchron" };
const STATUS = { settled: "gewertet", void: "verfallen", disputed: "in Prüfung", review: "in Prüfung", open: "offen" };
const srcName = r => SRC_NAMES[r] || r;

/** Text und Art (Farbe des Punkts) eines Ereignisses */
function label(e) {
  const m = NET_MODES[e.mode] || e.mode || "";
  switch (e.kind) {
    case "account": return ["Konto angelegt", "new"];
    case "first_visit": return [`Erster Besuch${e.ref ? (e.ref === "direct" ? " · direkt" : " · über " + srcName(e.ref)) : ""}${e.src ? ` (${e.src})` : ""}`, "new"];
    case "visit": return ["Besuch", "visit"];
    case "match_start": return [`Spiel gestartet: ${m}`, "game"];
    case "match_end": return e.done ? [`Spiel zu Ende: ${m}`, "game"] : [`Spiel abgebrochen: ${m}`, "quit"];
    case "search_start": return [`Gegnersuche: ${m}`, "net"];
    case "search_end": {
      const w = Number.isFinite(e.wait_s) ? ` · ${e.wait_s} s` : "";
      return e.outcome === "matched" ? [`Gegner gefunden${w}`, "net"] : e.outcome === "cancel" ? [`Suche abgebrochen${w}`, "quit"] : ["Suche fehlgeschlagen", "bad"];
    }
    case "net_result": return e.path === "failed" ? [`Verbindung gescheitert (${m})`, "bad"] : [`Verbindung: ${e.path === "relay" ? "über Relay" : "direkt"} (${m})`, "net"];
    case "lobby": return [{ created: "Freundes-Lobby erstellt", joined: "Lobby beigetreten", started: "Lobby angepfiffen" }[e.action] || "Lobby", "lobby"];
    case "abort": return [`Online-Spiel abgebrochen: ${REASONS[e.reason] || e.reason}`, "bad"];
    case "online": return [`Online-Spiel gepaart: ${m} · ${e.started ? "angepfiffen" : "nicht angepfiffen"}${STATUS[e.status] ? " · " + STATUS[e.status] : ""}`, "net"];
    default: return [e.kind, "visit"];
  }
}

/** Zeile 2: was in der Sitzung passiert ist */
function summary(s) {
  const u = s.sum || {}, parts = [];
  const modes = Object.entries(u.modes || {}).sort((a, b) => b[1] - a[1]);
  if (u.games > 0) {
    parts.push(modes.length === 1 ? `${plural(u.games, "Spiel", "Spiele")} ${PHRASE[modes[0][0]] || modes[0][0]}`
      : `${plural(u.games, "Spiel", "Spiele")}: ${modes.map(([k, n]) => `${n} ${PHRASE[k] || k}`).join(", ")}`);
    if (u.done) parts.push(`${u.done} beendet`);
  }
  if (u.lobbies) parts.push(plural(u.lobbies, "Freundes-Lobby", "Freundes-Lobbys"));
  if (u.searches) parts.push(plural(u.searches, "Gegnersuche", "Gegnersuchen"));
  if (u.online && !u.games) parts.push(plural(u.online, "Online-Spiel", "Online-Spiele"));
  return parts.join(" · ") || (s.new ? "Angekommen, noch nicht gespielt" : "Nur vorbeigeschaut");
}

// Farbe je Kürzel, immer dieselbe
function hue(name) { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

export function createFeed({ client }) {
  const st = { items: [], next: null, loaded: false, loading: false, more: false, err: "", refreshErr: "", shown: FIRST, skew: 0, at: 0 };
  const open = new Set(), seen = new Set(), fresh = new Set();
  const key = s => s.player + "|" + s.start;
  const now = () => Date.now() + st.skew;

  function when(s) {
    const t0 = new Date(s.start).getTime(), t1 = new Date(s.end).getTime(), ago = now() - t1;
    if (ago < LIVE_MS) return "jetzt aktiv";
    if (ago < 3600000) return `vor ${Math.max(1, Math.round(ago / 60000))} Min`;
    const d = ymd(t1), today = ymd(now()), yest = ymd(now() - 86400000);
    const day = d === today ? "heute" : d === yest ? "gestern" : (() => { const [y, m, dd] = d.split("-").map(Number); return WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] + " " + dd + "." + m + "."; })();
    return `${day} ${hm(t0)}${hm(t0) === hm(t1) ? "" : "–" + hm(t1)}`;
  }

  function item(s) {
    const k = key(s), live = now() - new Date(s.end).getTime() < LIVE_MS, isOpen = open.has(k);
    const mins = Math.round((new Date(s.end) - new Date(s.start)) / 60000);
    const chips = [s.new && `<span class="fchip new">neu</span>`, s.registered && `<span class="fchip reg">registriert</span>`,
      s.src && `<span class="fchip">${s.src === "direct" ? "direkt" : "über " + esc(srcName(s.src))}</span>`].filter(Boolean).join("");
    const evs = (s.events || []).map(e => { const [t, c] = label(e); return `<li class="k-${c}"><time>${esc(hm(e.at))}</time><span>${esc(t)}</span></li>`; }).join("");
    return `<li class="ses${isOpen ? " open" : ""}${fresh.has(k) ? " fresh" : ""}" data-k="${esc(k)}">
      <button class="ses-row" aria-expanded="${isOpen}">
        <span class="ava${live ? " live" : ""}" style="--h:${hue(s.player)}" aria-hidden="true">${esc(String(s.player).slice(0, 2))}</span>
        <span class="ses-l1"><b>Besucher ${esc(s.player)}</b>${chips}</span>
        <span class="ses-t${live ? " live" : ""}">${live ? `<i aria-hidden="true"></i>` : ""}${esc(when(s))}</span>
        <span class="ses-l2">${esc(summary(s))}</span>
      </button>
      <div class="tl-wrap"${isOpen ? "" : " hidden"}>
        ${s.more > 0 ? `<p class="tl-more">${plural(s.more, "früheres Ereignis", "frühere Ereignisse")} nicht gezeigt</p>` : ""}
        <ol class="tline">${evs}</ol>
        <p class="tl-foot">${plural(s.count, "Ereignis", "Ereignisse")}${mins > 0 ? ` · ${mins} Min` : ""}</p>
      </div></li>`;
  }

  function render() {
    const box = document.getElementById("feedBox");
    if (!box) return;
    if (!st.loaded) {
      box.innerHTML = st.err
        ? `<p class="down small">Der Verlauf ließ sich nicht laden (${st.err}).</p><button class="btn ghost" id="feedRetry">Nochmal</button>`
        : `<p class="muted small"><span class="spin sm" aria-hidden="true"></span> Lädt …</p>`;
      const r = document.getElementById("feedRetry");
      if (r) r.onclick = () => { st.err = ""; load(); };
      return;
    }
    // Stelle halten: dieselbe Sitzung bleibt an derselben Stelle im Bild, auch wenn oben neue dazukommen
    const anchor = [...box.querySelectorAll(".ses")].find(el => el.getBoundingClientRect().bottom > 80);
    const aKey = anchor && anchor.dataset.k, aTop = anchor && anchor.getBoundingClientRect().top;
    const card = box.closest(".card"), cTop = card ? card.getBoundingClientRect().top : 0, cH = card ? card.offsetHeight : 0;

    const list = st.items.slice(0, st.shown);
    const canMore = st.shown < st.items.length || st.next;
    box.innerHTML = (st.refreshErr ? `<p class="down small feed-err">Aktualisieren ging nicht (${st.refreshErr}).</p>` : "")
      + (list.length ? `<ol class="feed">${list.map(item).join("")}</ol>` : `<p class="feed-empty">Noch niemand da. Sobald jemand spielt, erscheint er hier (aktualisiert alle 30 Sekunden).</p>`)
      + (canMore ? `<div class="feed-more"><button class="btn ghost" id="feedMore"${st.more ? " disabled" : ""}>${st.more ? `<span class="spin sm" aria-hidden="true"></span>Lädt …` : "Ältere laden"}</button></div>` : "");
    for (const b of box.querySelectorAll(".ses-row")) b.onclick = () => toggle(b.closest(".ses"));
    const mb = document.getElementById("feedMore");
    if (mb) mb.onclick = older;

    // nur wenn die Karte oben schon aus dem Bild ist; sonst erscheint Neues oben sichtbar
    if (card && cTop < 80) {
      const a2 = aKey && [...box.querySelectorAll(".ses")].find(el => el.dataset.k === aKey);
      if (a2 && aTop < innerHeight) scrollBy(0, a2.getBoundingClientRect().top - aTop);
      else if (cTop + cH < 80) scrollBy(0, card.offsetHeight - cH);
    }
  }

  function toggle(li) {
    const k = li.dataset.k, on = !open.has(k);
    if (on) open.add(k); else open.delete(k);
    li.classList.toggle("open", on);
    li.querySelector(".ses-row").setAttribute("aria-expanded", String(on));
    li.querySelector(".tl-wrap").hidden = !on;
  }

  const apply = r => { if (r && r.now) st.skew = new Date(r.now).getTime() - Date.now(); };

  async function load() {
    if (st.loading) return;
    st.loading = true; render();
    try {
      const r = await client.rpc("admin_feed", {});
      apply(r);
      st.items = r.items || []; st.next = r.next || null;
      for (const s of st.items) seen.add(key(s));
      st.loaded = true; st.at = Date.now();
    } catch (e) { st.err = errCode(e); } finally { st.loading = false; render(); }
  }

  // Erste Seite neu; schon geladene ältere bleiben, sofern sie nicht in der neuen Seite stecken
  async function refresh() {
    if (!st.loaded) { if (!st.loading && !st.err) load(); return; }
    if (st.loading || st.more) return;
    st.loading = true;
    try {
      const r = await client.rpc("admin_feed", {});
      apply(r);
      const top = r.items || [], keys = new Set(top.map(key));
      const cut = top.length ? new Date(top[top.length - 1].end).getTime() : Infinity;
      const rest = r.next ? st.items.filter(s => !keys.has(key(s)) && new Date(s.end).getTime() < cut) : [];
      fresh.clear();
      for (const s of top) { const k = key(s); if (!seen.has(k)) { fresh.add(k); seen.add(k); } }
      st.items = [...top, ...rest];
      if (!r.next) st.next = null; else if (!rest.length) st.next = r.next;
      st.refreshErr = ""; st.at = Date.now();
    } catch (e) { st.refreshErr = errCode(e); } finally { st.loading = false; render(); }
  }

  async function older() {
    if (st.shown < st.items.length) { st.shown += MORE; render(); return; }
    if (!st.next || st.more) return;
    st.more = true; render();
    try {
      const r = await client.rpc("admin_feed", { p_before: st.next });
      apply(r);
      const have = new Set(st.items.map(key));
      const add = (r.items || []).filter(s => !have.has(key(s)));
      for (const s of add) seen.add(key(s));
      st.items = st.items.concat(add); st.next = r.next || null; st.shown += MORE; st.refreshErr = "";
    } catch (e) { st.refreshErr = errCode(e); } finally { st.more = false; render(); }
  }

  return {
    /** Nach jedem Neuzeichnen der Seite aufrufen: zeigt den gemerkten Stand, lädt beim ersten Mal */
    mount() { render(); if (!st.loaded && !st.loading && !st.err) load(); },
    refresh,
    /** Zuletzt geladen (ms), für den Abruf beim Zurückkommen auf die Seite */
    age: () => (st.at ? Date.now() - st.at : Infinity),
  };
}
