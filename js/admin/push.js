// Push-Benachrichtigungen fürs Admin-Dashboard: dieses Gerät an- und abmelden, Arten wählen, Test senden.
// Der Zustand lebt hier und übersteht das Neuzeichnen der Seite (Zeitraum, Auto-Abruf alle 2 Minuten); geladen wird
// nur einmal. Scheitert etwas (Server noch ohne Push), steht der Fehler nur in dieser Karte.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const errCode = e => esc((e && e.code) || "Fehler");

export const PREFS = [
  ["online", "Erstes Online-Match eines Spielers"], ["friends", "Erstes Spiel mit Freunden"],
  ["record", "Neuer Tagesrekord aktiver Spieler"], ["daily", "Tageszusammenfassung (abends)"],
];

const ua = navigator.userAgent || "";
const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Gerätename für die Liste am Server, z. B. „Android · Chrome“ */
export function deviceLabel(s = ua) {
  const os = /Android/.test(s) ? "Android" : /iPhone|iPod/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "Mac" : /CrOS/.test(s) ? "ChromeOS" : /Linux/.test(s) ? "Linux" : "Gerät";
  const br = /Edg\//.test(s) ? "Edge" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /OPR\//.test(s) ? "Opera" : /Firefox\/|FxiOS/.test(s) ? "Firefox"
    : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Browser";
  return os + " · " + br;
}

// Schlüssel als Bytes (pushManager.subscribe will ihn so, nicht als Text)
function b64urlBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

