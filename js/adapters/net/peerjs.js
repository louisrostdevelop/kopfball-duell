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
export function close() {
  if (!cur) return; const c = cur; cur = null;
  try { c.conn && c.conn.close(); } catch (_) {}
  try { c.peer && c.peer.destroy(); } catch (_) {}
}
export function send(m) { if (cur && cur.conn && cur.conn.open) try { cur.conn.send(m); } catch (_) {} }
export function isOpen() { return !!(cur && cur.conn && cur.conn.open); }
export function role() { return cur ? cur.role : null; }

export function host(h, tries = 0) {
  close();
  const code = mkCode();
  const peer = new window.Peer(PREFIX + code, { config: ICE, debug: 0 });
  const me = { peer, role: "host", code, conn: null };
  cur = me;
  peer.on("open", () => { if (cur === me) h.onReady && h.onReady(code); });
  peer.on("connection", conn => {
    if (cur !== me) { conn.close(); return; }
    if (me.conn && me.conn.open) { conn.on("open", () => { try { conn.send({ t: "full" }); } catch (_) {} setTimeout(() => conn.close(), 500); }); return; }
    me.conn = conn;
    conn.on("open", () => { if (cur === me && me.conn === conn) h.onConn && h.onConn(); });
    conn.on("data", d => { if (cur === me && me.conn === conn && d) h.onData && h.onData(d); });
    conn.on("close", () => { if (cur === me && me.conn === conn) { me.conn = null; h.onClose && h.onClose(); } });
  });
  peer.on("disconnected", () => { if (cur === me && !peer.destroyed) try { peer.reconnect(); } catch (_) {} });
  peer.on("error", e => {
    if (cur !== me) return;
    if (e.type === "unavailable-id" && tries < 3) { host(h, tries + 1); return; }
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
    conn.on("open", () => { if (cur !== me) return; me.ok = true; h.onConn && h.onConn(); });
    conn.on("data", d => { if (cur === me && d) h.onData && h.onData(d); });
    conn.on("close", () => { if (cur === me) h.onClose && h.onClose(); });
  });
  peer.on("error", e => { if (cur !== me) return; h.onError && h.onError(e.type, me.ok); });
  setTimeout(() => { if (cur === me && !me.ok) h.onError && h.onError("timeout", false); }, 15000);
}
