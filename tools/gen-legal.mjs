// Erzeugt die Rechtsseiten legal/imprint.html, legal/privacy.html und legal/terms.html (deutsch und englisch).
// Alles, was sich ändern kann (Spielname, Anbieter, E-Mail, Käufe an/aus), steht hier in LEGAL bzw. kommt aus der
// Konfiguration des Spiels. Nach einer Änderung: `npm run legal`. Ein Test prüft, dass die Seiten aktuell sind.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAYMENTS } from "../js/content/config.js";
import { BACKEND } from "../js/content/backend.js";

export const LEGAL = {
  game: "Headstars",        // Spielname (Domain headstars.app)
  operator: "Louis-Deniel Rost",
  address: ["c/o flexdienst – #10303", "Kurt-Schumacher-Straße 76", "67663 Kaiserslautern"],
  country: { de: "Deutschland", en: "Germany" },
  email: "support@headstars.app",   // Kontakt; leer = gelber Platzhalter
  updated: "2026-11-11",   // Stand der Fassung (JJJJ-MM-TT)
  // Datenschutz-Aufsichtsbehörde am Sitz des Anbieters (Rheinland-Pfalz)
  authority: { de: "Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz",
    en: "the State Commissioner for Data Protection and Freedom of Information of Rhineland-Palatinate (LfDI Rheinland-Pfalz)",
    addr: "Hintere Bleiche 34, 55116 Mainz" },
  minAge: 16,
  guestDays: 90,            // supabase/migrations/20261105120500_service.sql (Wartung)
  statsDays: 30,            // Nutzungsereignisse, danach nur Tagessummen (supabase/migrations/20261112130000_retention.sql)
  backupDays: 30,           // verschlüsselte Sicherungen (supabase/ops/backup.sh) höchstens so lange aufheben
  mailer: { de: "Resend (Resend, Inc., USA)", en: "Resend (Resend, Inc., USA)" },   // verschickt die Code-Mails im Auftrag von Supabase
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ph = s => `<span class="ph">[${esc(s)}]</span>`;

export function legalPages({ L = LEGAL, payments = PAYMENTS, captcha = !!BACKEND.captchaSiteKey } = {}) {
  const mail = L.email ? `<a href="mailto:${esc(L.email)}">${esc(L.email)}</a>` : ph("E-MAIL");
  const date = { de: L.updated.split("-").reverse().join("."), en: L.updated };
  const addr = lang => [...L.address, L.country[lang]].map(esc).join("<br>");
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
<p>Email: ${mail}</p>
<h2>Consumer dispute resolution</h2>
<p>We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>`,
  };

  const pay = {
    de: `<p><b>Käufe.</b> Zahlungen wickelt Stripe ab; deine Zahlungsdaten gibst du direkt dort ein, wir erhalten keine Karten- oder Kontodaten. Wir speichern, was du wann gekauft hast. Rechtsgrundlage: Vertrag und gesetzliche Aufbewahrungspflichten (Art. 6 Abs. 1 lit. b und c DSGVO).</p>`,
    en: `<p><b>Purchases.</b> Payments are processed by Stripe; you enter your payment details directly there and we never receive card or bank details. We store what you bought and when. Legal basis: contract and statutory retention duties (Art. 6(1)(b) and (c) GDPR).</p>`,
  };
  const turn = {
    de: `<p><b>Schutz vor Bots.</b> Beim Anlegen eines Gastkontos prüft Cloudflare Turnstile (Cloudflare, Inc., USA) anhand technischer Merkmale deines Browsers und deiner Verbindung (z. B. IP-Adresse, Browser- und Geräteangaben), ob ein Mensch spielt. Dafür lädt das Spiel ein Skript von Cloudflare. Ohne diese Prüfung kann kein Gastkonto angelegt werden, du kannst dann nur ohne Online-Funktionen spielen. Rechtsgrundlage: berechtigtes Interesse am Schutz des Dienstes vor automatisierten Anmeldungen (Art. 6 Abs. 1 lit. f DSGVO); der Zugriff auf dein Gerät ist dafür unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Mehr: <a href="https://www.cloudflare.com/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.</p>`,
    en: `<p><b>Bot protection.</b> When a guest account is created, Cloudflare Turnstile (Cloudflare, Inc., USA) checks technical characteristics of your browser and connection (e.g. IP address, browser and device details) to tell humans from bots. For this, the game loads a script from Cloudflare. Without this check no guest account can be created, and you can only play without online features. Legal basis: legitimate interest in protecting the service against automated sign-ups (Art. 6(1)(f) GDPR); access to your device is strictly necessary for this (§ 25(2) no. 2 TDDDG). More: <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy policy</a>.</p>`,
  };
  const ctrl = lang => `<p>${esc(L.operator)}<br>${addr(lang)}<br>${lang === "de" ? "E-Mail" : "Email"}: ${mail}</p>`;

  const privacy = {
    title: { de: "Datenschutzerklärung", en: "Privacy Policy" },
    de: `<p class="meta">${G} · Stand: ${date.de}</p>${open ? note.de : ""}
<h2>Verantwortlicher</h2>
${ctrl("de")}
<h2>Kurz gesagt</h2>
<p>Du kannst ohne Anmeldung spielen. Wir setzen keine Cookies, nutzen kein Tracking durch Dritte und keine Werbung und verarbeiten nur, was für das Spiel und seine Verbesserung nötig ist.</p>
<h2>Was wir wofür verarbeiten</h2>
<p><b>Website.</b> Beim Aufruf verarbeitet unser Hosting-Anbieter technisch notwendige Verbindungsdaten (z. B. IP-Adresse und Zeitpunkt), um die Seite auszuliefern und abzusichern. Rechtsgrundlage: berechtigtes Interesse an einer funktionierenden, sicheren Website (Art. 6 Abs. 1 lit. f DSGVO).</p>
<p><b>Spielstand auf deinem Gerät.</b> Fortschritt und Einstellungen speichert das Spiel im Speicher deines Browsers. Das ist für das Spiel technisch erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst diese Daten jederzeit in deinem Browser löschen.</p>
<p><b>Spielkonto.</b> Beim ersten Start legt das Spiel ein Gastkonto mit einer zufälligen Kennung an. Gespeichert werden dein Spielstand (z. B. Spielername, Fortschritt, Gegenstände und Ergebnisse) und, wenn du dein Konto sicherst, deine E-Mail-Adresse. Spielername, Level und Wertung sehen andere Spieler, etwa in Bestenlisten. Zweck: das Spiel bereitstellen, deinen Fortschritt sichern, faire Spiele ermöglichen und Missbrauch verhindern. Rechtsgrundlage: Vertrag (Art. 6 Abs. 1 lit. b DSGVO), beim Schutz vor Missbrauch unser berechtigtes Interesse (lit. f).</p>
<p><b>Online-Spiele.</b> Online-Spiele laufen direkt zwischen den Geräten der beiden Spieler. Dabei erhält das Gerät deines Gegners deine IP-Adresse. Für den Verbindungsaufbau nutzt das Spiel zwei Arten von Diensten: einen Vermittlungsserver von PeerJS (PeerJS Cloud, 0.peerjs.com), der deine IP-Adresse und eine zufällige Verbindungskennung verarbeitet, um die beiden Geräte zusammenzubringen, und STUN-Server von Cloudflare (Cloudflare, Inc., USA; stun.cloudflare.com) und Google (Google LLC, USA; stun.l.google.com), die deinem Gerät seine öffentliche IP-Adresse mitteilen und dafür diese Adresse verarbeiten. Spielinhalte laufen über keinen dieser Dienste. Lässt dein Netz keine direkte Verbindung zu, laufen die verschlüsselten Spieldaten über einen Relay-Server von Cloudflare (Cloudflare, Inc., USA), der dafür deine IP-Adresse verarbeitet, die Inhalte aber nicht lesen kann. Rechtsgrundlage: Vertrag (Art. 6 Abs. 1 lit. b DSGVO).</p>
<p><b>Nutzungsstatistik.</b> Mit Spielkonto hält das Spiel einzelne Nutzungsereignisse fest, verknüpft nur mit der zufälligen Kennung deines Kontos: den ersten Besuch mit der groben Herkunft des Links (z. B. „Einladungslink“, „Suchmaschine“ oder eine Kennung aus dem Link, nie die Adresse der verweisenden Seite), einen Besuch pro Tag, gespielte Modi, Gegnersuche (gefunden, abgebrochen, Wartezeit) und ob eine Online-Verbindung direkt, über das Relay oder gar nicht zustande kam. IP-Adresse und Browserangaben speichern wir dafür nicht. Wir werten die Ereignisse nur zusammengefasst aus (z. B. „wie viele neue Spieler kamen gestern über einen Einladungslink“). Zweck: das Spiel betreiben und verbessern. Rechtsgrundlage: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO). Nach ${L.statsDays} Tagen löschen wir die Ereignisse; übrig bleiben nur Tagessummen ohne Bezug zu einer Person.</p>
<p><b>E-Mail.</b> Zum Sichern deines Kontos und zum Anmelden schicken wir dir einen Code per E-Mail. Schreibst du uns, nutzen wir deine Nachricht nur, um dir zu antworten. Rechtsgrundlage: Vertrag bzw. berechtigtes Interesse (Art. 6 Abs. 1 lit. b, f DSGVO). Newsletter verschicken wir nicht.</p>
${payments ? pay.de + "\n" : ""}${captcha ? turn.de + "\n" : ""}<h2>Empfänger</h2>
<p>Wir setzen Dienstleister ein für Hosting und Domain, den Spielserver (Server in der EU), den E-Mail-Versand und den Verbindungsaufbau und Relay bei Online-Spielen (PeerJS, Cloudflare, Google)${captcha ? ", den Schutz vor Bots (Cloudflare)" : ""}${payments ? " sowie für Zahlungen" : ""}. Sie verarbeiten Daten nur, soweit es für ihre Aufgabe nötig ist. Einige sitzen in den USA. Die Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU-Kommission für das EU-U.S. Data Privacy Framework oder auf Standardvertragsklauseln (Art. 45, 46 DSGVO), im Übrigen darauf, dass sie für die von dir gewünschte Verbindung erforderlich ist (Art. 49 Abs. 1 lit. b DSGVO).</p>
<h2>Speicherdauer</h2>
<p>Wir speichern Daten nur so lange, wie es für den Zweck nötig ist: Gastkonten ohne Käufe löschen wir nach ${L.guestDays} Tagen ohne Aktivität, gesicherte Konten, sobald du sie löschst. Einzelne Online-Spiele löschen wir nach 12 Monaten; deine Wertung und Statistik bleiben. Nutzungsereignisse löschen wir nach ${L.statsDays} Tagen (danach nur Tagessummen). Technische Protokolle und Sicherheitsdaten löschen wir nach kurzer Zeit, Sicherungskopien nach spätestens ${L.backupDays} Tagen.${payments ? " Kaufbelege bewahren wir aufgrund gesetzlicher Pflichten 10 Jahre auf." : ""}</p>
<h2>Musst du Daten angeben?</h2>
<p>Nein. Ohne Spielkonto kannst du nur ohne Online-Funktionen spielen, ohne E-Mail-Adresse kannst du dein Konto nicht sichern.</p>
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis 18 und 20 DSGVO). Dein Konto mit allen Spieldaten löschst du selbst im Spiel unter Profil → Konto. Für alles andere schreib an ${mail}. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der für uns zuständigen: ${esc(L.authority.de)}, ${esc(L.authority.addr)}.</p>
<p class="box"><b>Widerspruchsrecht:</b> Verarbeiten wir Daten auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO), kannst du dem aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).</p>
<h2>Keine automatisierten Entscheidungen</h2>
<p>Wir treffen keine Entscheidungen, die ausschließlich auf automatisierter Verarbeitung beruhen und dir gegenüber rechtliche Wirkung entfalten (Art. 22 DSGVO).</p>
<h2>Änderungen</h2>
<p>Wir passen diese Erklärung an, wenn sich das Spiel oder die Rechtslage ändert. Es gilt die Fassung auf dieser Seite.</p>`,
    en: `<p class="meta">${G} · Last updated: ${date.en}</p>${open ? note.en : ""}
<h2>Controller</h2>
${ctrl("en")}
<h2>In short</h2>
<p>You can play without registering. We set no cookies, use no third-party tracking and no advertising, and only process what the game and its improvement need.</p>
<h2>What we process and why</h2>
<p><b>Website.</b> When you open the site, our hosting provider processes technically necessary connection data (e.g. IP address and time) to deliver and secure the page. Legal basis: legitimate interest in a working, secure website (Art. 6(1)(f) GDPR).</p>
<p><b>Game data on your device.</b> The game stores your progress and settings in your browser's storage. This is technically required for the game (§ 25(2) no. 2 TDDDG). You can delete this data in your browser at any time.</p>
<p><b>Player account.</b> When you first start the game, it creates a guest account with a random ID. We store your game data (e.g. player name, progress, items and results) and, if you save your account, your email address. Other players see your player name, level and rating, for example on leaderboards. Purpose: providing the game, saving your progress, enabling fair matches and preventing abuse. Legal basis: contract (Art. 6(1)(b) GDPR); for abuse prevention, our legitimate interest (point (f)).</p>
<p><b>Online matches.</b> Online matches run directly between the two players' devices. Your opponent's device therefore receives your IP address. To set up the connection, the game uses two kinds of services: a PeerJS broker server (PeerJS Cloud, 0.peerjs.com), which processes your IP address and a random connection ID to bring the two devices together, and STUN servers operated by Cloudflare (Cloudflare, Inc., USA; stun.cloudflare.com) and Google (Google LLC, USA; stun.l.google.com), which tell your device its public IP address and process that address for this purpose. No game content passes through these services. If your network does not allow a direct connection, the encrypted game data passes through a relay server operated by Cloudflare (Cloudflare, Inc., USA), which processes your IP address for this but cannot read the content. Legal basis: contract (Art. 6(1)(b) GDPR).</p>
<p><b>Usage statistics.</b> With a player account, the game records individual usage events, linked only to your account's random ID: the first visit with the rough origin of the link (e.g. "invite link", "search engine" or an identifier from the link, never the address of the referring page), one visit per day, modes played, matchmaking (found, cancelled, waiting time) and whether an online connection was direct, via the relay or failed. We do not store your IP address or browser details for this. We only evaluate the events in aggregated form (e.g. "how many new players came via an invite link yesterday"). Purpose: running and improving the game. Legal basis: legitimate interest (Art. 6(1)(f) GDPR). After ${L.statsDays} days we delete the events; only daily totals without reference to any person remain.</p>
<p><b>Email.</b> To save your account or sign in, we send you a code by email. If you write to us, we only use your message to reply. Legal basis: contract or legitimate interest (Art. 6(1)(b), (f) GDPR). We do not send newsletters.</p>
${payments ? pay.en + "\n" : ""}${captcha ? turn.en + "\n" : ""}<h2>Recipients</h2>
<p>We use service providers for hosting and domain, the game server (servers in the EU), sending emails and setting up and relaying online matches (PeerJS, Cloudflare, Google)${captcha ? ", bot protection (Cloudflare)" : ""}${payments ? ", and for payments" : ""}. They only process data as far as needed for their task. Some are located in the USA. Transfers rely on the European Commission's adequacy decision for the EU-U.S. Data Privacy Framework or on standard contractual clauses (Art. 45, 46 GDPR), and otherwise on being necessary for the connection you request (Art. 49(1)(b) GDPR).</p>
<h2>Retention</h2>
<p>We only keep data as long as needed for its purpose: guest accounts without purchases are deleted after ${L.guestDays} days without activity, saved accounts as soon as you delete them. Individual online matches are deleted after 12 months; your rating and statistics remain. Usage events are deleted after ${L.statsDays} days (only daily totals remain). Technical logs and security data are deleted after a short time, backups after ${L.backupDays} days at the latest.${payments ? " Purchase records are kept for 10 years as required by law." : ""}</p>
<h2>Do you have to provide data?</h2>
<p>No. Without a player account you can only play without online features; without an email address you cannot save your account.</p>
<h2>Your rights</h2>
<p>You have the right to access, rectification, erasure, restriction of processing and data portability (Art. 15 to 18 and 20 GDPR). You can delete your account and all game data yourself in the game under Profile → Account. For everything else, write to ${mail}. You can also lodge a complaint with a data protection supervisory authority, for example the one responsible for us: ${esc(L.authority.en)}, ${esc(L.authority.addr)}, Germany.</p>
<p class="box"><b>Right to object:</b> Where we process data based on legitimate interests (Art. 6(1)(f) GDPR), you may object at any time on grounds relating to your particular situation (Art. 21 GDPR).</p>
<h2>No automated decisions</h2>
<p>We do not make decisions based solely on automated processing that have legal effects on you (Art. 22 GDPR).</p>
<h2>Changes</h2>
<p>We update this policy when the game or the law changes. The version on this page applies.</p>`,
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
<h2>1. Geltungsbereich</h2>
<p>Diese Bedingungen gelten für die Nutzung des Browserspiels ${G} („das Spiel“), angeboten von ${esc(L.operator)} („wir“, siehe <a href="imprint.html">Impressum</a>). Mit dem Spielen akzeptierst du sie. Zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben unberührt.</p>
<h2>2. Das Spiel</h2>
<ul>
<li>Das Spiel ist kostenlos${payments ? "; einzelne Inhalte kannst du optional kaufen" : ""}. Wir stellen es bereit, wie es ist, und entwickeln es laufend weiter. Funktionen, Inhalte und Spielbalance können sich dabei ändern.</li>
<li>Online-Spiele laufen direkt zwischen den Geräten der Spieler (Peer-to-Peer). Dabei sehen die Geräte der Mitspieler technisch deine IP-Adresse. Den Inhalt und das Verhalten anderer Spieler kontrollieren wir nicht.</li>
<li>Für die Sicherheit deines Geräts und Browsers (z. B. Updates) bist du selbst verantwortlich.</li>
</ul>
<h2>3. Alter</h2>
<p>Das Spiel richtet sich an Spieler ab ${L.minAge} Jahren. Jüngere brauchen für ein Konto und Online-Spiele die Zustimmung ihrer Eltern.</p>
<h2>4. Konto</h2>
<ul>
<li>Du kannst als Gast spielen. Ein Gastkonto hängt an deinem Browser; löschst du die Browserdaten, kann es verloren gehen. Gastkonten ohne Käufe werden nach ${L.guestDays} Tagen ohne Aktivität gelöscht.</li>
<li>Sicherst du dein Konto mit einer E-Mail-Adresse, meldest du dich mit einem Code aus einer Mail an. Schütze den Zugang zu deinem Postfach; was über dein Konto geschieht, wird dir zugerechnet, soweit du es zu vertreten hast.</li>
<li>Jedes Konto ist persönlich. Verkauf, Tausch oder Weitergabe von Konten ist nicht erlaubt.</li>
<li>Du kannst dein Konto jederzeit im Spiel löschen (Profil → Konto).</li>
</ul>
<h2>5. Regeln für ein faires und sicheres Spiel</h2>
<p>Verboten ist insbesondere:</p>
<ul>
<li>Schummeln: Bots, Skripte, Makros, Cheat-Programme, manipulierte Spiel- oder Netzwerkdaten, Ausnutzen von Fehlern, abgesprochene Ergebnisse oder mehrere Konten, um dir Vorteile zu verschaffen.</li>
<li>Angriffe auf das Spiel, unsere Server oder andere Spieler: Schadsoftware oder schädliche Daten übertragen, Überlastungsangriffe, Sicherheitsmaßnahmen umgehen, unbefugt auf Systeme oder Daten zugreifen, IP-Adressen anderer Spieler ausspähen oder für Angriffe nutzen.</li>
<li>Automatisierte Zugriffe (z. B. Auslesen von Daten), soweit sie nicht für das normale Spielen nötig sind.</li>
<li>Beleidigende, diskriminierende, extremistische oder sonst rechtswidrige Spielernamen, Belästigung anderer Spieler und das Vortäuschen einer fremden Identität, auch unserer.</li>
<li>Gewerbliche Nutzung ohne unsere Zustimmung, etwa der Handel mit Konten oder Gegenständen oder bezahltes „Hochspielen“.</li>
<li>Jede Nutzung, die gegen Gesetze oder Rechte Dritter verstößt.</li>
</ul>
<p>Fehler und Sicherheitslücken meldest du bitte an ${mail}, statt sie auszunutzen.</p>
<h2>6. Folgen von Verstößen</h2>
<p>Bei einem Verstoß können wir je nach Schwere: Ergebnisse nicht werten, Fortschritt zurücksetzen, unfair erlangte Belohnungen entfernen, deinen Spielernamen ändern, dein Konto vorübergehend sperren oder löschen. Bei schweren Verstößen auch ohne vorherige Warnung. Ergebnisse von Online-Spielen prüft der Server; widersprüchliche oder unplausible Meldungen werden unter Umständen nicht gewertet. Verletzt du schuldhaft diese Regeln oder Rechte Dritter, haftest du für den entstandenen Schaden und stellst uns von Ansprüchen Dritter frei, die daraus entstehen, einschließlich angemessener Kosten der Rechtsverteidigung.</p>
<h2>7. Rechte am Spiel</h2>
<p>Alle Rechte am Spiel (Programm, Grafiken, Figuren, Töne, Name und Logo) liegen bei uns oder unseren Lizenzgebern. Du darfst das Spiel privat und nicht gewerblich spielen. Videos, Streams und Screenshots vom Spiel sind erlaubt. Kopieren, Verändern, Weiterverbreiten oder das Nachbauen des Spiels oder seiner Teile ist nur erlaubt, soweit das Gesetz es zwingend gestattet.</p>
<h2>8. Virtuelle Gegenstände und Währungen</h2>
<ul>
<li>Das Spiel hat zwei virtuelle Währungen: Münzen und Juwelen. ${payments ? "Münzen gibt es nur durch Spielen, Juwelen durch Kauf oder selten im Spiel." : "Beide gibt es nur im Spiel, nicht für echtes Geld."}</li>
<li>Virtuelle Währungen und Gegenstände (Köpfe, Bälle, Arenen, Kosmetik, Saison-Pass, Kopf-Level) sind eine nicht übertragbare, widerrufliche Lizenz zur Nutzung im Spiel. Sie haben keinen Geldwert, können nicht in Geld getauscht, verkauft oder übertragen werden und werden beim Löschen des Kontos nicht erstattet, soweit das Gesetz nichts anderes vorschreibt.</li>
<li>Kopf-Level verbessern die Werte eines Kopfes im Spiel um bis zu 25 %. Die Gegnersuche richtet sich nur nach der Wertung.</li>
<li>Wir können Balance, Preise und Inhalte des Spiels ändern.${payments ? " Entfernen wir einen für echtes Geld gekauften Gegenstand dauerhaft, erhältst du gleichwertigen Ersatz oder eine Erstattung des Restwerts." : ""}</li>
</ul>
${buy.de}
<h2>9. Verfügbarkeit</h2>
<p>Wir bemühen uns, das Spiel verfügbar zu halten, garantieren aber keine ununterbrochene oder fehlerfreie Verfügbarkeit. Wartung, Störungen und Dienste Dritter (z. B. Internet, Server, Verbindungsdienste für Online-Spiele) können die Nutzung einschränken. Wir können das Spiel mit mindestens 30 Tagen Vorankündigung im Spiel einstellen.${payments ? " Nicht verbrauchte gekaufte Juwelen erstatten wir dann auf Anfrage anteilig." : ""}</p>
<h2>10. Gesundheit</h2>
<p>Das Spiel enthält schnelle Bewegungen und Lichteffekte. Wenn du zu lichtbedingten Anfällen neigst, sprich vor dem Spielen mit einem Arzt. Mach regelmäßig Pausen und hör bei Schwindel oder Unwohlsein sofort auf.</p>
<h2>11. Haftung</h2>
<ul>
<li>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz und soweit wir eine Garantie übernommen haben.</li>
<li>Im Übrigen haften wir bei leichter Fahrlässigkeit nur für die Verletzung wesentlicher Pflichten, also solcher, die die Durchführung des Vertrags erst ermöglichen und auf deren Einhaltung du regelmäßig vertrauen darfst, und nur für den typischen, vorhersehbaren Schaden. Soweit wir das Spiel unentgeltlich bereitstellen, haften wir für leichte Fahrlässigkeit nicht.</li>
<li>Für das Verhalten anderer Spieler und für Dienste Dritter, die wir nicht beeinflussen können, sind wir nicht verantwortlich, soweit uns daran kein Verschulden trifft.</li>
<li>Diese Regeln gelten auch für den Verlust von Spielständen oder virtuellen Gegenständen und für die persönliche Haftung unserer Hilfspersonen.</li>
</ul>
<h2>12. Änderungen dieser Bedingungen</h2>
<p>Wir können diese Bedingungen mit Wirkung für die Zukunft ändern, wenn es dafür einen triftigen Grund gibt, etwa neue Funktionen oder geänderte Gesetze. Über Änderungen informieren wir dich im Spiel. Änderungen, die dich wesentlich benachteiligen, gelten erst, wenn du ihnen zustimmst; stimmst du nicht zu, kannst du dein Konto jederzeit löschen.</p>
<h2>13. Schlussbestimmungen</h2>
<p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; für Verbraucher nur, soweit dadurch nicht der Schutz zwingender Vorschriften ihres Wohnsitzlandes entzogen wird. Ist eine Bestimmung unwirksam, bleiben die übrigen wirksam. Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>`,
    en: `<p class="meta">${G} · Last updated: ${date.en}</p>${open ? note.en : ""}
<h2>1. Scope</h2>
<p>These terms apply to the use of the browser game ${G} (the "Game") provided by ${esc(L.operator)} ("we", see <a href="imprint.html">Legal Notice</a>). By playing you accept them. Mandatory consumer protection law of your country of residence remains unaffected.</p>
<h2>2. The Game</h2>
<ul>
<li>The Game is free${payments ? "; some content can optionally be bought" : ""}. We provide it as it is and keep developing it, so features, content and balance may change.</li>
<li>Online matches run directly between the players' devices (peer-to-peer). The other players' devices can therefore technically see your IP address. We do not control what other players do.</li>
<li>You are responsible for the security of your own device and browser (e.g. updates).</li>
</ul>
<h2>3. Age</h2>
<p>The Game is intended for players aged ${L.minAge} and over. Younger players need a parent's or guardian's consent to create an account and play online.</p>
<h2>4. Account</h2>
<ul>
<li>You can play as a guest. A guest account is tied to your browser; if you clear your browser data, it may be lost. Guest accounts without purchases are deleted after ${L.guestDays} days of inactivity.</li>
<li>If you save your account with an email address, you sign in with a code sent by email. Protect access to your mailbox; actions taken through your account are attributed to you insofar as you are responsible for them.</li>
<li>Each account is personal. Selling, trading or handing over accounts is not allowed.</li>
<li>You can delete your account at any time in the Game (Profile → Account).</li>
</ul>
<h2>5. Rules for fair and safe play</h2>
<p>In particular, the following is prohibited:</p>
<ul>
<li>Cheating: bots, scripts, macros, cheat programs, manipulated game or network data, exploiting bugs, arranged results, or multiple accounts to gain an advantage.</li>
<li>Attacks on the Game, our servers or other players: transmitting malware or harmful data, overload (denial-of-service) attacks, circumventing security measures, unauthorised access to systems or data, harvesting other players' IP addresses or using them for attacks.</li>
<li>Automated access (e.g. scraping) beyond what normal play requires.</li>
<li>Offensive, discriminatory, extremist or otherwise unlawful player names, harassing other players, and impersonating others, including us.</li>
<li>Commercial use without our consent, such as trading accounts or items, or paid boosting.</li>
<li>Any use that violates the law or the rights of others.</li>
</ul>
<p>Please report bugs and security issues to ${mail} instead of exploiting them.</p>
<h2>6. Consequences of violations</h2>
<p>Depending on the severity of a violation, we may: not count results, reset progress, remove rewards obtained unfairly, change your player name, or suspend or delete your account, in serious cases without prior warning. Results of online matches are checked by the server; contradictory or implausible reports may not be rated. If you culpably violate these rules or the rights of others, you are liable for the resulting damage and indemnify us against third-party claims arising from it, including reasonable legal defence costs.</p>
<h2>7. Rights in the Game</h2>
<p>All rights in the Game (software, graphics, characters, sounds, name and logo) belong to us or our licensors. You may play the Game privately and non-commercially. Videos, streams and screenshots of the Game are allowed. Copying, modifying, redistributing or recreating the Game or parts of it is only permitted where mandatory law allows it.</p>
<h2>8. Virtual items and currencies</h2>
<ul>
<li>The Game has two virtual currencies: coins and gems. ${payments ? "Coins are earned only by playing; gems are bought or rarely earned in the Game." : "Both are earned only in the Game, not with real money."}</li>
<li>Virtual currencies and items (heads, balls, arenas, cosmetics, season pass, head levels) are a non-transferable, revocable licence to use them in the Game. They have no monetary value, cannot be exchanged for money, sold or transferred, and are not refunded when an account is deleted, except where required by law.</li>
<li>Head levels improve a head's in-game attributes by up to 25 %. Matchmaking is based on rating only.</li>
<li>We may change the balance, prices and content of the Game.${payments ? " If an item you bought for real money is removed permanently, you receive an equivalent replacement or a refund of the remaining value." : ""}</li>
</ul>
${buy.en}
<h2>9. Availability</h2>
<p>We try to keep the Game available but do not guarantee uninterrupted or error-free availability. Maintenance, outages and third-party services (e.g. internet, servers, connection services for online matches) may limit its use. We may end the Game with at least 30 days' notice in the Game.${payments ? " Unused paid gems will then be refunded proportionally on request." : ""}</p>
<h2>10. Health</h2>
<p>The Game contains fast movement and light effects. If you are prone to light-induced seizures, consult a doctor before playing. Take regular breaks and stop immediately if you feel dizzy or unwell.</p>
<h2>11. Liability</h2>
<ul>
<li>We are liable without limitation for intent and gross negligence, for injury to life, body or health, under the German Product Liability Act, and where we have given a guarantee.</li>
<li>Otherwise, for slight negligence we are liable only for breach of essential obligations, i.e. those that make performance of the contract possible in the first place and on which you may regularly rely, and only for the typical, foreseeable damage. Where we provide the Game free of charge, we are not liable for slight negligence.</li>
<li>We are not responsible for the conduct of other players or for third-party services beyond our control, unless we are at fault.</li>
<li>These rules also apply to the loss of game progress or virtual items and to the personal liability of the people we work with.</li>
</ul>
<h2>12. Changes to these terms</h2>
<p>We may change these terms with effect for the future if there is a valid reason, such as new features or changes in the law. We will inform you in the Game. Changes that put you at a significant disadvantage only apply once you agree to them; if you do not agree, you can delete your account at any time.</p>
<h2>13. Final provisions</h2>
<p>German law applies, excluding the UN Convention on Contracts for the International Sale of Goods; for consumers only insofar as this does not deprive them of the protection of the mandatory law of their country of residence. If any provision is invalid, the rest remain valid. We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>`,
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
