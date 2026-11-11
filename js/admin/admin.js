// Admin-Dashboard (admin.html): Nutzungszahlen in Summen aus api.admin_stats. Nutzt dieselbe Sitzung wie das Spiel
// (gleicher Ursprung, gleicher Speicher-Schlüssel). Ob jemand Admin ist, entscheidet nur der Server.
// #staff=TOKEN: dieses Gerät (auch ein Gast) zählt nicht mehr in der Statistik (api.staff_claim).
// Interne Seite: Texte nur auf Deutsch, ohne Wörterbuch.
import { createClient } from "../adapters/server/supabase-rest.js";
import { backendConfig } from "../adapters/server/config.js";
import { turnstileToken } from "../adapters/server/turnstile.js";
import { BACKEND } from "../content/backend.js";
import { dashboard, drawCharts } from "./view.js";

const $ = id => document.getElementById(id);
const app = $("app");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const DAYS = [7, 30, 90];
let days = 30, last = null, client = null;
try { days = DAYS.includes(Number(localStorage.getItem("kopfball-duell-admin-days"))) ? Number(localStorage.getItem("kopfball-duell-admin-days")) : 30; } catch (_) { /* ohne Speicher: 30 Tage */ }

function gate(title, text, extra = "") {
  $("days").hidden = true;
  app.innerHTML = `<section class="gate"><h1>${esc(title)}</h1>${text}${extra}<p><a href="/">Zum Spiel</a></p></section>`;
}
const denied = (pre = "") => gate("Kein Zugriff", pre + "<p>Kein Zugriff. Melde dich im Spiel mit deinem gesicherten Konto an.</p>");

// Erst der alte Weg (verstecktes Textfeld, execCommand): läuft synchron im Klick, das verlangt Safari (wie copyText im Spiel)
function copy(s) {
  const ta = document.createElement("textarea");
  ta.value = s; ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
  document.body.append(ta);
  let ok = false;
  try { ta.focus({ preventScroll: true }); ta.select(); ta.setSelectionRange(0, s.length); ok = document.execCommand("copy"); } catch (_) { ok = false; } finally { ta.remove(); }
  if (ok) return Promise.resolve(true);
  try { return navigator.clipboard.writeText(s).then(() => true, () => false); } catch (_) { return Promise.resolve(false); }
}

/** Einmal-Link einlösen; legt dafür notfalls einen Gast an (wie das Spiel beim ersten Start). Gibt den Hinweis als HTML. */
async function claim(token) {
  try {
    await client.ensureSession({ user: true });
    await client.rpc("staff_claim", { token });
    return `<p class="ok">Dieses Gerät zählt ab jetzt nicht mehr in der Statistik.</p>`;
  } catch (e) {
    return `<p class="down">${e && e.code === "bad_token" ? "Der Link ist ungültig, abgelaufen oder schon benutzt." : "Das hat nicht geklappt (" + esc(e && e.code || "Fehler") + "). Bitte später noch einmal."}</p>`;
  }
}

async function load() {
  try {
    last = await client.rpc("admin_stats", { days });
  } catch (e) {
    if (e && (e.code === "forbidden" || e.code === "not_authenticated")) { denied(); return; }
    gate("Fehler", `<p>Die Zahlen ließen sich nicht laden (${esc(e && e.code || "Fehler")}).</p>`, `<p><button class="btn" id="retry">Nochmal</button></p>`);
    $("retry").onclick = () => load();
    return;
  }
  show();
}

function show() {
  const seg = $("days");
  seg.hidden = false;
  seg.innerHTML = DAYS.map(d => `<button data-d="${d}" class="${d === days ? "on" : ""}" aria-pressed="${d === days}">${d} T</button>`).join("");
  for (const b of seg.querySelectorAll("button")) b.onclick = () => { days = Number(b.dataset.d); try { localStorage.setItem("kopfball-duell-admin-days", String(days)); } catch (_) {} load(); };
  app.innerHTML = dashboard(last);
  drawCharts(app, last);
  $("staffBtn").onclick = staffLink;
}

async function staffLink() {
  const box = $("staffBox"), btn = $("staffBtn");
  btn.disabled = true;
  try {
    const r = await client.rpc("admin_staff_link");
    const url = location.origin + location.pathname + "#staff=" + r.token;
    box.innerHTML = `<div class="link"><input id="staffUrl" readonly value="${esc(url)}" aria-label="Link"><button class="btn" id="staffCopy">Kopieren</button></div>
      <p class="muted small">Gilt 1 Stunde und nur einmal. Auf dem anderen Gerät öffnen (im Browser, mit dem dort gespielt wird).</p>`;
    $("staffUrl").onfocus = e => e.target.select();
    $("staffCopy").onclick = () => copy(url).then(ok => { $("staffCopy").textContent = ok ? "Kopiert" : "Bitte markieren"; });
  } catch (e) {
    box.innerHTML = `<p class="down small">Link ging nicht (${esc(e && e.code || "Fehler")}).</p>`;
  } finally { btn.disabled = false; }
}

async function boot() {
  const be = backendConfig(location, BACKEND);
  if (!be) { gate("Kein Server", "<p>Diese Seite braucht den Spiel-Server.</p>"); return; }
  const captcha = be.captchaSiteKey ? turnstileToken(be.captchaSiteKey) : null;
  client = createClient({ ...be, captcha, sessionKey: be.sessionKey });
  const m = /^#staff=([A-Za-z0-9]{16,128})$/.exec(location.hash || "");
  let note = "";
  if (m) {
    history.replaceState(null, "", location.pathname + location.search);   // Einmal-Link nicht in der Adresszeile stehen lassen
    note = await claim(m[1]);
  }
  const u = client.user();
  // ohne Sitzung kein Gast anlegen, nur um „kein Zugriff“ zu sagen; Gäste sind nie Admin (prüft der Server)
  if (!u || u.is_anonymous) {
    if (note) gate("Gerät ausgeschlossen", note); else denied();
    return;
  }
  await load();
  if (note && last) app.insertAdjacentHTML("afterbegin", `<div class="note">${note}</div>`);
  else if (note) app.insertAdjacentHTML("afterbegin", note);
}

let rs = 0;
addEventListener("resize", () => { clearTimeout(rs); rs = setTimeout(() => { if (last && $("chartActive")) drawCharts(app, last); }, 120); });
boot().catch(e => { console.error(e); gate("Fehler", "<p>Die Seite konnte nicht starten. Bitte neu laden.</p>"); });
