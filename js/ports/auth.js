// Schnittstelle: Wer spielt? Heute ein lokaler Gast mit fester ID, später ein Konto (z. B. Supabase Auth).

/**
 * @typedef {Object} User
 * @property {string} id         dauerhafte ID (bleibt beim Verknüpfen mit einem Konto gleich)
 * @property {boolean} guest     true = noch kein Konto
 * @property {string} [email]
 */
/**
 * @typedef {Object} AuthProvider
 * @property {() => Promise<User>} init                 beim Start: vorhandene Sitzung oder neuer Gast
 * @property {() => User|null} user                     aktueller Spieler
 * @property {(cb: (user: User|null) => void) => void} onChange
 * @property {(opts: object) => Promise<User>} [upgrade] optional: Gast mit Konto verknüpfen (E-Mail, Google, …)
 * @property {() => Promise<void>} [signOut]
 */
export {};
