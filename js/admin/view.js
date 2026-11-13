// Admin-Dashboard: Gerüst (Seitenleiste, Kopfzeile, Tab-Leiste), Kacheln, Abschnitte und Diagramme. SVG ohne Bibliothek,
// die CSP lässt nur eigene Skripte zu. Diagramme werden mit der echten Breite gezeichnet (Schrift bleibt auf dem Handy
// lesbar) und beim Drehen neu.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const num = n => (Number(n) || 0).toLocaleString("de-DE");
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) + " %" : "–");
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const dayLabel = (iso, wd = false) => { const [y, m, d] = String(iso).split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return (wd ? WD[dt.getUTCDay()] + " " : "") + d + "." + m + "."; };
const dateTime = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) + ", " + d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }); };
const clock = d => d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
// Stunde in deutscher Zeit („14 Uhr“) für den Verlauf über 24 Stunden
const HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" });
const hourOf = iso => Number(HOUR.format(new Date(iso)));
const hourLabel = iso => hourOf(iso) + " Uhr";

export const MODE_NAMES = { cpu: "Gegen Computer", cup: "Cup", career: "Karriere", endless: "Endlos", daily: "Tages-Challenge", training: "Training",
  local: "Zu zweit", friends: "Mit Freunden", casual: "Casual", ranked: "Ranked", other: "Sonstige" };
export const SRC_NAMES = { direct: "Direkt", invite: "Einladungslink", other: "Andere Seite", unknown: "Unbekannt (vor der Erfassung)", x: "X / Twitter",
  reddit: "Reddit", google: "Google", bing: "Bing", duckduckgo: "DuckDuckGo", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram",
  facebook: "Facebook", discord: "Discord" };
const REASONS = { dropped: "Eigene Verbindung weg", opp_gone: "Gegner weg", void: "Start ungültig", desync: "Nicht synchron" };

// Reihenfarben: 1 Aktive, 2 Neue, 3 Online; Relay und Fehler eigene Töne (alle mit mindestens 3:1 gegen die Karte)
const C = { active: "var(--c1)", new: "var(--c2)", online: "var(--c3)", relay: "var(--c4)", bad: "var(--bad)", alt: "var(--c5)" };

