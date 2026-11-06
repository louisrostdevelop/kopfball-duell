// Ersatz für PeerJS im Test: verbindet zwei Tabs über BroadcastChannel und spielt ein Netz nach.
// window.__mockNet = { lat, jit, loss } (Standard: 30 ms, ±10 ms, 0 % Verlust), auf der Empfängerseite angewendet:
//  - Verbindung (conn.send): zuverlässig und geordnet wie bei WebRTC. Ein verlorenes Paket wird nach ~1,5 RTT
//    wiederholt, alle späteren warten so lange (Head-of-Line-Blocking).
//  - Schneller Kanal (conn.peerConnection.createDataChannel mit negotiated: true): ungeordnet, Verluste bleiben weg.
// window.__mockBytes zählt die empfangenen Bytes (nach JSON) je Kanal.
(() => {
  const bc = new BroadcastChannel("mockpeer");
  const peers = {};
  const net = () => ({ lat: 30, jit: 10, loss: 0, ...(window.__mockNet || {}) });
  const bytes = window.__mockBytes = { conn: 0, fast: 0 };
  const delay = n => n.lat + Math.random() * n.jit * 2 - n.jit * 0.5;
  class Emitter { constructor() { this.h = {}; } on(e, f) { (this.h[e] = this.h[e] || []).push(f); } emit(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); } }
  class FastChannel {
    constructor(conn, id) { this.conn = conn; this.id = id; this.readyState = "connecting"; this.onmessage = null; this.onopen = null; setTimeout(() => { this.readyState = "open"; if (this.onopen) this.onopen(); }, 20); }
    send(s) { if (this.readyState === "open") bc.postMessage({ type: "fast", cid: this.conn.cid, to: this.conn.remote, id: this.id, payload: s }); }
    close() { this.readyState = "closed"; }
  }
  class Conn extends Emitter {
    constructor(peer, cid, remote) {
      super(); this.peer = peer; this.cid = cid; this.remote = remote; this.open = false; this.lastArr = 0; this.fast = {};
      this.peerConnection = { createDataChannel: (label, o) => (this.fast[o.id] = new FastChannel(this, o.id)) };
    }
    send(d) { if (this.open) bc.postMessage({ type: "data", cid: this.cid, to: this.remote, payload: JSON.parse(JSON.stringify(d)) }); }
    close() { if (!this.open) return; this.open = false; bc.postMessage({ type: "close", cid: this.cid, to: this.remote }); this.emit("close"); }
  }
  class Peer extends Emitter {
    constructor(id) {
      super();
      if (typeof id !== "string") id = "anon-" + Math.random().toString(36).slice(2, 8);
      this.id = id; this.destroyed = false; this.conns = {};
      peers[id] = this;
      setTimeout(() => this.emit("open", id), 50);
    }
    connect(to) {
      const cid = Math.random().toString(36).slice(2);
      const c = new Conn(this, cid, to); this.conns[cid] = c;
      bc.postMessage({ type: "connect", from: this.id, to, cid });
      this._pending = setTimeout(() => this.emit("error", { type: "peer-unavailable" }), 1500);
      return c;
    }
    destroy() { this.destroyed = true; Object.values(this.conns).forEach(c => c.close()); delete peers[this.id]; }
    reconnect() {}
  }
  bc.onmessage = ({ data: m }) => {
    if (m.type === "connect") {
      const p = peers[m.to]; if (!p || p.destroyed) return;
      const c = new Conn(p, m.cid, m.from); p.conns[m.cid] = c;
      p.emit("connection", c);
      setTimeout(() => { c.open = true; c.emit("open"); bc.postMessage({ type: "accept", cid: m.cid, to: m.from }); }, 30);
      return;
    }
    const p = peers[m.to]; if (!p) return;
    const c = p.conns[m.cid]; if (!c) return;
    const n = net(), now = performance.now();
    if (m.type === "accept") { clearTimeout(p._pending); c.open = true; c.emit("open"); }
    if (m.type === "data" && c.open) {
      // geordnet: nie vor dem vorigen; bei Verlust Wiederholung nach ~1,5 RTT
      const arr = Math.max(c.lastArr, now + delay(n) + (Math.random() < n.loss ? 3 * n.lat + 20 : 0));
      c.lastArr = arr; bytes.conn += JSON.stringify(m.payload).length;
      setTimeout(() => { if (c.open) c.emit("data", m.payload); }, arr - now);
    }
    if (m.type === "fast" && c.open) {
      const ch = c.fast[m.id]; if (!ch || Math.random() < n.loss) return;
      bytes.fast += m.payload.length;
      setTimeout(() => { if (ch.readyState === "open" && ch.onmessage) ch.onmessage({ data: m.payload }); }, delay(n));
    }
    if (m.type === "close" && c.open) { c.open = false; c.emit("close"); }
  };
  // Test: Netz reißt ab (alle Verbindungen dieses Tabs schließen, die Peers bleiben)
  window.__mockDrop = () => Object.values(peers).forEach(p => Object.values(p.conns).forEach(c => c.close()));
  window.Peer = Peer;
})();
