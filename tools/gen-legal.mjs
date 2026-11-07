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
  email: "support@headstars.app",   // Kontakt; leer = gelber Platzhalter
  updated: "2026-11-07",
  // Datenschutz-Aufsichtsbehörde am Sitz des Anbieters (Rheinland-Pfalz)
  authority: { de: "Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz",
    en: "the State Commissioner for Data Protection and Freedom of Information of Rhineland-Palatinate (LfDI Rheinland-Pfalz)",
    addr: "Hintere Bleiche 34, 55116 Mainz" },
  minAge: 16,
  guestDays: 90,            // supabase/migrations/20261105120500_service.sql (Wartung)
  backupDays: 30,
  mailer: { de: "Resend (Resend, Inc., USA)", en: "Resend (Resend, Inc., USA)" },   // verschickt die Code-Mails im Auftrag von Supabase           // verschlüsselte Sicherungen (supabase/ops/backup.sh) höchstens so lange aufheben
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
<p>E-mail: ${mail}</p>
<h2>Consumer dispute resolution</h2>
<p>We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>`,
  };

  const pay = {
    de: `<p><b>Käufe.</b> Zahlungen wickelt Stripe ab; deine Zahlungsdaten gibst du direkt dort ein, wir erhalten keine Karten- oder Kontodaten. Wir speichern, was du wann gekauft hast. Rechtsgrundlage: Vertrag und gesetzliche Aufbewahrungspflichten (Art. 6 Abs. 1 lit. b und c DSGVO).</p>`,
    en: `<p><b>Purchases.</b> Payments are processed by Stripe; you enter your payment details directly there and we never receive card or bank details. We store what you bought and when. Legal basis: contract and statutory retention duties (Art. 6(1)(b) and (c) GDPR).</p>`,
  };
  const turn = {
    de: `<p><b>Schutz vor Bots.</b> Beim Anlegen eines Gastkontos prüft ein Dienst anhand technischer Merkmale deines Browsers, ob ein Mensch spielt. Rechtsgrundlage: berechtigtes Interesse am Schutz des Dienstes (Art. 6 Abs. 1 lit. f DSGVO).</p>`,
    en: `<p><b>Bot protection.</b> When a guest account is created, a service checks technical characteristics of your browser to tell humans from bots. Legal basis: legitimate interest in protecting the service (Art. 6(1)(f) GDPR).</p>`,
  };
  const ctrl = lang => `<p>${esc(L.operator)}<br>${addr(lang)}<br>${lang === "de" ? "E-Mail" : "E-mail"}: ${mail}</p>`;

  const privacy = {
    title: { de: "Datenschutzerklärung", en: "Privacy Policy" },
    de: `<p class="meta">${G} · Stand: ${date.de}</p>${open ? note.de : ""}
