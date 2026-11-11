// Admin-Dashboard: Kacheln, Abschnitte und Diagramme (SVG ohne Bibliothek, die CSP lässt nur eigene Skripte zu).
// Diagramme werden mit der echten Breite gezeichnet (Schrift bleibt auf dem Handy lesbar) und beim Drehen neu.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const num = n => (Number(n) || 0).toLocaleString("de-DE");
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) + " %" : "–");
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const dayLabel = (iso, wd = false) => { const [y, m, d] = String(iso).split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return (wd ? WD[dt.getUTCDay()] + " " : "") + d + "." + m + "."; };
const dateTime = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) + ", " + d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }); };

export const MODE_NAMES = { cpu: "Gegen Computer", cup: "Cup", career: "Karriere", endless: "Endlos", daily: "Tages-Challenge", training: "Training",
  local: "Zu zweit", friends: "Mit Freunden", casual: "Casual", ranked: "Ranked", other: "Sonstige" };
const SRC_NAMES = { direct: "Direkt", invite: "Einladungslink", other: "Andere Seite", unknown: "Unbekannt (vor der Erfassung)", x: "X / Twitter" };
const REASONS = { dropped: "Eigene Verbindung weg", opp_gone: "Gegner weg", void: "Start ungültig", desync: "Nicht synchron" };

function kpi(label, [today, yest]) {
  const d = today - yest, cls = d > 0 ? "up" : d < 0 ? "down" : "";
  return `<div class="kpi"><div class="lab">${label}</div><div class="val">${num(today)}</div>
    <div class="cmp">gestern ${num(yest)} <span class="${cls}">${d > 0 ? "+" : d < 0 ? "−" : "±"}${num(Math.abs(d))}</span></div></div>`;
}
const chart = (id, title) => `<h3>${title}</h3><div class="chart" id="${id}"><div class="read" aria-live="polite"></div><div class="plot"></div><div class="axis"></div></div>`;
function hbar(label, v, max, sub = "", color = "var(--s1)") {
  return `<div class="hbar"><span>${label}</span><span class="track"><span class="fill" style="width:${max > 0 ? Math.max(1, (100 * v) / max) : 0}%;background:${color}"></span></span><span class="num">${num(v)}${sub ? `<small>${sub}</small>` : ""}</span></div>`;
}
function stack(parts) {
  const sum = parts.reduce((a, p) => a + p.n, 0);
  return `<div class="stack" role="img" aria-label="${esc(parts.map(p => p.label + " " + p.n).join(", "))}">${sum ? parts.filter(p => p.n).map(p => `<span style="flex:${p.n};background:${p.color}"></span>`).join("") : ""}</div>
    <div class="legend">${parts.map(p => `<span><i style="background:${p.color}"></i>${p.label} <b>${num(p.n)}</b> ${pct(p.n, sum)}</span>`).join("")}</div>`;
}
const kv = rows => `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>`;

