// Profil im Browser-Speicher (localStorage). Bleibt auch mit Server-Anbindung der schnelle lokale Zwischenspeicher.
import { safeStorage } from "./safe.js";
export const SAVE_KEY = "kopfball-duell-save-v2";

/** @returns {import("../../ports/storage.js").ProfileStore} */
export function localProfileStore(key = SAVE_KEY, storage = safeStorage()) {
  return {
    load() { try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } },
    save(p) { try { storage.setItem(key, JSON.stringify(p)); } catch (_) {} },
  };
}
