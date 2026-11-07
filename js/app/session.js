// Online-Sitzung über einen App-Neustart retten (App aus Versehen geschlossen, Tab neu geladen, Handy hat die App beendet).
// Jede Seite (Host, Gast) merkt sich Raum, Rolle, Merker und – der Host – den vollen Spielstand im Gerätespeicher.
// Beim Start prüft resumable(), ob zurückverbunden wird. Je Rolle ein eigener Eintrag: zwei Tabs im selben Browser
// (Host und Gast, z. B. beim Testen) überschreiben sich nicht.
//
// Lebt der Tab, dem die Sitzung gehört, noch (z. B. nur im Hintergrund), darf ein neuer Tab sie nicht übernehmen.
// Das zeigt eine Web-Sperre (navigator.locks): der Besitzer hält sie, der Browser gibt sie frei, sobald der Tab weg ist.
// Ohne Web-Sperren gilt ersatzweise: frisch aufgefrischt und nicht „schließend“ = lebt.
import { VERSION } from "./state.js";

const KEY = role => "headstars-net-" + role;
/** Wie lange nach dem Schließen zurückverbunden wird: laufendes Spiel (die andere Seite wartet RECONNECT_MS) / Lobby */
export const RESUME_GAME_MS = 40000, RESUME_LOBBY_MS = 120000;
/** Ersatzregel ohne Web-Sperren: ein Tab, der seine Sitzung jünger als das hier aufgefrischt hat, lebt noch */
export const ALIVE_MS = 3000;

const store = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };
const read = role => { try { const s = store(), v = s && s.getItem(KEY(role)); return v ? JSON.parse(v) : null; } catch (_) { return null; } };
const write = (role, v) => { try { const s = store(); if (s) s.setItem(KEY(role), JSON.stringify(v)); } catch (_) {} };
const remove = role => { try { const s = store(); if (s) s.removeItem(KEY(role)); } catch (_) {} };
const locks = () => { try { return (globalThis.navigator && globalThis.navigator.locks) || null; } catch (_) { return null; } };

let mine = null;   // Rolle der Sitzung dieses Tabs (host | guest)
let held = null;   // { role, free } – gehaltene Web-Sperre

function hold(role) {
  if (held && held.role === role) return;
  letGo();
  const L = locks(); if (!L) return;
  let free = () => {};
  const until = new Promise(r => { free = r; });
  const me = held = { role, free, granted: false };
  L.request(KEY(role), () => { me.granted = true; return until; }).catch(() => {});
}
function letGo() { if (held) { held.free(); held = null; } }

/** Sitzung anlegen oder ergänzen. data: { phase: "lobby"|"play", code, ... } */
export function saveSession(role, data) {
  const old = mine === role ? read(role) || {} : {};
  mine = role; hold(role);
  write(role, { ...old, ...data, role, v: VERSION, t: Date.now(), closing: false });
}
/** Lebenszeichen (jede Sekunde und beim Verstecken der Seite), beim Host mit Spielstand */
export function touchSession(extra) { if (mine) { const s = read(mine); if (s) write(mine, { ...s, ...extra, t: Date.now(), closing: false }); } }
/** Seite wird geschlossen: Zeitpunkt festhalten, als „schließend“ markieren (sonst sähe ein schneller Neustart einen lebenden Tab) */
export function markClosing(extra) { if (mine) { const s = read(mine); if (s) write(mine, { ...s, ...extra, t: Date.now(), closing: true }); } }
export function clearSession() { if (mine) remove(mine); mine = null; letGo(); }
export const sessionRole = () => mine;

/**
 * Darf diese Sitzung beim Start fortgesetzt werden? Gibt einen Grund zurück, warum nicht (für Tests und Meldungen).
 * alive: weiß der Aufrufer (Web-Sperre), ob der Besitzer-Tab noch lebt; sonst Ersatzregel über Zeitstempel.
 * @returns {{ ok: true } | { ok: false, why: "none"|"version"|"alive"|"expired"|"broken" }}
 */
export function resumable(s, now, { version = VERSION, alive } = {}) {
  if (!s || !s.role || !s.code) return { ok: false, why: "none" };
  if (s.v !== version) return { ok: false, why: "version" };
  const age = now - (s.t || 0);
  if (alive === true || (alive === undefined && !s.closing && age < ALIVE_MS)) return { ok: false, why: "alive" };
  if (age > (s.phase === "play" ? RESUME_GAME_MS : RESUME_LOBBY_MS) || age < 0) return { ok: false, why: "expired" };
  if (s.phase === "play" && (!s.mid || (s.role === "host" && (!s.st || !s.cfg || !s.guestCfg || !s.opp)))) return { ok: false, why: "broken" };
  return { ok: true };
}

/** Welche Sitzungs-Sperren halten andere Tabs gerade? null = Browser kann das nicht (Ersatzregel) */
async function heldByOthers() {
  const L = locks(); if (!L || !L.query) return null;
  try {
    const q = await L.query(), own = held && held.granted ? KEY(held.role) : null;
    return new Set((q.held || []).map(l => l.name).filter(n => n !== own));
  } catch (_) { return null; }
}

/** Beim Start: erste fortsetzbare Sitzung (Spiel vor Lobby). Abgelaufene oder kaputte werden aufgeräumt. */
export async function takeResumable(now = Date.now()) {
  const others = await heldByOthers();
  const found = [];
  for (const role of ["host", "guest"]) {
    const s = read(role), r = resumable(s, now, { alive: others ? others.has(KEY(role)) : undefined });
    if (r.ok) found.push(s);
    else if (s && r.why !== "alive") remove(role);
  }
  found.sort((a, b) => (a.phase === "play" ? 0 : 1) - (b.phase === "play" ? 0 : 1));
  const s = found[0] || null;
  if (s) { mine = s.role; hold(s.role); }
  return s;
}
