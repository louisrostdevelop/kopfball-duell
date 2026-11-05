// Ersatz für PeerJS im Test: verbindet zwei Tabs über BroadcastChannel (mit 20-40 ms künstlicher Verzögerung)
(() => {
  const bc = new BroadcastChannel("mockpeer");
  const peers = {};
  class Emitter { constructor() { this.h = {}; } on(e, f) { (this.h[e] = this.h[e] || []).push(f); } emit(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); } }
  class Conn extends Emitter {
    constructor(peer, cid, remote) { super(); this.peer = peer; this.cid = cid; this.remote = remote; this.open = false; }
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
    } else {
      const p = peers[m.to]; if (!p) return;
      const c = p.conns[m.cid]; if (!c) return;
      if (m.type === "accept") { clearTimeout(p._pending); c.open = true; c.emit("open"); }
      if (m.type === "data" && c.open) setTimeout(() => c.emit("data", m.payload), 20 + Math.random() * 20);
      if (m.type === "close" && c.open) { c.open = false; c.emit("close"); }
    }
  };
  window.Peer = Peer;
})();
