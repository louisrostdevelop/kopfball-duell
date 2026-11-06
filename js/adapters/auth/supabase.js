// Konto über Supabase Auth: beim ersten Start ein Gast-Konto auf dem Server (anonym), später mit E-Mail verknüpfbar.
// Die ID bleibt beim Verknüpfen gleich, der Spielstand auch.
/** @returns {import("../../ports/auth.js").AuthProvider} */
export function supabaseAuth(client) {
  const toUser = u => u && { id: u.id, guest: !!u.is_anonymous || !u.email, email: u.email || undefined, pendingEmail: u.new_email || undefined };
  let user = toUser(client.user()); const subs = [];
  const back = () => (globalThis.location ? location.origin + location.pathname : undefined);   // Link in der Mail führt hierher
  client.onAuthChange(u => { user = toUser(u); subs.forEach(f => f(user)); });
  return {
    async init() { try { await client.ensureSession(); } catch (_) { /* offline: mit gespeicherter Sitzung weiter */ } user = toUser(client.user()); return user; },
    user: () => user,
    onChange(cb) { subs.push(cb); },
    async upgrade({ email }) { return toUser(await client.linkEmail(email, back())); },
    async confirmUpgrade({ email, code }) { return toUser(await client.verifyCode("email_change", email, code)); },
    async sendCode({ email }) { await client.sendLoginCode(email, back()); },
    async signIn({ email, code }) { return toUser(await client.verifyCode("email", email, code)); },
    async signOut() { await client.signOut(); },
  };
}
