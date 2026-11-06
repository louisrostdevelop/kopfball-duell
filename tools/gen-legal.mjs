// Erzeugt die Rechtsseiten legal/imprint.html, legal/privacy.html und legal/terms.html (deutsch und englisch).
// Alles, was sich ändern kann (Spielname, Anbieter, E-Mail, Käufe an/aus), steht hier in LEGAL bzw. kommt aus der
// Konfiguration des Spiels. Nach einer Änderung: `npm run legal`. Ein Test prüft, dass die Seiten aktuell sind.
// Kein Rechtsrat: vor dem Start und vor dem Einschalten von Käufen gegenlesen lassen.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAYMENTS } from "../js/content/config.js";
import { BACKEND } from "../js/content/backend.js";

export const LEGAL = {
  game: "Headstars",        // Spielname (Domain headstars.app)
  operator: "Louis-Deniel Rost",
  address: ["c/o flexdienst – #10303", "Kurt-Schumacher-Straße 76", "67663 Kaiserslautern"],
  country: { de: "Deutschland", en: "Germany" },
  email: "",                // Kontakt, z. B. support@…; leer = gelber Platzhalter
  updated: "2026-11-06",
  // Datenschutz-Aufsichtsbehörde am Sitz des Anbieters (Rheinland-Pfalz)
  authority: { de: "Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz",
    en: "the State Commissioner for Data Protection and Freedom of Information of Rhineland-Palatinate (LfDI Rheinland-Pfalz)",
    addr: "Hintere Bleiche 34, 55116 Mainz" },
  minAge: 16,
  guestDays: 90,            // supabase/migrations/20261105120500_service.sql (Wartung)
  backupDays: 30,           // verschlüsselte Sicherungen (supabase/ops/backup.sh) höchstens so lange aufheben
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ph = s => `<span class="ph">[${esc(s)}]</span>`;

export function legalPages({ L = LEGAL, payments = PAYMENTS, captcha = !!BACKEND.captchaSiteKey } = {}) {
  const mail = L.email ? `<a href="mailto:${esc(L.email)}">${esc(L.email)}</a>` : ph("E-MAIL");
  const date = { de: L.updated.split("-").reverse().join("."), en: L.updated };
  const addr = lang => [...L.address, L.country[lang]].map(esc).join("<br>");
  const who = lang => `${esc(L.operator)}, ${[...L.address, L.country[lang]].map(esc).join(", ")}, ${lang === "de" ? "E-Mail" : "e-mail"}: ${mail}`;
  const G = esc(L.game);
  const open = !L.email;   // Platzhalter offen?
  const note = { de: `<p class="note">Gelb markierte Stellen vor der Veröffentlichung ausfüllen (<code>tools/gen-legal.mjs</code>).</p>`,
    en: `<p class="note">Fill in the yellow placeholders before publishing (<code>tools/gen-legal.mjs</code>).</p>` };

  const imprint = {
    title: { de: "Impressum", en: "Legal Notice" },
    de: `<p class="meta">Angaben gemäß § 5 DDG</p>${open ? note.de : ""}
<h2>Anbieter</h2>
<p>${esc(L.operator)}<br>${addr("de")}</p>
<h2>Kontakt</h2>
<p>E-Mail: ${mail}</p>
<h2>Verbraucherstreitbeilegung</h2>
<p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>`,
    en: `<p class="meta">Information pursuant to § 5 DDG (German Digital Services Act)</p>${open ? note.en : ""}
<h2>Provider</h2>
<p>${esc(L.operator)}<br>${addr("en")}</p>
<h2>Contact</h2>
<p>E-mail: ${mail}</p>
<h2>Consumer dispute resolution</h2>
<p>We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>`,
  };

  const pay = {
    de: payments
      ? `<p>Zahlungen wickelt Stripe ab (Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin 2, Irland). Deine Zahlungsdaten gibst du direkt bei Stripe ein, wir erhalten keine Karten- oder Kontodaten. Wir speichern Zahlungs-ID, Produkt, Betrag, Währung, Zeitpunkt und Status (bezahlt, erstattet, angefochten). Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) und gesetzliche Pflichten (Art. 6 Abs. 1 lit. c DSGVO). Kaufbelege bewahren wir 10 Jahre auf (§ 147 AO, § 257 HGB); löschst du dein Konto, ohne Verbindung zu deinem Spielerprofil. Datenschutz bei Stripe: stripe.com/privacy.</p>`
      : `<p>Im Spiel gibt es derzeit keine Käufe mit echtem Geld. Wir verarbeiten keine Zahlungsdaten.</p>`,
    en: payments
      ? `<p>Payments are processed by Stripe (Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin 2, Ireland). You enter your payment details directly with Stripe; we never receive card or bank details. We store the payment ID, product, amount, currency, time and status (paid, refunded, disputed). Legal basis: performance of the contract (Art. 6(1)(b) GDPR) and legal obligations (Art. 6(1)(c) GDPR). Purchase records are kept for 10 years (§ 147 AO, § 257 HGB); if you delete your account, without any link to your player profile. Stripe's privacy policy: stripe.com/privacy.</p>`
      : `<p>There are currently no purchases with real money in the game. We do not process any payment data.</p>`,
  };
  const turn = {
    de: `<h2>Schutz vor automatischen Anmeldungen</h2>
<p>Damit keine Bots Konten anlegen, nutzen wir beim Anlegen eines Gastkontos Cloudflare Turnstile (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA). Turnstile verarbeitet deine IP-Adresse und Merkmale deines Browsers, um Menschen von Bots zu unterscheiden. Rechtsgrundlage: unser berechtigtes Interesse am Schutz des Dienstes (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist nach dem EU-U.S. Data Privacy Framework zertifiziert.</p>`,
    en: `<h2>Protection against automated sign-ups</h2>
<p>To keep bots from creating accounts, we use Cloudflare Turnstile (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA) when a guest account is created. Turnstile processes your IP address and browser characteristics to tell humans from bots. Legal basis: our legitimate interest in protecting the service (Art. 6(1)(f) GDPR). Cloudflare is certified under the EU-U.S. Data Privacy Framework.</p>`,
  };

  const privacy = {
    title: { de: "Datenschutzerklärung", en: "Privacy Policy" },
    de: `<p class="meta">${G} · Stand: ${date.de}</p>${open ? note.de : ""}
<h2>Verantwortlicher</h2>
<p>${who("de")} („wir“). Siehe auch das <a href="imprint.html">Impressum</a>.</p>
<h2>Überblick</h2>
<p>${G} ist ein Browserspiel. Du kannst ohne Anmeldung spielen. Wir nutzen keine Analyse-Werkzeuge, keine Werbe-Tracker und keine Social-Media-Plugins. Schriften und Bibliotheken kommen von unserer eigenen Website, nicht von Dritten. Cookies setzen wir nicht.</p>
<h2>Daten auf deinem Gerät</h2>
<p>Das Spiel speichert seinen Stand im lokalen Speicher deines Browsers: Fortschritt, freigeschaltete Gegenstände, Einstellungen (Ton, Sprache, Grafik), das Anmelde-Token für den Spielserver und Spielergebnisse, die noch nicht gesendet werden konnten. Das ist für das Spiel nötig (Art. 6 Abs. 1 lit. b DSGVO; § 25 Abs. 2 Nr. 2 TDDDG). Du kannst es jederzeit in den Browser-Einstellungen löschen oder im Spiel unter Einstellungen → Fortschritt löschen.</p>
<h2>Hosting</h2>
<p>Die Website liegt bei GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr. St, San Francisco, CA 94107, USA). Beim Aufruf sendet dein Browser technische Daten (IP-Adresse, Zeitpunkt, angefragte Datei, Browsertyp) an GitHub, das sie zur Auslieferung und zum Schutz seines Dienstes verarbeitet. Rechtsgrundlage: unser berechtigtes Interesse an der Bereitstellung der Website (Art. 6 Abs. 1 lit. f DSGVO). GitHub kann Daten in den USA verarbeiten und ist nach dem EU-U.S. Data Privacy Framework zertifiziert.</p>
<h2>Spielkonto und Spielserver</h2>
<p>Als Spielserver nutzen wir Supabase (Supabase, Inc.; Server in der EU, Frankfurt am Main). Beim ersten Start wird automatisch ein Gastkonto angelegt. Wir verarbeiten:</p>
<ul>
<li>Konto: eine zufällige Nutzer-ID; wenn du deinen Fortschritt sicherst, deine E-Mail-Adresse und einen Passwort-Hash (dein Passwort sehen wir nie).</li>
<li>Spieldaten: Spielername, Level, Münzen und Juwelen, Gegenstände, Kopf-Level, Saison-Pass, Aufgaben, Erfolge, Spielergebnisse, Wertungen, Bestenlisten-Einträge, Freunde und Freundschaftsanfragen, Zeitpunkt der letzten Aktivität.</li>
<li>Technische Daten: IP-Adresse und Anfrage-Metadaten in den Server-Protokollen von Supabase, kurz aufbewahrt für Sicherheit und Fehlersuche.</li>
</ul>
<p>Zweck: das Spiel bereitstellen, Fortschritt geräteübergreifend sichern, faire Gegnersuche, Bestenlisten, Schutz vor Betrug und Missbrauch (z. B. Tageslimits und Plausibilitätsprüfungen). Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) und unser berechtigtes Interesse an einem fairen und sicheren Spiel (Art. 6 Abs. 1 lit. f DSGVO).</p>
<p>Für andere sichtbar: Spielername, Level, Liga und Wertung sowie Bestenlisten-Einträge. Freunde sehen, wann du zuletzt online warst.</p>
<p>Gastkonten ohne Käufe werden nach ${L.guestDays} Tagen ohne Aktivität automatisch gelöscht.</p>
${captcha ? turn.de : ""}
<h2>Online-Spiele mit anderen</h2>
<p>Online-Spiele laufen direkt zwischen den Browsern der beiden Spieler (Peer-to-Peer, WebRTC). Für den Verbindungsaufbau nutzt das Spiel den PeerJS-Vermittlungsserver (0.peerjs.com) und Hilfsserver (STUN von Google und Cloudflare, TURN-Weiterleitung von PeerJS). Während eines Spiels erhält der Browser deines Gegners deine IP-Adresse, wie bei jeder direkten Verbindung. Klappt keine direkte Verbindung, laufen die Daten über den TURN-Server. Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Wenn du das nicht möchtest, spiele nicht online.</p>
<h2>Käufe</h2>
${pay.de}
<h2>E-Mails</h2>
<p>Sicherst du deinen Fortschritt mit einer E-Mail-Adresse, schicken wir dir über Supabase eine Bestätigung und auf Wunsch E-Mails zum Zurücksetzen des Passworts. Newsletter verschicken wir nicht.</p>
<h2>Empfänger und Übermittlung außerhalb der EU</h2>
<p>Die genannten Anbieter verarbeiten Daten in unserem Auftrag (Auftragsverarbeitung nach Art. 28 DSGVO) oder als eigene Verantwortliche (${payments ? "Stripe bei Zahlungen, " : ""}der Browser deines Gegners während eines Spiels). Sitzen Anbieter in den USA, stützt sich die Übermittlung auf das EU-U.S. Data Privacy Framework oder Standardvertragsklauseln.</p>
<h2>Speicherdauer</h2>
<table><tr><th>Daten</th><th>Gespeichert bis</th></tr>
<tr><td>Gastkonto ohne Käufe</td><td>${L.guestDays} Tage ohne Aktivität</td></tr>
<tr><td>Gesichertes Konto und Spieldaten</td><td>du löschst dein Konto</td></tr>
${payments ? `<tr><td>Kaufbelege</td><td>10 Jahre (gesetzliche Pflicht), nach Löschung des Kontos ohne Profilbezug</td></tr>\n` : ""}<tr><td>Kurzlebige Sicherheitsdaten (Limits, Schutz vor doppelten Anfragen)</td><td>1–2 Tage</td></tr>
<tr><td>Sicherungen</td><td>${L.backupDays} Tage; gelöschte Konten bleiben gelöscht, wenn eine Sicherung eingespielt wird</td></tr></table>
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen aus berechtigtem Interesse (Art. 21 DSGVO). Dein Konto und alle Spieldaten löschst du selbst unter Einstellungen → Konto → Konto und Daten löschen. Für alles andere schreib an ${mail}. Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, etwa in deinem Land oder bei der für uns zuständigen: ${esc(L.authority.de)}, ${esc(L.authority.addr)}.</p>
<h2>Alter</h2>
<p>Das Spiel richtet sich an Spieler ab ${L.minAge} Jahren. Jüngere dürfen die Online-Funktionen nur mit Zustimmung der Eltern nutzen.</p>
<h2>Änderungen</h2>
<p>Wir passen diese Erklärung an, wenn sich das Spiel oder die Rechtslage ändert. Die aktuelle Fassung steht immer auf dieser Seite.</p>`,
    en: `<p class="meta">${G} · Last updated: ${date.en}</p>${open ? note.en : ""}
<h2>Who is responsible</h2>
<p>${who("en")} ("we", "us"). See also the <a href="imprint.html">Legal Notice</a>.</p>
<h2>Overview</h2>
<p>${G} is a browser game. You can play without registering. We do not use analytics, advertising trackers or social-media plugins. Fonts and libraries are served from our own website, not from third parties. We do not set cookies.</p>
<h2>Data stored on your device</h2>
<p>The game stores its state in your browser's local storage: progress, unlocked items, settings (sound, language, graphics), the login token for the game server and match results that could not be sent yet. This is necessary to provide the game (Art. 6(1)(b) GDPR; § 25(2) no. 2 TDDDG). You can delete it at any time in your browser settings or in the game under Settings → Delete progress.</p>
<h2>Hosting</h2>
<p>The website is hosted on GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr. St, San Francisco, CA 94107, USA). When you open the page, your browser sends technical data (IP address, time, requested file, browser type) to GitHub, which processes it to deliver the page and protect its service. Legal basis: our legitimate interest in providing the website (Art. 6(1)(f) GDPR). GitHub may process data in the USA and is certified under the EU-U.S. Data Privacy Framework.</p>
<h2>Player account and game server</h2>
<p>We use Supabase (Supabase, Inc.; servers in the EU, Frankfurt, Germany) as our game server. When you first start the game, a guest account is created automatically. We process:</p>
<ul>
<li>Account: a random user ID; if you save your progress, your e-mail address and a password hash (we never see your password).</li>
<li>Game data: player name, level, coins and gems, items, head levels, season pass, tasks, achievements, match results, ratings, leaderboard entries, friends and friend requests, time of last activity.</li>
<li>Technical data: IP address and request metadata in Supabase's server logs, kept briefly for security and troubleshooting.</li>
</ul>
<p>Purpose: providing the game, saving progress across devices, fair matchmaking, leaderboards, preventing cheating and abuse (for example daily limits and plausibility checks). Legal basis: performance of the contract (Art. 6(1)(b) GDPR) and our legitimate interest in a fair and secure game (Art. 6(1)(f) GDPR).</p>
<p>Visible to others: player name, level, league and rating, and leaderboard entries. Friends see when you were last online.</p>
<p>Guest accounts without purchases are deleted automatically after ${L.guestDays} days of inactivity.</p>
${captcha ? turn.en : ""}
<h2>Online matches with other players</h2>
<p>Online matches run directly between the two players' browsers (peer-to-peer, WebRTC). To establish the connection, the game uses the PeerJS signalling server (0.peerjs.com) and helper servers (STUN by Google and Cloudflare, TURN relay by PeerJS). During a match your opponent's browser receives your IP address, as with any direct connection. If no direct connection is possible, data is relayed through the TURN server. Legal basis: performance of the contract (Art. 6(1)(b) GDPR). If you do not want this, do not play online.</p>
<h2>Purchases</h2>
${pay.en}
<h2>E-mails</h2>
<p>If you save your progress with an e-mail address, we send you a confirmation and, on request, password-reset e-mails through Supabase. We do not send newsletters.</p>
<h2>Recipients and transfers outside the EU</h2>
<p>The providers named above process data on our behalf (data processing under Art. 28 GDPR) or as independent controllers (${payments ? "Stripe for payments, " : ""}your opponent's browser during a match). Where providers are located in the USA, transfers rely on the EU-U.S. Data Privacy Framework or standard contractual clauses.</p>
<h2>Retention</h2>
<table><tr><th>Data</th><th>Kept until</th></tr>
<tr><td>Guest account without purchases</td><td>${L.guestDays} days without activity</td></tr>
<tr><td>Saved account and game data</td><td>you delete your account</td></tr>
${payments ? `<tr><td>Purchase records</td><td>10 years (legal obligation), without profile link after account deletion</td></tr>\n` : ""}<tr><td>Short-lived security data (limits, duplicate-request protection)</td><td>1–2 days</td></tr>
<tr><td>Backups</td><td>${L.backupDays} days; deleted accounts stay deleted when a backup is restored</td></tr></table>
<h2>Your rights</h2>
<p>You have the right to access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20) and to object to processing based on legitimate interests (Art. 21 GDPR). You can delete your account and all game data yourself under Settings → Account → Delete account and data. For everything else, write to ${mail}. You can also lodge a complaint with a data protection supervisory authority, for example in your country or the one responsible for us: ${esc(L.authority.en)}, ${esc(L.authority.addr)}, Germany.</p>
<h2>Age</h2>
<p>The game is intended for players aged ${L.minAge} and over. Younger players may only use the online features with a parent's or guardian's consent.</p>
<h2>Changes</h2>
<p>We update this policy when the game or the law changes. The current version is always available on this page.</p>`,
  };

  const buy = {
    de: payments ? `<h2>Käufe und Bezahlung</h2>
<p>Käufe laufen über Stripe. Der Vertrag kommt mit dem Abschluss der Zahlung zustande. Gekaufte Juwelen oder Gegenstände erscheinen direkt nach der Zahlungsbestätigung in deinem Konto. Preise werden vor dem Kauf in Euro inklusive Umsatzsteuer angezeigt.</p>
<h2>Widerrufsrecht (Verbraucher in der EU)</h2>
<p>Als Verbraucher hast du grundsätzlich ein 14-tägiges Widerrufsrecht. Bei digitalen Inhalten erlischt es, sobald wir mit der Lieferung beginnen (Gutschrift im Konto), nachdem du ausdrücklich zugestimmt hast, dass wir vor Ablauf der Frist beginnen, und bestätigt hast, dass du dadurch dein Widerrufsrecht verlierst (§ 356 Abs. 5 BGB). Diese Zustimmung holen wir vor der Zahlung ein. Widerrufsbelehrung und Muster-Widerrufsformular: ${ph("WIDERRUFSBELEHRUNG UND MUSTERFORMULAR")}</p>
<h2>Erstattungen und Rückbuchungen</h2>
<p>Wird eine Zahlung erstattet oder zurückgebucht, entfernen wir die daraus erhaltenen Juwelen und Gegenstände. Hast du die Juwelen schon ausgegeben, zeigt dein Konto eine Juwelen-Schuld, die mit künftigen Juwelen verrechnet wird. Wiederholte oder missbräuchliche Rückbuchungen können zur Sperre führen.</p>` : "",
    en: payments ? `<h2>Purchases and payment</h2>
<p>Purchases are made through Stripe. The contract is concluded when you complete the payment. Purchased gems or items are credited to your account immediately after payment confirmation. Prices are shown in euros including VAT before you buy.</p>
<h2>Right of withdrawal (EU consumers)</h2>
<p>As a consumer you generally have a 14-day right of withdrawal. For digital content it expires when we begin delivery (credit to your account) after you have expressly agreed that we begin before the withdrawal period ends and confirmed that you thereby lose your right of withdrawal (§ 356(5) BGB). We ask for this consent before payment. Withdrawal notice and model form: ${ph("WITHDRAWAL NOTICE AND MODEL FORM")}</p>
<h2>Refunds and chargebacks</h2>
<p>If a payment is refunded or charged back, the gems and items received from it are removed. If you have already spent those gems, your account shows a gem debt that is settled from future gems. Repeated or abusive chargebacks may lead to suspension.</p>` : "",
  };

  const terms = {
    title: { de: "Nutzungsbedingungen", en: "Terms of Use" },
    de: `<p class="meta">${G} · Stand: ${date.de}</p>${open ? note.de : ""}
<h2>Geltungsbereich</h2>
<p>Diese Bedingungen gelten für die Nutzung des Browserspiels ${G} („das Spiel“), angeboten von ${esc(L.operator)} (siehe <a href="imprint.html">Impressum</a>). Mit dem Spielen akzeptierst du sie. Zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben unberührt.</p>
<h2>Alter</h2>
<p>Das Spiel richtet sich an Spieler ab ${L.minAge} Jahren. Jüngere brauchen für ein Konto und Online-Spiele die Zustimmung ihrer Eltern.</p>
<h2>Konten</h2>
<ul>
<li>Du kannst als Gast spielen. Ein Gastkonto hängt an deinem Browser; löschst du die Browserdaten, kann es verloren gehen. Gastkonten ohne Käufe werden nach ${L.guestDays} Tagen ohne Aktivität gelöscht.</li>
<li>Um deinen Fortschritt zu sichern oder Ranked zu spielen, sicherst du dein Konto mit einer E-Mail-Adresse. Halte deine Zugangsdaten geheim.</li>
<li>Du darfst mehrere Geräte nutzen, aber keine Konten anlegen, um dir unfaire Vorteile zu verschaffen (z. B. Wertung hochtreiben, Belohnungen sammeln).</li>
<li>Du kannst dein Konto jederzeit im Spiel löschen (Einstellungen → Konto).</li>
</ul>
<h2>Fair Play</h2>
<p>Verboten sind: Schummeln, Manipulation des Spiels oder seines Netzwerkverkehrs, Bots und Skripte, Ausnutzen von Fehlern, abgesprochene Ergebnisse, beleidigende Spielernamen und Belästigung. Wir können Fortschritt zurücksetzen, unfair erlangte Belohnungen entfernen und Konten sperren oder löschen, die gegen diese Regeln verstoßen. Ergebnisse von Online-Spielen prüft der Server; widersprüchliche oder unplausible Meldungen werden unter Umständen nicht gewertet.</p>
<h2>Virtuelle Gegenstände und Währungen</h2>
<ul>
<li>Das Spiel hat zwei virtuelle Währungen: Münzen und Juwelen. ${payments ? "Münzen gibt es nur durch Spielen, Juwelen durch Kauf oder selten im Spiel." : "Beide gibt es nur im Spiel, nicht für echtes Geld."}</li>
<li>Virtuelle Währungen und Gegenstände (Köpfe, Bälle, Arenen, Kosmetik, Saison-Pass, Kopf-Level) sind eine nicht übertragbare, widerrufliche Lizenz zur Nutzung im Spiel. Sie haben keinen Geldwert, können nicht in Geld getauscht, verkauft oder übertragen werden und werden beim Löschen des Kontos nicht erstattet, soweit das Gesetz nichts anderes vorschreibt.</li>
<li>Kopf-Level verbessern die Werte eines Kopfes im Spiel um bis zu 25 %. Die Gegnersuche richtet sich nur nach der Wertung.</li>
<li>Wir können Balance, Preise und Inhalte des Spiels ändern.${payments ? " Entfernen wir einen für echtes Geld gekauften Gegenstand dauerhaft, erhältst du gleichwertigen Ersatz oder eine Erstattung des Restwerts." : ""}</li>
</ul>
${buy.de}
<h2>Verfügbarkeit</h2>
<p>Wir stellen das Spiel bereit, wie es ist, und bemühen uns, es verfügbar zu halten, garantieren aber keine ununterbrochene Verfügbarkeit. Online-Funktionen hängen von Diensten Dritter ab. Wir können das Spiel mit mindestens 30 Tagen Vorankündigung im Spiel einstellen.${payments ? " Nicht verbrauchte gekaufte Juwelen erstatten wir dann auf Anfrage anteilig." : ""}</p>
<h2>Haftung</h2>
<p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Vertragspflichten, begrenzt auf den typischen, vorhersehbaren Schaden. Im Übrigen ist die Haftung ausgeschlossen.</p>
<h2>Änderungen dieser Bedingungen</h2>
<p>Wir können diese Bedingungen aus triftigem Grund ändern (z. B. neue Funktionen oder Gesetzesänderungen). Wir informieren dich mindestens 30 Tage vorher im Spiel. Widersprichst du nicht innerhalb dieser Frist, gelten die Änderungen; darauf weisen wir in der Mitteilung hin.</p>
<h2>Schlussbestimmungen</h2>
<p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; für Verbraucher nur, soweit dadurch nicht der Schutz zwingender Vorschriften ihres Wohnsitzlandes entzogen wird. Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>`,
    en: `<p class="meta">${G} · Last updated: ${date.en}</p>${open ? note.en : ""}
<h2>Scope</h2>
<p>These terms apply to the use of the browser game ${G} (the "Game") provided by ${esc(L.operator)} (see <a href="imprint.html">Legal Notice</a>). By playing you accept them. Mandatory consumer protection law of your country of residence remains unaffected.</p>
<h2>Age</h2>
<p>The Game is intended for players aged ${L.minAge} and over. Younger players need a parent's or guardian's consent to create an account and play online.</p>
<h2>Accounts</h2>
<ul>
<li>You can play as a guest. A guest account is tied to your browser; if you clear your browser data, it may be lost. Guest accounts without purchases are deleted after ${L.guestDays} days of inactivity.</li>
<li>To protect your progress or play Ranked, you save your account with an e-mail address. Keep your login details confidential.</li>
<li>You may use several devices but must not create accounts to gain unfair advantages (for example to boost a rating or collect rewards).</li>
<li>You can delete your account at any time in the Game (Settings → Account).</li>
</ul>
<h2>Fair play</h2>
<p>Prohibited: cheating, manipulating the Game or its network traffic, bots and scripts, exploiting bugs, arranging results, offensive player names and harassment. We may reset progress, remove rewards obtained unfairly, and suspend or delete accounts that break these rules. Results of online matches are checked by the server; contradictory or implausible reports may not be rated.</p>
<h2>Virtual items and currencies</h2>
<ul>
<li>The Game has two virtual currencies: coins and gems. ${payments ? "Coins are earned only by playing; gems are bought or rarely earned in the Game." : "Both are earned only in the Game, not with real money."}</li>
<li>Virtual currencies and items (heads, balls, arenas, cosmetics, season pass, head levels) are a non-transferable, revocable licence to use them in the Game. They have no monetary value, cannot be exchanged for money, sold or transferred, and are not refunded when an account is deleted, except where required by law.</li>
<li>Head levels improve a head's in-game attributes by up to 25 %. Matchmaking is based on rating only.</li>
<li>We may change the balance, prices and content of the Game.${payments ? " If an item you bought for real money is removed permanently, you receive an equivalent replacement or a refund of the remaining value." : ""}</li>
</ul>
${buy.en}
<h2>Availability</h2>
<p>We provide the Game as it is and try to keep it available, but do not guarantee uninterrupted availability. Online features depend on third-party services. We may end the Game with at least 30 days' notice in the Game.${payments ? " Unused paid gems will then be refunded proportionally on request." : ""}</p>
<h2>Liability</h2>
<p>We are liable without limitation for intent and gross negligence, for injury to life, body or health, and under the German Product Liability Act. For slight negligence we are liable only for breach of essential contractual obligations, limited to the typical, foreseeable damage. Otherwise our liability is excluded.</p>
<h2>Changes to these terms</h2>
<p>We may change these terms for valid reasons (for example new features or legal changes). We will inform you in the Game at least 30 days in advance. If you do not object within this period, the changes apply; we will point out this consequence in the notice.</p>
<h2>Final provisions</h2>
<p>German law applies, excluding the UN Convention on Contracts for the International Sale of Goods; for consumers only insofar as this does not deprive them of the protection of the mandatory law of their country of residence. We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>`,
  };

  const NAV = { de: { back: "← Zurück zum Spiel", other: "English" }, en: { back: "← Back to the game", other: "Deutsch" } };
  const docs = { imprint, privacy, terms };
  const page = key => {
    const d = docs[key];
    const nav = lang => `<nav data-l="${lang}"><a href="../">${NAV[lang].back}</a>${Object.keys(docs).filter(k => k !== key).map(k => `<a href="${k}.html">${docs[k].title[lang]}</a>`).join("")}<a href="?lang=${lang === "de" ? "en" : "de"}" lang="${lang === "de" ? "en" : "de"}">${NAV[lang].other}</a></nav>`;
    return `<!doctype html>
<!-- ERZEUGT von tools/gen-legal.mjs. Nicht von Hand ändern: dort anpassen, dann npm run legal. -->
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${d.title.de} / ${d.title.en} – ${G}</title>
<link rel="stylesheet" href="style.css">
<script>
// Sprache: ?lang=, sonst die Spielsprache, sonst der Browser. Ohne Skript stehen beide Fassungen untereinander.
(function () {
  var ok = function (x) { return x === "de" || x === "en"; }, l = null;
  try { l = new URLSearchParams(location.search).get("lang"); } catch (e) { l = null; }
  if (!ok(l)) { try { l = (JSON.parse(localStorage.getItem("kopfball-duell-save-v2") || "{}") || {}).lang; } catch (e) { l = null; } }
  if (!ok(l)) { var ls = navigator.languages || [navigator.language]; l = "en"; for (var i = 0; i < ls.length; i++) { var k = String(ls[i] || "").slice(0, 2).toLowerCase(); if (ok(k)) { l = k; break; } } }
  document.documentElement.lang = l; document.documentElement.setAttribute("data-show", l);
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("nav a[href$='.html']").forEach(function (a) { a.href = a.getAttribute("href") + "?lang=" + l; });
  });
})();
</script>
</head>
<body>
<main>
${["de", "en"].map(lang => `<section data-l="${lang}" lang="${lang}">
${nav(lang)}
<div class="card">
<h1>${d.title[lang]}</h1>
${d[lang]}
</div>
</section>`).join("\n")}
</main>
</body>
</html>
`;
  };
  return { "imprint.html": page("imprint"), "privacy.html": page("privacy"), "terms.html": page("terms") };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [f, html] of Object.entries(legalPages())) writeFileSync(new URL("../legal/" + f, import.meta.url), html);
  console.log("legal/*.html geschrieben" + (LEGAL.email ? "" : " (E-Mail fehlt noch: Platzhalter)"));   // i18n-ok
}
