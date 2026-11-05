// Profil lokal UND auf einem Server: sofort lokal laden, danach mit dem Server abgleichen.
// Wer neuer ist (updatedAt), gewinnt. Speichern geht sofort lokal und gesammelt (alle paar Sekunden) zum Server.
// remote ist ein beliebiger ProfileStore, z. B. später ein Supabase-Adapter.

/**
 * @param {import("../../ports/storage.js").ProfileStore} local
 * @param {import("../../ports/storage.js").ProfileStore} remote
 * @param {{ delay?: number }} [opts]
 * @returns {import("../../ports/storage.js").ProfileStore}
 */
export function syncedProfileStore(local, remote, { delay = 2500 } = {}) {
  let timer = null, pending = null, listener = null;
  const push = async () => { timer = null; const p = pending; pending = null; if (p) try { await remote.save(p); } catch (_) { pending = pending || p; } };
  return {
    async load() {
      const mine = await local.load();
      // Server im Hintergrund fragen, Start nicht blockieren
      Promise.resolve().then(() => remote.load()).then(theirs => {
        if (theirs && (!mine || (theirs.updatedAt || 0) > (mine.updatedAt || 0))) { local.save(theirs); if (listener) listener(theirs); }
        else if (mine) remote.save(mine);
      }).catch(() => {});
      return mine;
    },
    save(p) {
      local.save(p);
      pending = JSON.parse(JSON.stringify(p));
      if (!timer) timer = setTimeout(push, delay);
    },
    onRemoteChange(cb) { listener = cb; },
    flush: push,
  };
}