/** Ganze Seite als HTML; Diagramme danach mit drawCharts */
export function dashboard(s) {
  const since = s.since ? new Date(s.since) : null, from = new Date(s.from + "T00:00:00");
  const late = !since || since > from;
  const sinceNote = !since ? "Noch keine Ereignisse erfasst: Herkunft, Modi und Online-Details erscheinen, sobald gespielt wird."
    : late ? `Ereignisse (Herkunft, Spielstarts, Suche, Verbindung) gibt es erst seit ${esc(dateTime(s.since))}. Davor zählen nur Konten, Buchungen und Online-Spiele.` : "";
  const r = s.retention, f = s.funnel, o = s.online;
  const steps = [["Konten angelegt", f.created], ["Erstes Spiel begonnen", f.started], ["Erstes Spiel beendet", f.finished], ["Am nächsten Tag wieder da", f.returned]];
  const modes = s.modes || [], mMax = Math.max(1, ...modes.map(m => Math.max(m.started, m.booked)));
  const ab = o.aborts || {}, abN = Object.values(ab).reduce((a, b) => a + b, 0);
  return `${sinceNote ? `<p class="note">${sinceNote}</p>` : ""}
<section class="kpis" aria-label="Heute">
  ${kpi("Aktive heute", s.kpi.active)}${kpi("Neue Spieler", s.kpi.new)}${kpi("Wiederkehrer", s.kpi.returning)}${kpi("Online-Matches", s.kpi.online)}
</section>
<div class="grid">
<section class="card wide" id="secGrowth"><h2>Wachstum</h2>
  ${chart("chartActive", `Aktive Spieler pro Tag (${s.days} Tage)`)}
  ${chart("chartNew", "Neue Spieler pro Tag")}
  ${chart("chartOnline", "Angepfiffene Online-Matches pro Tag")}
  <div class="pair">
    <div class="stat"><div class="lab">Rückkehr Tag 1</div><div class="val">${pct(r.d1.back, r.d1.cohort)}</div><div class="lab">${num(r.d1.back)} von ${num(r.d1.cohort)} neuen</div></div>
    <div class="stat"><div class="lab">Rückkehr bis Tag 7</div><div class="val">${pct(r.d7.back, r.d7.cohort)}</div><div class="lab">${num(r.d7.back)} von ${num(r.d7.cohort)} neuen</div></div>
  </div>
</section>
<section class="card" id="secSources"><h2>Herkunft</h2>
  <div class="scroll"><table><thead><tr><th>Quelle</th><th>Neu</th><th>Gespielt</th><th>Tag 1</th></tr></thead><tbody>
  ${(s.sources || []).map(x => `<tr><td>${esc(SRC_NAMES[x.src] || x.src)}</td><td>${num(x.new)}</td><td>${num(x.played)}<span class="pc">${pct(x.played, x.new)}</span></td><td>${num(x.d1)}<span class="pc">${pct(x.d1, x.new)}</span></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Keine neuen Spieler im Zeitraum.</td></tr>`}
  </tbody></table></div>
  <p class="muted small">Quelle: <code>?src=</code> aus dem Link, sonst die verweisende Seite. Neue Konten im Zeitraum.</p>
</section>
<section class="card" id="secFunnel"><h2>Trichter</h2>
  ${steps.map(([l, v], i) => hbar(l, v, f.created, i ? `${pct(v, steps[i - 1][1])} vom Schritt davor` : "", ["var(--s1)", "var(--s1)", "var(--s1)", "var(--s3)"][i])).join("")}
  <p class="muted small">Neue Konten im Zeitraum. „Wieder da“ heißt: am Kalendertag nach dem Anlegen aktiv.</p>
</section>
<section class="card" id="secModes"><h2>Modi (7 Tage)</h2>
  ${modes.length ? modes.map(m => hbar(esc(MODE_NAMES[m.mode] || m.mode), m.started || m.booked, mMax, m.started ? `${num(m.done)} beendet` : "abgerechnet")).join("") : `<p class="muted">Keine Spiele.</p>`}
  <p class="muted small">Gestartete Spiele; ohne Ereignisse zählen die abgerechneten Spiele (mit Münzen).</p>
</section>
<section class="card" id="secOnline"><h2>Online</h2>
  <h3>Gegnersuche</h3>
  ${kv([["Suchen gestartet", num(o.searches)], ["Gegner gefunden", `${num(o.matched)} (${pct(o.matched, o.searches)})`], ["Abgebrochen", num(o.cancel)], ["Fehler", num(o.error)],
    ["Wartezeit (Median)", o.wait_median == null ? "–" : Math.round(o.wait_median) + " s"], ["Gepaart → angepfiffen", `${num(o.pairings)} → ${num(o.started)} (${pct(o.started, o.pairings)})`]])}
  <h3>Verbindung</h3>
  ${stack([{ label: "Direkt", n: o.direct, color: "var(--s1)" }, { label: "Relay", n: o.relay, color: "var(--s2)" }, { label: "Gescheitert", n: o.failed, color: "var(--bad)" }])}
  <h3>Mit Freunden</h3>
  ${kv([["Lobbys geöffnet", num(o.lobby_created)], ["Beigetreten", `${num(o.lobby_joined)} (${pct(o.lobby_joined, o.lobby_created)})`], ["Angepfiffen", num(o.lobby_started)]])}
  <h3>Abbrüche</h3>
  ${abN ? kv(Object.entries(ab).sort((a, b) => b[1] - a[1]).map(([k, v]) => [esc(REASONS[k] || k), num(v)])) : `<p class="muted small">Keine.</p>`}
</section>
<section class="card" id="secStaff"><h2>Weiteres Gerät ausschließen</h2>
  <p class="muted small">Eigene Testgeräte und Testkonten sollen nicht mitzählen. Der Link macht das Gerät, auf dem er geöffnet wird, zu „Staff“: es zählt in keiner Zahl hier mehr mit. Dein eigenes Konto zählt ohnehin nicht.</p>
  <button class="btn ghost" id="staffBtn">Link erzeugen</button>
  <div id="staffBox"></div>
</section>
</div>
<p class="muted small center">Stand ${esc(dateTime(new Date().toISOString()))} · Tage nach deutscher Zeit · ohne Admin und Staff</p>`;
}