// Strich-Symbole (24er Raster, currentColor)
const ICONS = {
  home: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  growth: "M4 19h16M6 15l4-4 3 3 5-6M14 8h4v4",
  source: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  funnel: "M4 5h16l-6 7.5V19l-4 2v-8.5z",
  modes: "M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14.5 13h-5l-1.1 1.8A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4zM8 10.5v3M6.5 12h3M15.5 11.5h.01M17.5 13h.01",
  online: "M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 15.8a5 5 0 0 1 6.6 0M12 19.5h.01",
  devices: "M4 6a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v3M3 18h11M5 15V9M17 11h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.5a6.5 6.5 0 0 1 3 5.5",
  plus: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6",
  back: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4",
  match: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4z",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4",
  game: "M14 5h5v5M19 5l-8 8M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4",
  bell: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2.2 2.2 0 0 0 4 0M12 3v2",
  live: "M3 12h3.5l2.5-6 4 12 2.5-6H21",
};
export const icon = (k, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;

export const NAV = [
  ["top", "Übersicht", "home"], ["secLive", "Live", "live"], ["secGrowth", "Wachstum", "growth"], ["secSources", "Herkunft", "source"], ["secFunnel", "Trichter", "funnel"],
  ["secModes", "Modi", "modes"], ["secOnline", "Online", "online"], ["secPush", "Push", "bell"], ["secStaff", "Geräte", "devices"],
];
// Tab-Leiste am Handy: höchstens fünf Ziele, der Rest per Scrollen
const TABS = ["top", "secLive", "secGrowth", "secModes", "secOnline"];

/** Kleine Verlaufslinie (letzte 14 Tage) für eine Kachel */
function spark(vals, color) {
  const v = vals.slice(-14);
  if (v.length < 2) return "";
  const w = 120, h = 36, max = Math.max(1, ...v), step = w / (v.length - 1);
  const pts = v.map((x, i) => [i * step, h - 3 - (h - 6) * (x / max)]);
  const line = pts.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1)).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${line} L${w},${h} L0,${h} Z" fill="${color}" opacity=".16"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function kpi(label, [today, yest], ico, color, series, foot = "") {
  const d = today - yest, cls = d > 0 ? "up" : d < 0 ? "down" : "flat";
  return `<div class="kpi" style="--k:${color}"><div class="kpi-head"><span class="badge">${icon(ico)}</span><div class="lab">${label}</div></div>
    <div class="val">${num(today)}</div>
    <div class="cmp"><span class="delta ${cls}">${d > 0 ? "▲ " : d < 0 ? "▼ " : "± "}${num(Math.abs(d))}</span><span>gestern ${num(yest)}</span></div>
    ${series ? spark(series, color) : `<div class="kpi-foot">${foot}</div>`}</div>`;
}
const chart = (id, title, color, big = false) => `<div class="chart${big ? " big" : ""}" id="${id}" style="--k:${color}"><div class="chart-head"><h3>${title}</h3><div class="read" aria-live="polite"></div></div><div class="plot"></div><div class="axis"></div></div>`;
function hbar(label, v, max, sub = "", color = C.active) {
  return `<div class="hbar"><div class="hbar-top"><span>${label}</span><span class="num">${num(v)}${sub ? ` <small>${sub}</small>` : ""}</span></div><span class="track"><span class="fill" style="width:${max > 0 ? Math.max(1, (100 * v) / max) : 0}%;background:${color}"></span></span></div>`;
}
/** Ring mit Anteil a/b in der Mitte */
function ring(a, b, color, label, sub) {
  const r = 34, c = 2 * Math.PI * r, f = b > 0 ? Math.min(1, a / b) : 0;
  return `<div class="ring"><svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="${r}" class="ring-bg"/>
    <circle cx="42" cy="42" r="${r}" stroke="${color}" class="ring-fg" stroke-dasharray="${(f * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/></svg>
    <div class="ring-val">${pct(a, b)}</div><div class="ring-txt"><b>${label}</b><span>${sub}</span></div></div>`;
}
/** Ring aus mehreren Teilen (Verbindungsart) mit Legende */
function donut(parts) {
  const sum = parts.reduce((a, p) => a + p.n, 0), r = 34, c = 2 * Math.PI * r;
  let off = 0, segs = "";
  if (sum) for (const p of parts.filter(q => q.n)) { const len = (p.n / sum) * c; segs += `<circle cx="42" cy="42" r="${r}" stroke="${p.color}" class="ring-fg flat" stroke-dasharray="${len.toFixed(1)} ${c.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 42 42)"/>`; off += len; }
  return `<div class="donut" role="img" aria-label="${esc(parts.map(p => p.label + " " + p.n).join(", "))}"><div class="ring"><svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="${r}" class="ring-bg"/>${segs}</svg>
    <div class="ring-val">${num(sum)}</div></div>
    <div class="legend">${parts.map(p => `<span><i style="background:${p.color}"></i>${p.label}<b>${num(p.n)}</b><em>${pct(p.n, sum)}</em></span>`).join("")}</div></div>`;
}
const tiles = rows => `<div class="tiles">${rows.map(([k, v, s]) => `<div class="tile"><span class="tl">${k}</span><span class="tv">${v}</span>${s ? `<span class="ts">${s}</span>` : ""}</div>`).join("")}</div>`;
const card = (id, title, ico, body, cls = "", extra = "") => `<section class="card ${cls}" id="${id}"><header class="card-head"><span class="badge sm">${icon(ico)}</span><h2>${title}</h2>${extra}</header>${body}</section>`;