<h2>Verantwortlicher</h2>
${ctrl("de")}
<h2>Kurz gesagt</h2>
<p>Du kannst ohne Anmeldung spielen. Wir setzen keine Cookies, nutzen kein Tracking und keine Werbung und verarbeiten nur, was für das Spiel nötig ist.</p>
<h2>Was wir wofür verarbeiten</h2>
<p><b>Website.</b> Beim Aufruf verarbeitet unser Hosting-Anbieter technisch notwendige Verbindungsdaten (z. B. IP-Adresse und Zeitpunkt), um die Seite auszuliefern und abzusichern. Rechtsgrundlage: berechtigtes Interesse an einer funktionierenden, sicheren Website (Art. 6 Abs. 1 lit. f DSGVO).</p>
<p><b>Spielstand auf deinem Gerät.</b> Fortschritt und Einstellungen speichert das Spiel im Speicher deines Browsers. Das ist für das Spiel technisch erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst diese Daten jederzeit in deinem Browser löschen.</p>
<p><b>Spielkonto.</b> Beim ersten Start legt das Spiel ein Gastkonto mit einer zufälligen Kennung an. Gespeichert werden dein Spielstand (z. B. Spielername, Fortschritt, Gegenstände und Ergebnisse) und, wenn du dein Konto sicherst, deine E-Mail-Adresse. Spielername, Level und Wertung sehen andere Spieler, etwa in Bestenlisten. Zweck: das Spiel bereitstellen, deinen Fortschritt sichern, faire Spiele ermöglichen und Missbrauch verhindern. Rechtsgrundlage: Vertrag (Art. 6 Abs. 1 lit. b DSGVO), beim Schutz vor Missbrauch unser berechtigtes Interesse (lit. f).</p>
<p><b>Online-Spiele.</b> Online-Spiele laufen direkt zwischen den Geräten der beiden Spieler. Dabei erhält das Gerät deines Gegners deine IP-Adresse; für den Verbindungsaufbau nutzt das Spiel Vermittlungsdienste. Rechtsgrundlage: Vertrag (Art. 6 Abs. 1 lit. b DSGVO).</p>
<p><b>E-Mail.</b> Zum Sichern deines Kontos und zum Anmelden schicken wir dir einen Code per E-Mail. Schreibst du uns, nutzen wir deine Nachricht nur, um dir zu antworten. Rechtsgrundlage: Vertrag bzw. berechtigtes Interesse (Art. 6 Abs. 1 lit. b, f DSGVO). Newsletter verschicken wir nicht.</p>
${payments ? pay.de + "\n" : ""}${captcha ? turn.de + "\n" : ""}<h2>Empfänger</h2>
<p>Wir setzen Dienstleister ein für Hosting und Domain, den Spielserver (Server in der EU), den E-Mail-Versand und den Verbindungsaufbau bei Online-Spielen${payments ? " sowie für Zahlungen" : ""}. Sie verarbeiten Daten nur, soweit es für ihre Aufgabe nötig ist. Einige sitzen in den USA. Die Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU-Kommission für das EU-U.S. Data Privacy Framework oder auf Standardvertragsklauseln (Art. 45, 46 DSGVO), im Übrigen darauf, dass sie für die von dir gewünschte Verbindung erforderlich ist (Art. 49 Abs. 1 lit. b DSGVO).</p>
<h2>Speicherdauer</h2>
<p>Wir speichern Daten nur so lange, wie es für den Zweck nötig ist: Gastkonten ohne Käufe löschen wir nach ${L.guestDays} Tagen ohne Aktivität, gesicherte Konten, sobald du sie löschst. Technische Protokolle und Sicherheitsdaten löschen wir nach kurzer Zeit, Sicherungskopien nach spätestens ${L.backupDays} Tagen.${payments ? " Kaufbelege bewahren wir aufgrund gesetzlicher Pflichten 10 Jahre auf." : ""}</p>
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
<p>You can play without registering. We set no cookies, use no tracking and no advertising, and only process what the game needs.</p>
<h2>What we process and why</h2>
<p><b>Website.</b> When you open the site, our hosting provider processes technically necessary connection data (e.g. IP address and time) to deliver and secure the page. Legal basis: legitimate interest in a working, secure website (Art. 6(1)(f) GDPR).</p>
<p><b>Game data on your device.</b> The game stores your progress and settings in your browser's storage. This is technically required for the game (§ 25(2) no. 2 TDDDG). You can delete this data in your browser at any time.</p>
<p><b>Player account.</b> When you first start the game, it creates a guest account with a random ID. We store your game data (e.g. player name, progress, items and results) and, if you save your account, your e-mail address. Other players see your player name, level and rating, for example on leaderboards. Purpose: providing the game, saving your progress, enabling fair matches and preventing abuse. Legal basis: contract (Art. 6(1)(b) GDPR); for abuse prevention, our legitimate interest (point (f)).</p>
<p><b>Online matches.</b> Online matches run directly between the two players' devices. Your opponent's device therefore receives your IP address; the game uses connection services to set up the match. Legal basis: contract (Art. 6(1)(b) GDPR).</p>
<p><b>E-mail.</b> To save your account or sign in, we send you a code by e-mail. If you write to us, we only use your message to reply. Legal basis: contract or legitimate interest (Art. 6(1)(b), (f) GDPR). We do not send newsletters.</p>
${payments ? pay.en + "\n" : ""}${captcha ? turn.en + "\n" : ""}<h2>Recipients</h2>
<p>We use service providers for hosting and domain, the game server (servers in the EU), sending e-mails and setting up online matches${payments ? ", and for payments" : ""}. They only process data as far as needed for their task. Some are located in the USA. Transfers rely on the European Commission's adequacy decision for the EU-U.S. Data Privacy Framework or on standard contractual clauses (Art. 45, 46 GDPR), and otherwise on being necessary for the connection you request (Art. 49(1)(b) GDPR).</p>
<h2>Retention</h2>
<p>We only keep data as long as needed for its purpose: guest accounts without purchases are deleted after ${L.guestDays} days without activity, saved accounts as soon as you delete them. Technical logs and security data are deleted after a short time, backups after ${L.backupDays} days at the latest.${payments ? " Purchase records are kept for 10 years as required by law." : ""}</p>
<h2>Do you have to provide data?</h2>
<p>No. Without a player account you can only play without online features; without an e-mail address you cannot save your account.</p>
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
<h2>Geltungsbereich</h2>
<p>Diese Bedingungen gelten für die Nutzung des Browserspiels ${G} („das Spiel“), angeboten von ${esc(L.operator)} (siehe <a href="imprint.html">Impressum</a>). Mit dem Spielen akzeptierst du sie. Zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben unberührt.</p>
<h2>Alter</h2>
<p>Das Spiel richtet sich an Spieler ab ${L.minAge} Jahren. Jüngere brauchen für ein Konto und Online-Spiele die Zustimmung ihrer Eltern.</p>
<h2>Konten</h2>
<ul>
<li>Du kannst als Gast spielen. Ein Gastkonto hängt an deinem Browser; löschst du die Browserdaten, kann es verloren gehen. Gastkonten ohne Käufe werden nach ${L.guestDays} Tagen ohne Aktivität gelöscht.</li>
<li>Um deinen Fortschritt zu sichern oder Ranked zu spielen, sicherst du dein Konto mit einer E-Mail-Adresse. Halte deine Zugangsdaten geheim.</li>
<li>Du darfst mehrere Geräte nutzen, aber keine Konten anlegen, um dir unfaire Vorteile zu verschaffen (z. B. Wertung hochtreiben, Belohnungen sammeln).</li>
<li>Du kannst dein Konto jederzeit im Spiel löschen (Profil → Konto).</li>
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
<li>You can delete your account at any time in the Game (Profile → Account).</li>
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
