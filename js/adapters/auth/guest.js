// Lokaler Gast: feste zufällige ID im Browser, kein Konto. Ein Konto-Adapter (z. B. Supabase) ersetzt das hier.
import { safeStorage } from "../storage/safe.js";
const KEY = "kopfball-duell-uid";
const newId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : "g-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

/** @returns {import("../../ports/auth.js").AuthProvider} */
export function guestAuth(storage = safeStorage()) {
  let user = null; const subs = [];
  return {
    async init() {
      let id = null;
      try { id = storage.getItem(KEY); if (!id) { id = newId(); storage.setItem(KEY, id); } } catch (_) { id = newId(); }
      user = { id, guest: true };
      subs.forEach(f => f(user));
      return user;
    },
    user: () => user,
    onChange(cb) { subs.push(cb); },
  };
}
