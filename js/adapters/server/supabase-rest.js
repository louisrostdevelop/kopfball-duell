// Schlanker Supabase-Client ohne Bibliothek: Anmeldung (Gast, E-Mail), Token erneuern, Server-Funktionen aufrufen.
// Spricht nur die öffentlichen REST-Schnittstellen an (GoTrue unter /auth/v1, PostgREST unter /rest/v1, Functions unter /functions/v1).
import { safeStorage } from "../storage/safe.js";
const KEY = "kopfball-duell-session";
// Merker: dieser Browser hat eine Mail angefordert (nur dann wird ein #access_token aus der Adresse übernommen)
const MAIL_KEY = "kopfball-duell-mail", MAIL_TTL = 24 * 3600 * 1000;
const RELOAD_GAP = 60 * 1000;   // Konto-Stand höchstens einmal pro Minute nachfragen

export class ServerError extends Error {
  constructor(code, status, detail, errorCode) { super(code); this.code = code; this.status = status; this.detail = detail; this.errorCode = errorCode; }
}
// Refresh-Token sicher ungültig (nur dann wird die Sitzung verworfen). Alles andere (500, 503, 429, 401 vom Gateway,
// kaputte Antwort) gilt wie offline: Sitzung behalten, später nochmal.
const DEAD = ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "user_not_found", "invalid_grant"];
const okAuth = d => !!(d && typeof d === "object" && d.access_token && d.refresh_token && d.user && d.user.id);

/**
 * @param {{ url: string, anonKey: string, storage?: Storage, fetch?: typeof fetch, schema?: string, captcha?: () => Promise<string> }} o
 *   captcha: liefert ein Captcha-Token (nur nötig, wenn im Projekt eingeschaltet). GoTrue verlangt es dann bei
 *   /signup (auch Gast), /otp (Code zum Anmelden), /recover, /resend und /token mit Passwort; nicht beim Erneuern
 *   (/token?grant_type=refresh_token), bei /verify (Code eingeben) und PUT /user (E-Mail zum Sichern eintragen).
 */
