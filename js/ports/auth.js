// Schnittstelle: Wer spielt? Heute ein lokaler Gast mit fester ID, später ein Konto (z. B. Supabase Auth).

/**
 * @typedef {Object} User
 * @property {string} id         dauerhafte ID (bleibt beim Verknüpfen mit einem Konto gleich)
 * @property {boolean} guest     true = noch kein Konto
 * @property {string} [email]
 * @property {string} [pendingEmail]  E-Mail eingetragen, aber noch nicht bestätigt
 */
/**
 * @typedef {Object} AuthProvider
 * @property {() => Promise<User>} init                 beim Start: vorhandene Sitzung oder neuer Gast
 * @property {() => User|null} user                     aktueller Spieler
 * @property {(cb: (user: User|null) => void) => void} onChange
 * @property {(opts: { email: string }) => Promise<User>} [upgrade]   Gast sichern: Mail mit Code an diese Adresse
 * @property {(opts: { email: string, code: string }) => Promise<User>} [confirmUpgrade]   Code eingeben, Konto ist fest
 * @property {(opts: { email: string }) => Promise<void>} [sendCode]   anderes Gerät: Code an ein bestehendes Konto
 * @property {(opts: { email: string, code: string }) => Promise<User>} [signIn]   mit dem Code anmelden
 * @property {() => Promise<void>} [signOut]
 */
export {};
