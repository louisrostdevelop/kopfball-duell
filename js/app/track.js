// Nutzungsstatistik: kleine Ereignisse an den Server (api.track). Nur mit Server,
// nur mit Netz, ohne Warten und ohne Fehler: die Statistik darf das Spiel nie aufhalten.
import { has, net as Net, server } from "./services.js";
import { reachable } from "./account.js";
import { App } from "./state.js";

export function track(kind, data = {}) {
  try {
    if (!has("server") || !server.track || !reachable()) return;
    server.track(kind, data).catch(() => {});
  } catch (_) { /* Statistik ist nie wichtiger als das Spiel */ }
}

// Spielmodus für die Statistik (wie api.track ihn kennt); online aus der Gegnersuche oder unter Freunden
const MODE = { cpu: "cpu", cup: "cup", career: "career", endless: "endless", daily: "daily", train: "training", local: "local" };
export const statMode = (mode = App.mode) => (mode === "host" || mode === "guest" ? (App.mm ? App.mm.mode : "friends") : MODE[mode] || "other");

let open = null;   // Modus des laufenden Spiels, bis match_end gemeldet ist
/**
 * Spiel beginnt. resume: nach Wiederverbinden oder Neustart dasselbe Spiel, zählt nicht neu (nach einem App-Neustart
 * fehlt dann auch das Ende, so bleiben beendete nie mehr als begonnene)
 */
export function matchStarted(mode, resume = false) {
  if (resume) return;
  if (open) matchEnded(false);   // ohne Abpfiff neu begonnen (Neustart, Revanche nach Abbruch)
  open = statMode(mode);
  track("match_start", { mode: open });
}
/** done: regulär abgepfiffen; false: vorher verlassen */
export function matchEnded(done) {
  if (!open) return;
  track("match_end", { mode: open, done: !!done });
  open = null;
}

/**
 * Einmal je Konto und Gerät: Herkunft. Dazu einmal je Tag „visit“ (der Server zählt nur den ersten).
 * href: Adresse beim Start (main.js räumt ?join= danach weg)
 */
export function firstVisit(userId, href = location.href) {
  if (!userId) return;
  const key = "kopfball-duell-fv-" + userId;
  let seen = true;
  try { seen = !!localStorage.getItem(key); if (!seen) localStorage.setItem(key, "1"); } catch (_) { /* ohne Speicher: lieber gar nicht als bei jedem Start */ }
  if (!seen) { let u = null; try { u = new URL(href); } catch (_) { u = location; } track("first_visit", origin(u)); }
  track("visit");
}

const HOSTS = [["reddit", /(^|\.)reddit\.com$|^redd\.it$/], ["google", /(^|\.)google\.[a-z.]+$/], ["bing", /(^|\.)bing\.com$/],
  ["duckduckgo", /(^|\.)duckduckgo\.com$/], ["youtube", /(^|\.)youtube\.com$|^youtu\.be$/], ["tiktok", /(^|\.)tiktok\.com$/],
  ["instagram", /(^|\.)instagram\.com$/], ["facebook", /(^|\.)facebook\.com$|^fb\.me$|(^|\.)messenger\.com$/],
  ["x", /^(www\.|mobile\.)?(x|twitter)\.com$|^t\.co$/], ["discord", /(^|\.)discord(app)?\.(com|gg)$/]];
/** Herkunft: ?src= aus dem Link (nur einfache Kennungen), sonst grob aus der verweisenden Seite; nie die Adresse selbst */
export function origin(loc = location, referrer = document.referrer) {
  const q = new URLSearchParams(loc.search), src = (q.get("src") || "").toLowerCase();
  let ref = "direct";
  if (q.get("join") || /^#[A-Za-z0-9]{4}$/.test(loc.hash || "")) ref = "invite";
  else if (referrer) {
    let host = "";
    try { host = new URL(referrer).hostname.toLowerCase(); } catch (_) { /* kaputt: wie andere */ }
    if (host && host !== loc.hostname) ref = (HOSTS.find(([, re]) => re.test(host)) || ["other"])[0];
  }
  return /^[a-z0-9_-]{1,40}$/.test(src) ? { src, ref } : { ref };
}

/** Online-Verbindung steht: Weg melden (direkt oder über das Relay); unbekannt = nichts */
export function netOpened(mode) {
  try {
    if (!Net.path) return;
    // kurz warten: direkt nach dem Öffnen ist das Kandidatenpaar manchmal noch nicht gewählt
    setTimeout(() => { Net.path().then(p => { if (p) track("net_result", { mode, path: p }); }).catch(() => {}); }, 1500);
  } catch (_) { /* ohne Statistik weiter */ }
}
export const netFailed = mode => track("net_result", { mode, path: "failed" });
