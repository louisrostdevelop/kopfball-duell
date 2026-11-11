// Browser-Speicher, der beim Zugriff nie wirft: ist localStorage gesperrt (Websitedaten blockiert, iframe), Ersatz im Arbeitsspeicher.
// Ohne das hing die App beim Start, weil schon das Lesen von globalThis.localStorage einen Fehler wirft.
let cached = null;
export function safeStorage() {
  if (cached) return cached;
  // nur lesend prüfen: ein voller Speicher ist lesbar (Spielstand und Sitzung bleiben), Schreibfehler fangen die Aufrufer ab
  try { const s = globalThis.localStorage; s.getItem("__kd_probe"); return (cached = s); }
  catch (_) {
    const m = new Map();
    return (cached = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } });
  }
}