export function createClient({ url, anonKey, storage = safeStorage(), fetch: f = globalThis.fetch.bind(globalThis), schema = "api", captcha = null, sessionKey = KEY }) {
  url = url.replace(/\/+$/, "");
  let session = null, refreshing = null, signingUp = null, lastReload = 0, changed = false, unsaved = false;
  const subs = [], onChanged = [], onUnsaved = [];
  const stored = () => { try { return JSON.parse(storage.getItem(sessionKey) || "null"); } catch (_) { return null; } };
  const rtOf = s => (s && s.refresh_token) || null;
  const now = () => Date.now() / 1000;
  session = stored();
  // Mehrere Kontexte teilen den Speicher (Tabs, installierte App und Browser auf Android). Refresh-Tokens gelten nur
  // einmal: wer mit einem schon erneuerten erneuert, bekommt „Already Used“ und GoTrue sperrt die ganze Sitzung.
  // seenRt = Refresh-Token, das zuletzt im Speicher stand (gelesen oder selbst geschrieben). Steht dort etwas anderes,
  // hat ein anderer Kontext geschrieben: gleiches Konto -> übernehmen; anderes Konto oder geleert (dort abgemeldet,
  // anders angemeldet) -> „changed“: dieser Kontext schreibt und löscht nichts mehr und muss neu laden.
  let seenRt = rtOf(session);
  const notify = () => subs.forEach(cb => cb(session && session.user));
  const changedErr = () => new ServerError("session_changed", 0);
  function sync() {
    if (changed) return "changed";
    const s = stored(), rt = rtOf(s);
    if (rt === seenRt) return "same";
    if (rt && (!session || (s.user && session.user && s.user.id === session.user.id))) { seenRt = rt; session = s; notify(); return "adopted"; }
    changed = true; onChanged.forEach(cb => cb());
    return "changed";
  }
  /** Sitzung setzen und speichern (null = abmelden). Nicht, wenn ein anderer Kontext inzwischen ein anderes Konto hat. */
  // force: trotzdem schreiben (Anmelden mit Code auf ein anderes Konto: die Seite lädt danach ohnehin neu)
  function keep(s, force = false) {
    if (force) changed = false;
    else if (sync() === "changed") return false;
    session = s;
    const write = () => { if (s) storage.setItem(sessionKey, JSON.stringify(s)); else storage.removeItem(sessionKey); seenRt = rtOf(s); unsaved = false; };
    try { write(); } catch (_) {
      try {
        // Speicher voll. Gleiche Tokens (nur der Nutzer hat sich geändert): die gespeicherte Sitzung gilt noch, nichts
        // anfassen. Neues Token: das alte im Speicher ist verbraucht und darf nicht stehen bleiben; wer es benutzt (anderer
        // Tab, nächster Start), löst bei GoTrue die Erkennung wiederverwendeter Tokens aus, die ganze Sitzung samt neuem
        // Token wird gesperrt. Also alte weg, dann die neue, notfalls verkleinert (nur Tokens und Kern des Nutzers).
        if (!s || rtOf(s) === seenRt) throw new Error("full");
        storage.removeItem(sessionKey); seenRt = null;
        try { write(); } catch (_e2) {
          const u = s.user || {};
          storage.setItem(sessionKey, JSON.stringify({ ...s, user: { id: u.id, is_anonymous: u.is_anonymous, email: u.email, new_email: u.new_email } }));
          seenRt = rtOf(s); unsaved = false;
        }
        // passt auch das nicht, bleibt der Speicher leer: andere Tabs laden neu, dieser spielt mit der Sitzung weiter
      } catch (_e) {
        // geht nicht: Sitzung lebt nur hier. Einmal warnen; bis es wieder geht, nur erneuern, wenn das Token wirklich
        // abgelaufen ist (jede Erneuerung macht das gespeicherte Token ungültig, der nächste Start verlöre die Sitzung)
        if (s && !unsaved) { unsaved = true; onUnsaved.forEach(cb => cb()); }
      }
    }
    notify();
    return true;
  }
  globalThis.addEventListener?.("storage", e => { if (e.key === sessionKey) sync(); });
  const markMail = () => { try { storage.setItem(MAIL_KEY, String(Date.now())); } catch (_) {} };
  const clearMail = () => { try { storage.removeItem(MAIL_KEY); } catch (_) {} };   // Code benutzt oder Mail nicht verschickt: kein Link mehr erwartet
  const mailPending = () => { try { const t = Number(storage.getItem(MAIL_KEY)); return t > 0 && Date.now() - t < MAIL_TTL; } catch (_) { return false; } };
  // Konto-ID aus dem Token lesen, ungeprüft: nur um zu entscheiden, ob ein Hinweis nötig ist, nie zum Anmelden
  const tokenSub = tok => { try { return JSON.parse(atob(String(tok).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub || null; } catch (_) { return null; } };
  // Ablauf nach der eigenen Uhr (expires_in), nicht nach expires_at des Servers: geht die Geräteuhr falsch, stimmt es trotzdem
  const fromAuth = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(now()) + (Number(d.expires_in) || 3600), user: d.user });

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
      throw new ServerError(code, res.status, data && (data.details || data.error_description || data.hint), data && typeof data === "object" ? data.error_code || data.error : undefined);
    }
    return data;
  }
  /** Token erneuern. Ergibt die Sitzung, null nur wenn sie sicher ungültig war und verworfen wurde; sonst Fehler. */
  async function refresh() {
    if (refreshing) return refreshing;
    const st = sync();
    if (st === "changed") throw changedErr();
    if (!session || !session.refresh_token) return null;
    if (st === "adopted" && session.expires_at - 60 > now()) return session;   // anderer Kontext hat schon erneuert
    const sent = session.refresh_token;
    refreshing = call("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: sent } })
      .then(d => {
        if (!okAuth(d)) throw new ServerError("bad_response", 200);
        if (sync() === "changed") throw changedErr();
        if (session && session.refresh_token === sent) keep(fromAuth(d));   // sonst inzwischen neuere Sitzung (Code eingegeben): die bleibt
        return session;
      })
      .catch(e => {
        if (e.code === "session_changed") throw e;
        // nicht sicher tot (429, 401 vom Gateway, 5xx, kaputte Antwort): wie offline. Sonst hielte die Warteschlange der
        // Spielmeldungen einen 4xx beim Erneuern für ein endgültiges Nein und löschte das Ergebnis.
        if (e.status !== 400 || !DEAD.includes(e.errorCode)) throw new ServerError("offline", 0, e.code, e.errorCode);
        if (sync() === "changed") throw changedErr();
        if (session && session.refresh_token !== sent) return session;   // anderer Kontext hat schon erneuert
        keep(null);   // Token sicher ungültig: neu anmelden
        return null;
      })
      .finally(() => { refreshing = null; });
    return refreshing;
  }
  /** Gültige Sitzung: vorhandene, erneuerte oder (nur wenn es keine gibt) neuer Gast. Andere Fehler gehen weiter wie
   *  offline: die App spielt mit dem lokalen Stand weiter und meldet später. */
  async function ensureSession({ user = false } = {}) {
    if (sync() === "changed") throw changedErr();
    const margin = unsaved ? 0 : 60;
    if (session && session.expires_at - margin > now()) return session;
    if (session) { const s = await refresh(); if (s) return s; }
    // anonyme Anmeldung, nur eine gleichzeitig (sonst entstehen bei langsamem Netz zwei Gast-Konten)
    signingUp = signingUp || (async () => {
      const before = seenRt;   // ändert sich das während der Anmeldung (anderer Kontext hat einen Gast gespeichert), gilt dessen Gast
      const body = { data: {} };
      if (captcha) body.gotrue_meta_security = { captcha_token: await captchaToken(user) };
      const d = await call("/auth/v1/signup", { body });
      if (!okAuth(d)) throw new ServerError("bad_response", 200);
      if (sync() === "changed") throw changedErr();
      if (seenRt !== before && session) return session;   // zwei Erststarts gleichzeitig (auch schon per storage-Event übernommen)
      keep(fromAuth(d));
      return session;
    })().finally(() => { signingUp = null; });
    return signingUp;
  }
  // Captcha-Token; user = auf Knopfdruck (darf ein Kästchen zum Anklicken zeigen). Scheitern = captcha_failed (Status 0)
  async function captchaToken(user) {
    try { return await captcha({ user }); } catch (e) { throw new ServerError("captcha_failed", 0, String(e && e.message || e)); }
  }
  // Fehler auf dem Weg zur Sitzung (Gast anlegen, Captcha, Erneuern) sind nie die Antwort der eigentlichen Funktion:
  // Status 0 wie offline, damit z. B. die Warteschlange der Spielmeldungen nichts verwirft
  const transient = e => (e && e.status === 0 ? e
    : e && (e.errorCode === "captcha_failed" || e.code === "captcha_failed") ? new ServerError("captcha_failed", 0, e.code)
    : new ServerError("offline", 0, e && e.code, e && e.errorCode));
  const sessionFor = () => ensureSession().catch(e => { throw transient(e); });
  /** Server-Funktion im Schema api aufrufen. Bei abgelaufenem Token einmal erneuern und wiederholen. */
  async function rpc(fn, args = {}) {
    const s = await sessionFor();
    const go = tok => call("/rest/v1/rpc/" + fn, { body: args, token: tok, headers: { "Content-Profile": schema, "Accept-Profile": schema } });
    try { return await go(s.access_token); } catch (e) {
      if (e.status !== 401) throw e;
      const s2 = await refresh().then(x => x || ensureSession()).catch(err => { throw transient(err); });   // kein neuer Gast bei Störungen
      // nochmal 401 trotz frischem Token: liegt nicht an der Funktion (Gateway, Schlüssel) -> wie offline
      return go(s2.access_token).catch(err => { throw err.status === 401 ? transient(err) : err; });
    }
  }
  async function callFn(name, body) { const s = await sessionFor(); return call("/functions/v1/" + name, { body, token: s.access_token }); }

  return {
    ensureSession, rpc, fn: callFn,
    user: () => session && session.user,
    onAuthChange(cb) { subs.push(cb); },
    /** Ein anderer Kontext (Tab, App) hat das Konto gewechselt oder sich abgemeldet: hier neu laden */
    onSessionChanged(cb) { onChanged.push(cb); },
    /** Sitzung ließ sich nicht speichern (Speicher voll) */
    onUnsaved(cb) { onUnsaved.push(cb); },
    /** Gast behält ID und Spielstand: E-Mail hinzufügen. Supabase schickt eine Mail mit Code (und Link). */
    async linkEmail(email, redirectTo) {
      const s = await ensureSession({ user: true });   // auf Knopfdruck: Captcha-Kästchen darf erscheinen, keine Pause
      markMail();
      let u;
      try { u = await call("/auth/v1/user" + (redirectTo ? "?redirect_to=" + encodeURIComponent(redirectTo) : ""), { method: "PUT", token: s.access_token, body: { email } }); }
      catch (e) { clearMail(); throw e; }
      keep({ ...session, user: u }); return u;
    },
    /** Code aus der Mail eingeben: beim Sichern (email_change) oder Anmelden (email). Ergibt die neue Sitzung. */
    async verifyCode(type, email, token) {
      const d = await call("/auth/v1/verify", { body: { type, email, token } });
      if (!okAuth(d)) throw new ServerError("bad_response", 200);
      if (!keep(fromAuth(d), type === "email")) throw changedErr();   // Anmelden: auch wenn ein anderer Tab das Konto geändert hat
      clearMail(); return session.user;
    },
    /** Anmelden auf einem anderen Gerät: Code an ein bestehendes Konto schicken (legt kein neues an) */
    async sendLoginCode(email, redirectTo) {
      markMail();
      try {
        const body = { email, create_user: false };
        if (captcha) {
          body.gotrue_meta_security = { captcha_token: await captchaToken(true) };
        }
        await call("/auth/v1/otp" + (redirectTo ? "?redirect_to=" + encodeURIComponent(redirectTo) : ""), { body });
      } catch (e) { clearMail(); throw e; }
    },
    /** Rückkehr aus der Bestätigungs-Mail: Supabase hängt die neue Sitzung an die Adresse (#access_token=...).
     *  Gibt "ok", { error, text }, null (nichts da) oder ohne Mail-Merker "foreign" zurück (in einem anderen Browser
     *  angefordert; das Einmal-Token, also auch der Code, ist dann verbraucht), bzw. "own", wenn man mit genau diesem Konto
     *  schon angemeldet ist (nichts zu tun). */
    async takeRedirect(hash) {
      const q = new URLSearchParams(String(hash || "").replace(/^#/, ""));
      // Fehler: { error: Code (z. B. otp_expired = abgelaufen oder schon benutzt), text: Rohtext von Supabase }
      if (q.get("error_description") || q.get("error")) return { error: q.get("error_code") || q.get("error") || null, text: q.get("error_description") || q.get("error") };
      if (!q.get("access_token") || !q.get("refresh_token")) return null;
      // nur nach einer Mail aus diesem Browser: sonst könnte ein fremder Link die Sitzung (und den Gast-Spielstand) ersetzen
      if (!mailPending()) { const u = session && session.user; return u && !u.is_anonymous && u.id === tokenSub(q.get("access_token")) ? "own" : "foreign"; }
      try { storage.removeItem(MAIL_KEY); } catch (_) {}
      const access_token = q.get("access_token");
      const user = await call("/auth/v1/user", { method: "GET", token: access_token });
      keep({ access_token, refresh_token: q.get("refresh_token"), expires_at: Math.floor(now()) + (Number(q.get("expires_in")) || 3600), user });
      return "ok";
    },
    /** Gast mit offener Mail (Sichern): Stand vom Server holen, z. B. per Link in einem anderen Browser bestätigt.
     *  Fragt nur nach (rotiert nichts); erst wenn das Konto jetzt fest ist, einmal erneuern, damit das Token es auch weiß.
     *  Höchstens einmal pro Minute und nur, solange eine Mail aus diesem Browser unterwegs ist. */
    async reload() {
      sync();
      const u0 = session && session.user;
      if (!u0 || !u0.is_anonymous || !mailPending() || Date.now() - lastReload < RELOAD_GAP) return u0 || null;
      lastReload = Date.now();
      const s = await ensureSession();
      const u = await call("/auth/v1/user", { method: "GET", token: s.access_token });
      if (session !== s) return session && session.user;   // inzwischen andere Sitzung
      // erneuern nur, wenn gespeichert werden kann (sonst wäre das gespeicherte Token beim nächsten Start verbraucht)
      if (u && u.email && !u.is_anonymous) { keep({ ...session, user: u }); clearMail(); if (!unsaved) await refresh().catch(() => null); }
      else keep({ ...session, user: u });
      return session && session.user;
    },
    async signOut() { const s = session; keep(null); if (s) await call("/auth/v1/logout", { token: s.access_token }).catch(() => {}); },
  };
}
