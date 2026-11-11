// Konto über Supabase Auth: beim ersten Start ein Gast-Konto auf dem Server (anonym), später mit E-Mail verknüpfbar.
// Die ID bleibt beim Verknüpfen gleich, der Spielstand auch.
/** @returns {import("../../ports/auth.js").AuthProvider} */
export function supabaseAuth(client) {
  const toUser = u => u && { id: u.id, guest: !!u.is_anonymous || !u.email, email: u.email || undefined, pendingEmail: u.new_email || undefined };
  let user = toUser(client.user()); const subs = [];
  const back = () => (globalThis.location ? location.origin + location.pathname : undefined);   // Link in der Mail führt hierher
  client.onAuthChange(u => { user = toUser(u); subs.forEach(f => f(user)); });
  // Sichern offen (Mail unterwegs): Stand vom Server holen; wurde die Adresse schon bestätigt (Link in einem anderen
  // Browser), ist das Konto danach auch hier gesichert
  const reload = async () => { if (user && user.guest && user.pendingEmail) await client.reload(); return user; };
  return {
    async init() {
      // nicht ewig auf einen langsamen Server warten: mit gespeicherter Sitzung nach 2,5 s weiter (erneuert im Hintergrund,
      // onAuthChange meldet sie dann), beim allerersten Start höchstens 6 s
      const job = client.ensureSession().catch(() => { /* offline: mit gespeicherter Sitzung weiter */ });
      await Promise.race([job, new Promise(r => { setTimeout(r, client.user() ? 2500 : 6000); })]);
      user = toUser(client.user());
      if (user && user.guest && user.pendingEmail) job.then(reload).catch(() => {});   // Sichern evtl. schon woanders bestätigt
      return user;
    },
    reload,
    user: () => user,
    onChange(cb) { subs.push(cb); },
    async upgrade({ email }) { return toUser(await client.linkEmail(email, back())); },
    async confirmUpgrade({ email, code }) { return toUser(await client.verifyCode("email_change", email, code)); },
    async sendCode({ email }) { await client.sendLoginCode(email, back()); },
    async signIn({ email, code }) { return toUser(await client.verifyCode("email", email, code)); },
    async signOut() { await client.signOut(); },
  };
}