export function createPush({ client, vapidKey }) {
  const st = { loaded: false, loading: false, err: "", prefs: {}, devices: 0, on: false, busy: false, note: "", noteCls: "", saved: "", test: "", testCls: "" };
  let savedT = 0;

  // Service Worker: derselbe wie im Spiel (sw.js, Bereich ganze Seite); ready wartet, bis er läuft
  async function registration() {
    await navigator.serviceWorker.register("sw.js");
    return navigator.serviceWorker.ready;
  }
  async function localSub() {
    if (!supported() || Notification.permission !== "granted") return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }
  const subArgs = sub => { const j = sub.toJSON(); return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, label: deviceLabel() }; };

  function hintHtml() {
    if (!supported()) {
      return ios && !standalone()
        ? `<p class="push-hint">Auf dem iPhone geht das nur aus der Home-Bildschirm-App: im Safari „Teilen“ → „Zum Home-Bildschirm“, dann dort öffnen.</p>`
        : `<p class="push-hint">Dieser Browser kann keine Push-Nachrichten. Auf dem Handy Chrome nehmen.</p>`;
    }
    if (Notification.permission === "denied") {
      return `<p class="push-hint down">Benachrichtigungen sind für diese Seite blockiert. Erlauben: Schloss-Symbol neben der Adresse → Berechtigungen → Benachrichtigungen, danach neu laden.</p>`;
    }
    return "";
  }

  function render() {
    const box = document.getElementById("pushBox");
    if (!box) return;
    if (!st.loaded) {
      box.innerHTML = st.err
        ? `<p class="down small">Benachrichtigungen ließen sich nicht laden (${st.err}).</p><button class="btn ghost" id="pushRetry">Nochmal</button>`
        : `<p class="muted small"><span class="spin sm" aria-hidden="true"></span> Lädt …</p>`;
      const r = document.getElementById("pushRetry");
      if (r) r.onclick = () => { st.err = ""; load(); };
      return;
    }
    const can = supported() && Notification.permission !== "denied";
    box.innerHTML = `<div class="push-dev">
        <div class="push-state ${st.on ? "on" : ""}"><i aria-hidden="true"></i><span><b>Dieses Gerät</b><small id="pushStatus">${st.on ? "Bekommt Nachrichten" : "Bekommt keine Nachrichten"}</small></span></div>
        <button class="btn${st.on ? " ghost" : ""}" id="pushToggle"${can && !st.busy ? "" : " disabled"}>${st.on ? "Auf diesem Gerät ausschalten" : "Auf diesem Gerät einschalten"}</button></div>
      ${hintHtml()}${st.note ? `<p class="small ${st.noteCls}" role="status">${st.note}</p>` : ""}
      <h3>Nachrichten bei</h3>
      <div class="switches">${PREFS.map(([k, l]) => `<label class="switch"><input type="checkbox" data-pref="${k}"${st.prefs[k] ? " checked" : ""}><span class="sw-track" aria-hidden="true"></span><span class="sw-txt">${l}</span>${st.saved === k ? `<span class="sw-ok" role="status">Gespeichert</span>` : ""}</label>`).join("")}</div>
      <p class="hint">Höchstens eine Nachricht alle 30 Minuten · 23–8 Uhr Ruhezeit (Sammelnachricht um 8 Uhr)</p>
      <div class="push-foot"><span class="muted small">Geräte mit Push: <b id="pushDevices">${st.devices}</b></span>
        <button class="btn ghost" id="pushTest"${st.devices > 0 && !st.busy ? "" : " disabled"}>Test senden</button></div>
      ${st.test ? `<p class="small ${st.testCls}" id="pushTestMsg" role="status">${st.test}</p>` : ""}`;
    document.getElementById("pushToggle").onclick = () => (st.on ? disable() : enable());
    document.getElementById("pushTest").onclick = sendTest;
    for (const i of box.querySelectorAll("input[data-pref]")) i.onchange = () => setPref(i.dataset.pref, i.checked);
  }
  const apply = r => { if (r && r.prefs) st.prefs = { ...r.prefs }; if (r && Number.isFinite(Number(r.devices))) st.devices = Number(r.devices); };

  async function load() {
    if (st.loading) return;
    st.loading = true; render();
    // auch ohne Push anmelden: Klick auf eine Nachricht braucht den aktuellen Service Worker
    if (supported()) navigator.serviceWorker.register("sw.js").catch(() => {});
    try {
      apply(await client.rpc("admin_push_get"));
      const sub = await localSub().catch(() => null);
      st.on = !!sub;
      st.loaded = true;
      // am Server nachtragen (z. B. vom Browser erneuert oder am Server entfernt); stört es, bleibt die Anzeige
      if (sub) client.rpc("admin_push_subscribe", subArgs(sub)).then(r => { apply(r); render(); }, () => {});
    } catch (e) { st.err = errCode(e); } finally { st.loading = false; render(); }
  }

  async function enable() {
    st.busy = true; st.note = ""; render();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { st.note = perm === "denied" ? "" : "Ohne Erlaubnis keine Nachrichten. Nochmal tippen und „Zulassen“ wählen."; st.noteCls = "muted"; return; }
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlBytes(vapidKey) });
      apply(await client.rpc("admin_push_subscribe", subArgs(sub)));
      st.on = true; st.note = "Eingeschaltet. Zum Prüfen „Test senden“."; st.noteCls = "ok";
    } catch (e) {
      st.note = `Einschalten ging nicht (${errCode(e)}).`; st.noteCls = "down";
    } finally { st.busy = false; render(); }
  }

  async function disable() {
    st.busy = true; st.note = ""; render();
    try {
      const sub = await localSub();
      if (sub) {
        apply(await client.rpc("admin_push_unsubscribe", { endpoint: sub.endpoint }));
        await sub.unsubscribe().catch(() => {});
      }
      st.on = false; st.note = "Ausgeschaltet."; st.noteCls = "muted";
    } catch (e) {
      st.note = `Ausschalten ging nicht (${errCode(e)}).`; st.noteCls = "down";
    } finally { st.busy = false; render(); }
  }

  async function setPref(k, v) {
    const old = st.prefs[k];
    st.prefs[k] = v;
    try {
      apply(await client.rpc("admin_push_prefs", { prefs: { [k]: v } }));
      st.saved = k; clearTimeout(savedT); savedT = setTimeout(() => { st.saved = ""; render(); }, 2000);
    } catch (e) {
      st.prefs[k] = old; st.note = `Nicht gespeichert (${errCode(e)}).`; st.noteCls = "down";
    }
    render();
  }

  async function sendTest() {
    st.busy = true; st.test = "Wird gesendet …"; st.testCls = "muted"; render();
    try {
      const r = await client.fn("admin-push", { action: "test" });
      const n = Number(r && r.sent) || 0, bad = Number(r && r.failed) || 0;
      st.devices = Math.max(0, st.devices - (Number(r && r.removed) || 0));
      st.test = `Gesendet an ${n} Gerät${n === 1 ? "" : "e"}${bad ? ` · ${bad} fehlgeschlagen` : ""}`;
      st.testCls = n ? "ok" : "down";
    } catch (e) {
      st.test = `Test ging nicht (${errCode(e)}).`; st.testCls = "down";
    } finally { st.busy = false; render(); }
  }

  /** Nach jedem Neuzeichnen der Seite aufrufen: zeigt den gemerkten Stand, lädt beim ersten Mal */
  return { mount() { render(); if (!st.loaded && !st.loading && !st.err) load(); } };
}