/** Ganze Seite als HTML (Gerüst und Inhalt); Diagramme danach mit drawCharts */
export function dashboard(s, { days, daysList, updated }) {
  const hourly = s.unit === "hour";
  const since = s.since ? new Date(s.since) : null, from = s.start ? new Date(s.start) : new Date(s.from + "T00:00:00");
  const per = hourly ? "pro Stunde" : "pro Tag", span = hourly ? "24 Std" : `${s.days} Tage`;
  const inSpan = hourly ? "der letzten 24 Stunden" : "im Zeitraum";
  // Rückkehr zählt bei 24 Std über die Konten von 7 Tagen
  const cohort = s.cohort_days && s.cohort_days !== s.days ? ` (${s.cohort_days} Tage)` : "";
  const late = !since || since > from;
  const sinceNote = !since ? "Noch keine Ereignisse erfasst: Herkunft, Modi und Online-Details erscheinen, sobald gespielt wird."
    : late ? `Ereignisse (Herkunft, Spielstarts, Suche, Verbindung) gibt es erst seit ${esc(dateTime(s.since))}. Davor zählen nur Konten, Buchungen und Online-Spiele.` : "";
  const r = s.retention, f = s.funnel, o = s.online, ser = s.series || [];
  const col = k => ser.map(x => Number(x[k]) || 0).slice(hourly ? -24 : -14);
  const steps = [["Konten angelegt", f.created], ["Erstes Spiel begonnen", f.started], ["Erstes Spiel beendet", f.finished], ["Am nächsten Tag wieder da", f.returned]];
  const modes = s.modes || [], mMax = Math.max(1, ...modes.map(m => Math.max(m.started, m.booked)));
  const ab = o.aborts || {}, abN = Object.values(ab).reduce((a, b) => a + b, 0);
  const act = s.kpi.active[0], ret = s.kpi.returning[0];
  const seg = `<div class="seg" id="days" role="group" aria-label="Zeitraum">${daysList.map(d => `<button data-d="${d}" class="${d === days ? "on" : ""}" aria-pressed="${d === days}">${d === 1 ? "24 Std" : d + " Tage"}</button>`).join("")}</div>`;
  const nav = NAV.map(([id, l, ic]) => `<a href="#${id}" data-nav="${id}">${icon(ic)}<span>${l}</span></a>`).join("");
  const tabs = NAV.filter(([id]) => TABS.includes(id)).map(([id, l, ic]) => `<a href="#${id}" data-nav="${id}">${icon(ic)}<span>${l}</span></a>`).join("");
  const today = s.today ? dayLabel(s.today, true) : "";

  return `<div class="shell">
<aside class="side"><a class="brand" href="/"><img src="icons/icon-192.png" alt="" width="36" height="36"><span><b>Headstars</b><small>Statistik</small></span></a>
  <nav class="nav" aria-label="Abschnitte">${nav}</nav>
  <a class="side-foot" href="/">${icon("game")}<span>Zum Spiel</span></a></aside>
<div class="main">
<header class="bar"><a class="brand mini" href="/"><img src="icons/icon-192.png" alt="" width="30" height="30"></a>
  <div class="bar-title"><h1>Übersicht</h1><p>Heute${today ? ", " + today : ""} · Stand <span id="stamp">${esc(clock(updated))}</span></p></div>
  ${seg}<a class="iconbtn to-game" href="/" aria-label="Zum Spiel" title="Zum Spiel">${icon("game")}</a><button class="iconbtn" id="refresh" aria-label="Neu laden" title="Neu laden">${icon("refresh")}</button></header>
<main class="content" id="top">
${sinceNote ? `<p class="note">${sinceNote}</p>` : ""}
<section class="kpis" aria-label="Heute">${kpi("Aktive heute", s.kpi.active, "users", C.active, col("active"))}${kpi("Neue Spieler", s.kpi.new, "plus", C.new, col("new"))}${kpi("Wiederkehrer", s.kpi.returning, "back", C.alt, null, `${pct(ret, act)} der Aktiven heute`)}${kpi("Online-Matches", s.kpi.online, "match", C.online, col("online"))}</section>
<div class="grid">
${card("secLive", "Live", "live", `<div id="feedBox"></div>`, "wide live-card", `<span class="chip">alle 30 s</span>`)}
${card("secGrowth", "Wachstum", "growth", `<div class="growth">
  <div class="growth-main">${chart("chartActive", `Aktive Spieler ${per} · ${span}`, C.active, true)}
    <div class="duo">${chart("chartNew", `Neue Spieler ${per}`, C.new)}${chart("chartOnline", `Angepfiffene Online-Matches ${per}`, C.online)}</div></div>
  <div class="growth-side"><h3>Rückkehr neuer Spieler</h3>
    ${ring(r.d1.back, r.d1.cohort, C.new, "Am Tag 1", `${num(r.d1.back)} von ${num(r.d1.cohort)} neuen${cohort}`)}
    ${ring(r.d7.back, r.d7.cohort, C.active, "Bis Tag 7", `${num(r.d7.back)} von ${num(r.d7.cohort)} neuen${cohort}`)}</div></div>`, "wide")}
${card("secSources", "Herkunft", "source", `<div class="scroll"><table><thead><tr><th>Quelle</th><th>Neu</th><th>Gespielt</th><th>Tag 1</th></tr></thead><tbody>
  ${(s.sources || []).map(x => `<tr><td>${esc(SRC_NAMES[x.src] || x.src)}</td><td>${num(x.new)}</td><td>${num(x.played)}<span class="pc">${pct(x.played, x.new)}</span></td><td>${num(x.d1)}<span class="pc">${pct(x.d1, x.new)}</span></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Keine neuen Spieler ${inSpan}.</td></tr>`}
  </tbody></table></div>
  <p class="hint">Quelle: <code>?src=</code> aus dem Link, sonst die verweisende Seite. Neue Konten ${inSpan}.</p>`, "", `<span class="chip">${span}</span>`)}
${card("secFunnel", "Trichter", "funnel", `${steps.map(([l, v], i) => hbar(l, v, f.created, i ? `${pct(v, steps[i - 1][1])} vom Schritt davor` : "", [C.active, C.active, C.active, C.online][i])).join("")}
  <p class="hint">Neue Konten ${inSpan}. „Wieder da“ heißt: am Kalendertag nach dem Anlegen aktiv.</p>`, "", `<span class="chip">${span}</span>`)}
${card("secModes", "Modi", "modes", `${modes.length ? modes.map(m => hbar(esc(MODE_NAMES[m.mode] || m.mode), m.started || m.booked, mMax, m.started ? `${num(m.done)} beendet` : "abgerechnet", m.mode === "casual" || m.mode === "ranked" || m.mode === "friends" ? C.online : C.active)).join("") : `<p class="muted">Keine Spiele.</p>`}
  <p class="hint">Gestartete Spiele; ohne Ereignisse zählen die abgerechneten Spiele (mit Münzen).</p>`, "", `<span class="chip">${hourly ? "24 Std" : "7 Tage"}</span>`)}
${card("secOnline", "Online", "online", `<h3>Gegnersuche</h3>
  ${tiles([["Suchen", num(o.searches)], ["Gefunden", num(o.matched), pct(o.matched, o.searches)], ["Wartezeit", o.wait_median == null ? "–" : Math.round(o.wait_median) + " s", "Median"],
    ["Angepfiffen", num(o.started), `von ${num(o.pairings)} gepaart`], ["Abgebrochen", num(o.cancel)], ["Fehler", num(o.error)]])}
  <div class="split"><div><h3>Verbindung</h3>${donut([{ label: "Direkt", n: o.direct, color: C.active }, { label: "Relay", n: o.relay, color: C.relay }, { label: "Gescheitert", n: o.failed, color: C.bad }])}</div>
  <div><h3>Mit Freunden</h3>${tiles([["Lobbys", num(o.lobby_created)], ["Beigetreten", num(o.lobby_joined), pct(o.lobby_joined, o.lobby_created)], ["Angepfiffen", num(o.lobby_started)]])}
  <h3>Abbrüche</h3>${abN ? `<div class="kv">${Object.entries(ab).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span>${esc(REASONS[k] || k)}</span><span>${num(v)}</span>`).join("")}</div>` : `<p class="muted small">Keine.</p>`}</div></div>`, "", `<span class="chip">${span}</span>`)}
