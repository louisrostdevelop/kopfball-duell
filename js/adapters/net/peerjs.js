// Online über PeerJS (WebRTC, direkt Browser zu Browser)
const PREFIX = "kopfball-duell-v2-";
const CH = "abcdefghjkmnpqrstuvwxyz23456789";
// STUN zum Finden der eigenen Adresse, TURN (PeerJS-Relay) für Netze, in denen keine direkte Verbindung klappt
const ICE = { iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
] };
export const mkCode = () => Array.from({ length: 4 }, () => CH[Math.floor(Math.random() * CH.length)]).join("");
export const available = () => !!window.Peer;

let cur = null;
// Schneller Kanal für Zustände und Eingaben: ungeordnet, ohne Wiederholung (ein verlorenes Paket hält nichts auf,
// das nächste ist eh aktueller). Beide Seiten legen ihn gleich an (negotiated), PeerJS bekommt davon nichts mit.
const FAST = { negotiated: true, id: 77, ordered: false, maxRetransmits: 0 };
function openFast(me, conn, h) {
  try {
    const pc = conn.peerConnection; if (!pc || !pc.createDataChannel) return;
    const ch = pc.createDataChannel("fast", FAST);
    ch.onmessage = e => { if (cur !== me) return; let d; try { d = JSON.parse(e.data); } catch (_) { return; } if (d && h.onData) h.onData(d); };
    me.fast = ch;
  } catch (_) { me.fast = null; }
}
export function close() {
  if (!cur) return; const c = cur; cur = null;
  try { c.fast && c.fast.close(); } catch (_) {}
  try { c.conn && c.conn.close(); } catch (_) {}
  try { c.peer && c.peer.destroy(); } catch (_) {}
}
export function send(m) { if (cur && cur.conn && cur.conn.open) try { cur.conn.send(m); } catch (_) {} }
/** Für Zustände und Eingaben: schneller Kanal, falls offen, sonst der normale. Bei Stau lieber auslassen. */
export function sendFast(m) {
  const f = cur && cur.fast;
  if (f && f.readyState === "open") { if (!(f.bufferedAmount > 65536)) try { f.send(JSON.stringify(m)); } catch (_) {} return; }
  send(m);
}
export function isOpen() { return !!(cur && cur.conn && cur.conn.open); }
export function role() { return cur ? cur.role : null; }

// opts.code: fester Raumname (Matchmaking: aus der Spiel-ID), sonst zufällig
export function host(h, { code: fixed = null, tries = 0 } = {}) {
  close();
  const code = fixed || mkCode();
  const peer = new window.Peer(PREFIX + code, { config: ICE, debug: 0 });
  const me = { peer, role: "host", code, conn: null };
  cur = me;
  peer.on("open", () => { if (cur === me) h.onReady && h.onReady(code); });
  peer.on("connection", conn => {
    if (cur !== me) { conn.close(); return; }
    if (me.conn && me.conn.open) { conn.on("open", () => { try { conn.send({ t: "full" }); } catch (_) {} setTimeout(() => conn.close(), 500); }); return; }
    me.conn = conn;
    conn.on("open", () => { if (cur === me && me.conn === conn) { openFast(me, conn, h); if (h.onConn) h.onConn(); } });
    conn.on("data", d => { if (cur === me && me.conn === conn && d) h.onData && h.onData(d); });
    conn.on("close", () => { if (cur === me && me.conn === conn) { me.conn = null; try { if (me.fast) me.fast.close(); } catch (_) {} me.fast = null; if (h.onClose) h.onClose(); } });
  });
  peer.on("disconnected", () => { if (cur === me && !peer.destroyed) try { peer.reconnect(); } catch (_) {} });
  peer.on("error", e => {
    if (cur !== me) return;
    if (e.type === "unavailable-id" && tries < 3) { if (fixed) setTimeout(() => host(h, { code: fixed, tries: tries + 1 }), 1500); else host(h, { tries: tries + 1 }); return; }
    if (me.conn && me.conn.open) return;
    h.onError && h.onError(e.type);
  });
  return code;
}

export function join(code, h) {
  close();
  const peer = new window.Peer({ config: ICE, debug: 0 });
  const me = { peer, role: "guest", code, conn: null, ok: false };
  cur = me;
  peer.on("open", () => {
    if (cur !== me) return;
    const conn = peer.connect(PREFIX + code.toLowerCase(), { serialization: "json", reliable: true });
    me.conn = conn;
    conn.on("open", () => { if (cur !== me) return; me.ok = true; openFast(me, conn, h); if (h.onConn) h.onConn(); });
    conn.on("data", d => { if (cur === me && d) h.onData && h.onData(d); });
    conn.on("close", () => { if (cur === me) h.onClose && h.onClose(); });
  });
  peer.on("error", e => { if (cur !== me) return; h.onError && h.onError(e.type, me.ok); });
  setTimeout(() => { if (cur === me && !me.ok) h.onError && h.onError("timeout", false); }, 15000);
}
