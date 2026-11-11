// Schnittstelle: Wo das Spielerprofil gespeichert wird.
// Umgesetzt von adapters/storage/local.js (Browser) und adapters/storage/synced.js (Browser + Server).
// Ein Server-Adapter (z. B. Supabase) muss nur diese zwei bzw. drei Funktionen anbieten.

/**
 * @typedef {Object} ProfileStore
 * @property {() => Promise<object|null> | object | null} load  Profil laden (null = neuer Spieler)
 * @property {(profile: object) => Promise<void> | void} save    Profil sichern (darf schnell und oft aufgerufen werden)
 * @property {(cb: (profile: object) => void) => void} [onRemoteChange]  optional: neueres Profil vom Server (anderes Gerät)
 */
export {};