${card("secPush", "Benachrichtigungen", "bell", `<div id="pushBox"></div>`)}
${card("secStaff", "Weiteres Gerät ausschließen", "devices", `<p class="muted small">Eigene Testgeräte und Testkonten sollen nicht mitzählen. Der Link macht das Gerät, auf dem er geöffnet wird, zu „Staff“: es zählt in keiner Zahl hier mehr mit. Dein eigenes Konto zählt ohnehin nicht.</p>
  <button class="btn" id="staffBtn">Link erzeugen</button>
  <div id="staffBox"></div>`)}
</div>
<p class="foot">Stand ${esc(dateTime(updated.toISOString()))} · Tage und Uhrzeiten nach deutscher Zeit · ohne Admin und Staff</p>
</main></div>
<nav class="tabs" aria-label="Abschnitte">${tabs}</nav>
</div>`;
}

/** Säulen je Tag (oder je Stunde: Feld hour) in der Breite des Behälters. key: Feld in series; Antippen zeigt den Wert */
function bars(el, series, key) {
  const hourly = series.length > 0 && series[0].hour != null;
  const tip = i => (hourly ? hourLabel(series[i].hour) : dayLabel(series[i].day, true));
  const plot = el.querySelector(".plot"), read = el.querySelector(".read"), axis = el.querySelector(".axis");
  const big = el.classList.contains("big");
  const w = Math.max(220, Math.round(plot.clientWidth || el.clientWidth || 300)), h = big ? (w < 500 ? 170 : 230) : 120, top = 8;
  const vals = series.map(x => Number(x[key]) || 0), max = Math.max(1, ...vals);
  // runde Obergrenze für die Hilfslinien (ganze Zahlen, damit die Beschriftung keine Kommas braucht)
  const mag = 10 ** Math.floor(Math.log10(max)), cap = Math.max(2, Math.ceil(max / mag) * mag);
  const gut = 26, pw = w - gut;   // rechts Platz für die Achsenbeschriftung
  const n = vals.length, slot = pw / n, gap = n > 45 ? 1.5 : n > 20 ? 3 : 6, bw = Math.max(1.5, slot - gap);
  const y = v => top + (h - top) * (1 - v / cap);
  const gid = "g-" + el.id;
  let s = `<svg viewBox="0 0 ${w} ${h + 1}" width="${w}" height="${h + 1}" role="img" aria-label="${esc(el.querySelector("h3").textContent)}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="1"/><stop offset="1" stop-color="currentColor" stop-opacity=".55"/></linearGradient></defs>`;
  for (const t of [1, 0.5]) {
    const v = Math.round(cap * t), yy = y(v);
    s += `<line class="grid-line" x1="0" x2="${pw}" y1="${yy}" y2="${yy}"/><text class="ylab" x="${w}" y="${yy + 4}" text-anchor="end">${num(v)}</text>`;
  }
  vals.forEach((v, i) => {
    const x = i * slot + gap / 2, yy = y(v), r = Math.min(big ? 5 : 4, bw / 2, h - yy);
    s += `<g class="col" data-i="${i}">`;
    if (v > 0) s += `<path fill="url(#${gid})" d="M${x},${h} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${h} Z"/>`;
    s += `<rect x="${i * slot}" y="0" width="${slot}" height="${h}" fill="transparent" data-i="${i}"><title>${tip(i)}: ${v}</title></rect></g>`;
  });
  s += `<line class="base" x1="0" x2="${pw}" y1="${h + 0.5}" y2="${h + 0.5}"/></svg>`;
  plot.innerHTML = s;
  const total = vals.reduce((a, b) => a + b, 0), lastI = n - 1;
  const svg = plot.firstChild;
  const say = i => {
    const at = hourly ? (i === lastI ? `seit ${hourLabel(series[i].hour)}` : `${hourOf(series[i].hour)}–${(hourOf(series[i].hour) + 1) % 24} Uhr`) : i === lastI ? "heute" : dayLabel(series[i].day, true);
    read.innerHTML = `<b>${num(vals[i])}</b> ${at} <span>· Summe ${num(total)} · Ø ${num(Math.round((10 * total) / n) / 10)}</span>`;
    for (const g of svg.querySelectorAll(".col")) g.classList.toggle("on", Number(g.dataset.i) === i);
  };
  say(lastI);
  const pick = e => { const t = e.target.closest && e.target.closest("rect[data-i]"); if (t) say(Number(t.dataset.i)); };
  svg.addEventListener("pointermove", pick); svg.addEventListener("pointerdown", pick);
  svg.addEventListener("pointerleave", () => say(lastI));
  axis.innerHTML = hourly ? `<span>${hourLabel(series[0].hour)}</span><span>${hourLabel(series[Math.floor(n / 2)].hour)}</span><span>jetzt</span>`
    : `<span>${dayLabel(series[0].day)}</span><span>${dayLabel(series[Math.floor(n / 2)].day)}</span><span>heute</span>`;
}

export function drawCharts(root, s) {
  const ser = s.series || [];
  if (!ser.length) return;
  bars(root.querySelector("#chartActive"), ser, "active");
  bars(root.querySelector("#chartNew"), ser, "new");
  bars(root.querySelector("#chartOnline"), ser, "online");
}