/** Säulen je Tag in der Breite des Behälters. key: Feld in series; Antippen zeigt den Wert */
function bars(el, series, key, color) {
  const plot = el.querySelector(".plot"), read = el.querySelector(".read"), axis = el.querySelector(".axis");
  const w = Math.max(240, Math.round(plot.clientWidth || el.clientWidth || 300)), h = 120, top = 14, left = 0;
  const vals = series.map(x => Number(x[key]) || 0), max = Math.max(1, ...vals);
  // runde Obergrenze für die Hilfslinie
  const mag = 10 ** Math.floor(Math.log10(max)), cap = Math.ceil(max / mag) * mag;
  const n = vals.length, slot = (w - left) / n, gap = n > 45 ? 1 : 2, bw = Math.max(1, slot - gap);
  const y = v => top + (h - top) * (1 - v / cap);
  let s = `<svg viewBox="0 0 ${w} ${h + 1}" width="${w}" height="${h + 1}" role="img" aria-label="${esc(el.previousElementSibling ? el.previousElementSibling.textContent : key)}">`;
  s += `<line class="grid-line" x1="0" x2="${w}" y1="${top}" y2="${top}"/><text class="ylab" x="2" y="${top - 3}">${num(cap)}</text>`;
  vals.forEach((v, i) => {
    const x = left + i * slot, yy = y(v), r = Math.min(4, bw / 2, (h - yy) / 1);
    if (v > 0) s += `<path fill="${color}" d="M${x},${h} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${h} Z"/>`;
    s += `<rect x="${x}" y="0" width="${slot}" height="${h}" fill="transparent" data-i="${i}"><title>${dayLabel(series[i].day, true)}: ${v}</title></rect>`;
  });
  s += `<line class="base" x1="0" x2="${w}" y1="${h + 0.5}" y2="${h + 0.5}"/></svg>`;
  plot.innerHTML = s;
  const total = vals.reduce((a, b) => a + b, 0), lastI = n - 1;
  const say = i => { read.innerHTML = `${dayLabel(series[i].day, true)}: <b>${num(vals[i])}</b> · Summe ${num(total)} · Schnitt ${num(Math.round((10 * total) / n) / 10)}`; };
  say(lastI);
  const svg = plot.firstChild;
  const pick = e => { const t = e.target.closest && e.target.closest("rect[data-i]"); if (t) say(Number(t.dataset.i)); };
  svg.addEventListener("pointermove", pick); svg.addEventListener("pointerdown", pick);
  svg.addEventListener("pointerleave", () => say(lastI));
  axis.innerHTML = `<span>${dayLabel(series[0].day)}</span><span>${dayLabel(series[Math.floor(n / 2)].day)}</span><span>heute</span>`;
}

export function drawCharts(root, s) {
  const ser = s.series || [];
  if (!ser.length) return;
  bars(root.querySelector("#chartActive"), ser, "active", "var(--s1)");
  bars(root.querySelector("#chartNew"), ser, "new", "var(--s2)");
  bars(root.querySelector("#chartOnline"), ser, "online", "var(--s3)");
}
