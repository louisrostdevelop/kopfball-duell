// Schlanker Supabase-Client ohne Bibliothek: Anmeldung (Gast, E-Mail), Token erneuern, Server-Funktionen aufrufen.
// Spricht nur die öffentlichen REST-Schnittstellen an (GoTrue unter /auth/v1, PostgREST unter /rest/v1, Functions unter /functions/v1).
const KEY = "kopfball-duell-session";

export class ServerError extends Error {
  constructor(code, status, detail) { super(code); this.code = code; this.status = status; this.detail = detail; }
}

/**
 * @param {{ url: string, anonKey: string, storage?: Storage, fetch?: typeof fetch, schema?: string, captcha?: () => Promise<string> }} o
 *   captcha: liefert ein Captcha-Token für die Gast-Anmeldung (nur nötig, wenn im Projekt eingeschaltet)
 */
export function createClient({ url, anonKey, storage = globalThis.localStorage, fetch: f = globalThis.fetch.bind(globalThis), schema = "api", captcha = null }) {
  url = url.replace(/\/+$/, "");
  let session = null, refreshing = null; const subs = [];
  try { session = JSON.parse(storage.getItem(KEY) || "null"); } catch (_) {}
  const keep = s => { session = s; try { s ? storage.setItem(KEY, JSON.stringify(s)) : storage.removeItem(KEY); } catch (_) {} subs.forEach(cb => cb(s && s.user)); };
  const fromAuth = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user });

  async function call(path, { method = "POST", body, token, headers = {}, timeout = 12000 } = {}) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctl && setTimeout(() => ctl.abort(), timeout);
    let res;
    try {
      res = await f(url + path, {
        method, signal: ctl && ctl.signal,
        headers: { apikey: anonKey, Authorization: "Bearer " + (token || anonKey), "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) { throw new ServerError("offline", 0, String(e && e.message || e)); } finally { if (t) clearTimeout(t); }
    const text = await res.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const code = (data && (data.message || data.error_code || data.msg || data.error)) || "http_" + res.status;
      throw new ServerError(code, res.status, data && (data.details || data.error_description || data.hint));
    }
    return data;
  }
  async function refresh() {
    if (!session || !session.refresh_token) return null;
    refreshing = refreshing || call("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } })
      .then(d => (keep(fromAuth(d)), session))
      .catch(e => { if (e.status === 400 || e.status === 401) keep(null); throw e; })   // Token ungültig: neu anmelden
      .finally(() => { refreshing = null; });
    return refreshing;
  }
  /** Gültige Sitzung: vorhandene, erneuerte oder neuer Gast */
  async function ensureSession() {
    if (session && session.expires_at - 60 > Date.now() / 1000) return session;
    if (session) { try { const s = await refresh(); if (s) return s; } catch (e) { if (e.code === "offline") throw e; } }
    const body = { data: {} };
    if (captcha) body.gotrue_meta_security = { captcha_token: await captcha() };
    keep(fromAuth(await call("/auth/v1/signup", { body })));   // anonyme Anmeldung
    return session;
  }
  /** Server-Funktion im Schema api aufrufen. Bei abgelaufenem Token einmal erneuern und wiederholen. */
  async function rpc(fn, args = {}) {
    const s = await ensureSession();
    const go = tok => call("/rest/v1/rpc/" + fn, { body: args, token: tok, headers: { "Content-Profile": schema, "Accept-Profile": schema } });
    try { return await go(s.access_token); } catch (e) {
      if (e.status !== 401) throw e;
      const s2 = await refresh().catch(() => null) || await ensureSession();
      return go(s2.access_token);
    }
  }
  async function fn(name, body) { const s = await ensureSession(); return call("/functions/v1/" + name, { body, token: s.access_token }); }

  return {
    ensureSession, rpc, fn,
    user: () => session && session.user,
    onAuthChange(cb) { subs.push(cb); },
    /** Gast behält ID und Spielstand: E-Mail (und Passwort) hinzufügen. Supabase schickt eine Bestätigungs-Mail. */
    async linkEmail(email, password) {
      const s = await ensureSession();
      const u = await call("/auth/v1/user", { method: "PUT", token: s.access_token, body: password ? { email, password } : { email } });
      keep({ ...session, user: u }); return u;
    },
    async signIn(email, password) { keep(fromAuth(await call("/auth/v1/token?grant_type=password", { body: { email, password } }))); return session.user; },
    async signOut() { const s = session; keep(null); if (s) await call("/auth/v1/logout", { token: s.access_token }).catch(() => {}); },
  };
}
