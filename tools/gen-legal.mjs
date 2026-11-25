// Erzeugt die Rechtsseiten legal/imprint.html (deutsch, englisch), legal/privacy.html und legal/terms.html (deutsch,
// englisch, spanisch, ukrainisch; Deutsch ist maßgeblich, die Übersetzungen sagen das). Alles, was sich ändern kann
// (Spielname, Anbieter, E-Mail, Käufe an/aus), steht hier in LEGAL bzw. kommt aus der Konfiguration des Spiels.
// Nach einer Änderung: `npm run legal`. Ein Test prüft, dass die Seiten aktuell sind und jede Fassung dieselben Abschnitte hat.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAYMENTS } from "../js/content/config.js";
import { BACKEND } from "../js/content/backend.js";
import { pl } from "../js/content/i18n/plural.js";

export const LEGAL = {
  game: "Headstars",        // Spielname (Domain headstars.app)
  operator: "Louis-Deniel Rost",
  address: ["c/o flexdienst – #10303", "Kurt-Schumacher-Straße 76", "67663 Kaiserslautern"],
  country: { de: "Deutschland", en: "Germany", es: "Alemania", uk: "Німеччина" },
  email: "support@headstars.app",   // Kontakt; leer = gelber Platzhalter
  updated: "2026-11-25",   // Stand der Fassung (JJJJ-MM-TT)
  // Datenschutz-Aufsichtsbehörde am Sitz des Anbieters (Rheinland-Pfalz)
  authority: { de: "Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz",
    en: "the State Commissioner for Data Protection and Freedom of Information of Rhineland-Palatinate (LfDI Rheinland-Pfalz)",
    es: "el Comisionado del Estado de Renania-Palatinado para la Protección de Datos y la Libertad de Información (LfDI Rheinland-Pfalz)",
    uk: "Уповноважений землі Рейнланд-Пфальц із захисту даних і свободи інформації (LfDI Rheinland-Pfalz)",
    addr: "Hintere Bleiche 34, 55116 Mainz" },
  minAge: 16,
  guestDays: 90,            // supabase/migrations/20261105120500_service.sql (Wartung)
  statsDays: 30,            // Nutzungsereignisse, danach nur Tagessummen (supabase/migrations/20261112130000_retention.sql)
  backupDays: 30,           // verschlüsselte Sicherungen (supabase/ops/backup.sh) höchstens so lange aufheben
  mailer: { de: "Resend (Resend, Inc., USA)", en: "Resend (Resend, Inc., USA)" },   // verschickt die Code-Mails im Auftrag von Supabase
};
/** Fassungen je Seite; andere Sprachen bekommen Englisch (Skript im Kopf der Seite) */
export const LEGAL_LANGS = { imprint: ["de", "en"], privacy: ["de", "en", "es", "uk"], terms: ["de", "en", "es", "uk"] };
const LANG_NAMES = { de: "Deutsch", en: "English", es: "Español", uk: "Українська" };   // i18n-ok: Eigennamen der Sprachen

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ph = s => `<span class="ph">[${esc(s)}]</span>`;

export function legalPages({ L = LEGAL, payments = PAYMENTS, captcha = !!BACKEND.captchaSiteKey } = {}) {
  const mail = L.email ? `<a href="mailto:${esc(L.email)}">${esc(L.email)}</a>` : ph("E-MAIL");
  const [yy, mm, dd] = L.updated.split("-");
  const date = { de: `${dd}.${mm}.${yy}`, en: L.updated, es: `${dd}/${mm}/${yy}`, uk: `${dd}.${mm}.${yy}` };
  const addr = lang => [...L.address, L.country[lang]].map(esc).join("<br>");
  const G = esc(L.game);
  const open = !L.email;   // Platzhalter offen?
  const note = { de: `<p class="note">Gelb markierte Stellen vor der Veröffentlichung ausfüllen (<code>tools/gen-legal.mjs</code>).</p>`,
    en: `<p class="note">Fill in the yellow placeholders before publishing (<code>tools/gen-legal.mjs</code>).</p>`,
    es: `<p class="note">Rellena los marcadores amarillos antes de publicar (<code>tools/gen-legal.mjs</code>).</p>`,
    uk: `<p class="note">Перед публікацією заповни виділені жовтим місця (<code>tools/gen-legal.mjs</code>).</p>` };
  /** Übersetzung: die deutsche Fassung ist maßgeblich */
  const tr = { de: "",
    en: `\n<p class="meta">This is a translation. If the versions differ, the <a href="?lang=de" lang="de">German version</a> prevails.</p>`,
    es: `\n<p class="meta">Esto es una traducción. Si las versiones difieren, prevalece la <a href="?lang=de" lang="de">versión alemana</a>.</p>`,
    uk: `\n<p class="meta">Це переклад. У разі розбіжностей переважну силу має <a href="?lang=de" lang="de">німецька версія</a>.</p>` };
  const days = { de: n => `${n} Tagen`, en: n => `${n} days`, es: n => `${n} días`, uk: n => pl(n, "день", "дні", "днів") };
  const D = lang => ({ guest: days[lang](L.guestDays), stats: days[lang](L.statsDays), backup: days[lang](L.backupDays) });

  const imprint = {
    title: { de: "Impressum", en: "Legal Notice", es: "Aviso legal", uk: "Відомості про власника" },
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
    es: `<p><b>Compras.</b> Los pagos los gestiona Stripe; introduces tus datos de pago directamente allí y nosotros no recibimos datos de tarjeta ni bancarios. Guardamos qué compraste y cuándo. Base jurídica: contrato y obligaciones legales de conservación (art. 6.1.b) y c) RGPD).</p>`,
    uk: `<p><b>Покупки.</b> Платежі обробляє Stripe; платіжні дані ти вводиш безпосередньо там, ми не отримуємо даних картки чи рахунку. Ми зберігаємо, що і коли було куплено. Правова підстава: договір і встановлені законом обов’язки щодо зберігання (ст. 6 ч. 1 літ. b і c GDPR).</p>`,
  };
  const turn = {
    de: `<p><b>Schutz vor Bots.</b> Beim Anlegen eines Gastkontos prüft Cloudflare Turnstile (Cloudflare, Inc., USA) anhand technischer Merkmale deines Browsers und deiner Verbindung (z. B. IP-Adresse, Browser- und Geräteangaben), ob ein Mensch spielt. Dafür lädt das Spiel ein Skript von Cloudflare. Ohne diese Prüfung kann kein Gastkonto angelegt werden, du kannst dann nur ohne Online-Funktionen spielen. Rechtsgrundlage: berechtigtes Interesse am Schutz des Dienstes vor automatisierten Anmeldungen (Art. 6 Abs. 1 lit. f DSGVO); der Zugriff auf dein Gerät ist dafür unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Mehr: <a href="https://www.cloudflare.com/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.</p>`,
    en: `<p><b>Bot protection.</b> When a guest account is created, Cloudflare Turnstile (Cloudflare, Inc., USA) checks technical characteristics of your browser and connection (e.g. IP address, browser and device details) to tell humans from bots. For this, the game loads a script from Cloudflare. Without this check no guest account can be created, and you can only play without online features. Legal basis: legitimate interest in protecting the service against automated sign-ups (Art. 6(1)(f) GDPR); access to your device is strictly necessary for this (§ 25(2) no. 2 TDDDG). More: <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy policy</a>.</p>`,
    es: `<p><b>Protección contra bots.</b> Al crear una cuenta de invitado, Cloudflare Turnstile (Cloudflare, Inc., EE. UU.) comprueba, a partir de características técnicas de tu navegador y de tu conexión (p. ej., dirección IP, datos del navegador y del dispositivo), si juega una persona. Para ello, el juego carga un script de Cloudflare. Sin esta comprobación no se puede crear una cuenta de invitado; en ese caso solo puedes jugar sin funciones en línea. Base jurídica: interés legítimo en proteger el servicio frente a registros automatizados (art. 6.1.f) RGPD); el acceso a tu dispositivo es estrictamente necesario para ello (§ 25, apdo. 2, n.º 2, TDDDG). Más información: <a href="https://www.cloudflare.com/privacypolicy/">política de privacidad de Cloudflare</a>.</p>`,
    uk: `<p><b>Захист від ботів.</b> Під час створення гостьового акаунта Cloudflare Turnstile (Cloudflare, Inc., США) за технічними ознаками твого браузера та з’єднання (наприклад, IP-адреса, дані браузера та пристрою) перевіряє, чи грає людина. Для цього гра завантажує скрипт від Cloudflare. Без цієї перевірки гостьовий акаунт створити не можна, тоді ти можеш грати лише без онлайн-функцій. Правова підстава: законний інтерес у захисті сервісу від автоматизованих реєстрацій (ст. 6 ч. 1 літ. f GDPR); доступ до твого пристрою для цього є безумовно необхідним (§ 25 ч. 2 п. 2 TDDDG). Докладніше: <a href="https://www.cloudflare.com/privacypolicy/">політика конфіденційності Cloudflare</a>.</p>`,
  };
  const mailLabel = { de: "E-Mail", en: "Email", es: "Correo electrónico", uk: "Ел. пошта" };
  const ctrl = lang => `<p>${esc(L.operator)}<br>${addr(lang)}<br>${mailLabel[lang]}: ${mail}</p>`;

  /** Ergänzende Hinweise für Spieler in einzelnen Ländern (außerhalb der EU) */
  const countries = {
    de: `<h2>Hinweise für einzelne Länder</h2>
<p>Für Spieler in diesen Ländern gilt ergänzend:</p>
<p><b>Chile.</b> Ab seinem Inkrafttreten gilt das chilenische Gesetz Nr. 21.719 zum Schutz personenbezogener Daten. Du kannst dich bei der chilenischen Datenschutzbehörde (Agencia de Protección de Datos Personales) beschweren. Wir haben keinen Sitz in Chile; du und die Behörde erreichen uns unter ${mail}.</p>
<p><b>Kolumbien.</b> Soweit das kolumbianische Gesetz 1581 von 2012 für uns gilt, richtest du Anfragen zu deinen Daten an ${mail}. Zuständige Behörde ist die Superintendencia de Industria y Comercio (SIC).</p>
<p><b>Mexiko.</b> Soweit das mexikanische Bundesgesetz zum Schutz personenbezogener Daten in Privatbesitz (LFPDPPP) für uns gilt, machst du deine Rechte auf Auskunft, Berichtigung, Löschung und Widerspruch (ARCO-Rechte) unter ${mail} geltend. Zuständige Behörde ist die Secretaría Anticorrupción y Buen Gobierno.</p>`,
    en: `<h2>Notes for specific countries</h2>
<p>For players in these countries, the following also applies:</p>
<p><b>Chile.</b> Once in force, Chilean Law No. 21.719 on the protection of personal data applies. You can lodge a complaint with the Chilean data protection authority (Agencia de Protección de Datos Personales). We have no establishment in Chile; you and the authority can reach us at ${mail}.</p>
<p><b>Colombia.</b> Insofar as Colombian Law 1581 of 2012 applies to us, send requests about your data to ${mail}. The competent authority is the Superintendencia de Industria y Comercio (SIC).</p>
<p><b>Mexico.</b> Insofar as the Mexican Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP) applies to us, you can exercise your rights of access, rectification, cancellation and objection (ARCO rights) by writing to ${mail}. The competent authority is the Secretaría Anticorrupción y Buen Gobierno.</p>`,
    es: `<h2>Información para determinados países</h2>
<p>Para los jugadores de estos países se aplica además lo siguiente:</p>
<p><b>Chile.</b> Desde su entrada en vigor se aplica la Ley n.º 21.719 sobre protección de datos personales. Puedes presentar una reclamación ante la Agencia de Protección de Datos Personales. No tenemos sede en Chile; tanto tú como la Agencia pueden escribirnos a ${mail}.</p>
<p><b>Colombia.</b> En la medida en que la Ley 1581 de 2012 nos sea aplicable, envía tus solicitudes sobre tus datos a ${mail}. La autoridad competente es la Superintendencia de Industria y Comercio (SIC).</p>
<p><b>México.</b> En la medida en que la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) nos sea aplicable, puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición (derechos ARCO) escribiendo a ${mail}. La autoridad competente es la Secretaría Anticorrupción y Buen Gobierno.</p>`,
    uk: `<h2>Інформація для окремих країн</h2>
<p>Для гравців у цих країнах додатково діє таке:</p>
<p><b>Чилі.</b> Від набрання ним чинності діє чилійський Закон № 21.719 про захист персональних даних. Ти можеш подати скаргу до чилійського органу із захисту даних (Agencia de Protección de Datos Personales). Ми не маємо місцезнаходження в Чилі; ти й цей орган можете зв’язатися з нами за адресою ${mail}.</p>
<p><b>Колумбія.</b> Якщо до нас застосовується колумбійський Закон 1581 від 2012 року, із запитами щодо своїх даних звертайся на ${mail}. Компетентний орган — Superintendencia de Industria y Comercio (SIC).</p>
<p><b>Мексика.</b> Якщо до нас застосовується мексиканський Федеральний закон про захист персональних даних, що перебувають у володінні приватних осіб (LFPDPPP), свої права на доступ, виправлення, видалення та заперечення (права ARCO) ти можеш реалізувати, написавши на ${mail}. Компетентний орган — Secretaría Anticorrupción y Buen Gobierno.</p>`,
  };

  const privacy = {
    title: { de: "Datenschutzerklärung", en: "Privacy Policy", es: "Política de privacidad", uk: "Політика конфіденційності" },
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
<p><b>Nutzungsstatistik.</b> Mit Spielkonto hält das Spiel einzelne Nutzungsereignisse fest, verknüpft nur mit der zufälligen Kennung deines Kontos: den ersten Besuch mit der groben Herkunft des Links (z. B. „Einladungslink“, „Suchmaschine“ oder eine Kennung aus dem Link, nie die Adresse der verweisenden Seite), einen Besuch pro Tag, gespielte Modi mit der Stärke des Computergegners sowie Spielstand und Dauer am Ende eines Spiels, Gegnersuche (gefunden, abgebrochen, Wartezeit) und ob eine Online-Verbindung direkt, über das Relay oder gar nicht zustande kam. IP-Adresse und Browserangaben speichern wir dafür nicht. Wir werten die Ereignisse nur zusammengefasst aus (z. B. „wie viele neue Spieler kamen gestern über einen Einladungslink“). Zweck: das Spiel betreiben und verbessern. Rechtsgrundlage: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO). Nach ${D("de").stats} löschen wir die Ereignisse; übrig bleiben nur Tagessummen ohne Bezug zu einer Person.</p>
<p><b>E-Mail.</b> Zum Sichern deines Kontos und zum Anmelden schicken wir dir einen Code per E-Mail. Schreibst du uns, nutzen wir deine Nachricht nur, um dir zu antworten. Rechtsgrundlage: Vertrag bzw. berechtigtes Interesse (Art. 6 Abs. 1 lit. b, f DSGVO). Newsletter verschicken wir nicht.</p>
${payments ? pay.de + "\n" : ""}${captcha ? turn.de + "\n" : ""}<h2>Empfänger</h2>
<p>Wir setzen Dienstleister ein für Hosting und Domain, den Spielserver (Server in der EU), den E-Mail-Versand und den Verbindungsaufbau und Relay bei Online-Spielen (PeerJS, Cloudflare, Google)${captcha ? ", den Schutz vor Bots (Cloudflare)" : ""}${payments ? " sowie für Zahlungen" : ""}. Sie verarbeiten Daten nur, soweit es für ihre Aufgabe nötig ist. Einige sitzen in den USA. Die Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU-Kommission für das EU-U.S. Data Privacy Framework oder auf Standardvertragsklauseln (Art. 45, 46 DSGVO), im Übrigen darauf, dass sie für die von dir gewünschte Verbindung erforderlich ist (Art. 49 Abs. 1 lit. b DSGVO).</p>
<h2>Speicherdauer</h2>
<p>Wir speichern Daten nur so lange, wie es für den Zweck nötig ist: Gastkonten ohne Käufe löschen wir nach ${D("de").guest} ohne Aktivität, gesicherte Konten, sobald du sie löschst. Einzelne Online-Spiele löschen wir nach 12 Monaten; deine Wertung und Statistik bleiben. Nutzungsereignisse löschen wir nach ${D("de").stats} (danach nur Tagessummen). Technische Protokolle und Sicherheitsdaten löschen wir nach kurzer Zeit, Sicherungskopien nach spätestens ${D("de").backup}.${payments ? " Kaufbelege bewahren wir aufgrund gesetzlicher Pflichten 10 Jahre auf." : ""}</p>
<h2>Musst du Daten angeben?</h2>
<p>Nein. Ohne Spielkonto kannst du nur ohne Online-Funktionen spielen, ohne E-Mail-Adresse kannst du dein Konto nicht sichern.</p>
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis 18 und 20 DSGVO). Dein Konto mit allen Spieldaten löschst du selbst im Spiel unter Profil → Konto. Für alles andere schreib an ${mail}. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der für uns zuständigen: ${esc(L.authority.de)}, ${esc(L.authority.addr)}.</p>
<p class="box"><b>Widerspruchsrecht:</b> Verarbeiten wir Daten auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO), kannst du dem aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).</p>
<h2>Keine automatisierten Entscheidungen</h2>
<p>Wir treffen keine Entscheidungen, die ausschließlich auf automatisierter Verarbeitung beruhen und dir gegenüber rechtliche Wirkung entfalten (Art. 22 DSGVO).</p>
${countries.de}
<h2>Änderungen</h2>
<p>Wir passen diese Erklärung an, wenn sich das Spiel oder die Rechtslage ändert. Es gilt die Fassung auf dieser Seite.</p>`,
    en: `<p class="meta">${G} · Last updated: ${date.en}</p>${open ? note.en : ""}${tr.en}
<h2>Controller</h2>
${ctrl("en")}
<h2>In short</h2>
<p>You can play without registering. We set no cookies, use no third-party tracking and no advertising, and only process what the game and its improvement need.</p>
<h2>What we process and why</h2>
<p><b>Website.</b> When you open the site, our hosting provider processes technically necessary connection data (e.g. IP address and time) to deliver and secure the page. Legal basis: legitimate interest in a working, secure website (Art. 6(1)(f) GDPR).</p>
<p><b>Game data on your device.</b> The game stores your progress and settings in your browser's storage. This is technically required for the game (§ 25(2) no. 2 TDDDG). You can delete this data in your browser at any time.</p>
<p><b>Player account.</b> When you first start the game, it creates a guest account with a random ID. We store your game data (e.g. player name, progress, items and results) and, if you save your account, your email address. Other players see your player name, level and rating, for example on leaderboards. Purpose: providing the game, saving your progress, enabling fair matches and preventing abuse. Legal basis: contract (Art. 6(1)(b) GDPR); for abuse prevention, our legitimate interest (point (f)).</p>
<p><b>Online matches.</b> Online matches run directly between the two players' devices. Your opponent's device therefore receives your IP address. To set up the connection, the game uses two kinds of services: a PeerJS broker server (PeerJS Cloud, 0.peerjs.com), which processes your IP address and a random connection ID to bring the two devices together, and STUN servers operated by Cloudflare (Cloudflare, Inc., USA; stun.cloudflare.com) and Google (Google LLC, USA; stun.l.google.com), which tell your device its public IP address and process that address for this purpose. No game content passes through these services. If your network does not allow a direct connection, the encrypted game data passes through a relay server operated by Cloudflare (Cloudflare, Inc., USA), which processes your IP address for this but cannot read the content. Legal basis: contract (Art. 6(1)(b) GDPR).</p>
<p><b>Usage statistics.</b> With a player account, the game records individual usage events, linked only to your account's random ID: the first visit with the rough origin of the link (e.g. "invite link", "search engine" or an identifier from the link, never the address of the referring page), one visit per day, modes played with the computer opponent's difficulty and the score and duration at the end of a match, matchmaking (found, cancelled, waiting time) and whether an online connection was direct, via the relay or failed. We do not store your IP address or browser details for this. We only evaluate the events in aggregated form (e.g. "how many new players came via an invite link yesterday"). Purpose: running and improving the game. Legal basis: legitimate interest (Art. 6(1)(f) GDPR). After ${D("en").stats} we delete the events; only daily totals without reference to any person remain.</p>
<p><b>Email.</b> To save your account or sign in, we send you a code by email. If you write to us, we only use your message to reply. Legal basis: contract or legitimate interest (Art. 6(1)(b), (f) GDPR). We do not send newsletters.</p>
${payments ? pay.en + "\n" : ""}${captcha ? turn.en + "\n" : ""}<h2>Recipients</h2>
<p>We use service providers for hosting and domain, the game server (servers in the EU), sending emails and setting up and relaying online matches (PeerJS, Cloudflare, Google)${captcha ? ", bot protection (Cloudflare)" : ""}${payments ? ", and for payments" : ""}. They only process data as far as needed for their task. Some are located in the USA. Transfers rely on the European Commission's adequacy decision for the EU-U.S. Data Privacy Framework or on standard contractual clauses (Art. 45, 46 GDPR), and otherwise on being necessary for the connection you request (Art. 49(1)(b) GDPR).</p>
<h2>Retention</h2>
<p>We only keep data as long as needed for its purpose: guest accounts without purchases are deleted after ${D("en").guest} without activity, saved accounts as soon as you delete them. Individual online matches are deleted after 12 months; your rating and statistics remain. Usage events are deleted after ${D("en").stats} (only daily totals remain). Technical logs and security data are deleted after a short time, backups after ${D("en").backup} at the latest.${payments ? " Purchase records are kept for 10 years as required by law." : ""}</p>
<h2>Do you have to provide data?</h2>
<p>No. Without a player account you can only play without online features; without an email address you cannot save your account.</p>
<h2>Your rights</h2>
<p>You have the right to access, rectification, erasure, restriction of processing and data portability (Art. 15 to 18 and 20 GDPR). You can delete your account and all game data yourself in the game under Profile → Account. For everything else, write to ${mail}. You can also lodge a complaint with a data protection supervisory authority, for example the one responsible for us: ${esc(L.authority.en)}, ${esc(L.authority.addr)}, ${esc(L.country.en)}.</p>
<p class="box"><b>Right to object:</b> Where we process data based on legitimate interests (Art. 6(1)(f) GDPR), you may object at any time on grounds relating to your particular situation (Art. 21 GDPR).</p>
<h2>No automated decisions</h2>
<p>We do not make decisions based solely on automated processing that have legal effects on you (Art. 22 GDPR).</p>
${countries.en}
<h2>Changes</h2>
<p>We update this policy when the game or the law changes. The version on this page applies.</p>`,
    es: `<p class="meta">${G} · Última actualización: ${date.es}</p>${open ? note.es : ""}${tr.es}
<h2>Responsable</h2>
${ctrl("es")}
<h2>En resumen</h2>
<p>Puedes jugar sin registrarte. No usamos cookies, ni seguimiento de terceros, ni publicidad, y solo tratamos lo que el juego y su mejora necesitan.</p>
<h2>Qué tratamos y para qué</h2>
<p><b>Sitio web.</b> Al abrir el sitio, nuestro proveedor de alojamiento trata los datos de conexión técnicamente necesarios (p. ej., dirección IP y hora) para servir la página y protegerla. Base jurídica: interés legítimo en un sitio web seguro y que funcione (art. 6.1.f) RGPD).</p>
<p><b>Progreso guardado en tu dispositivo.</b> El juego guarda tu progreso y tus ajustes en el almacenamiento de tu navegador. Esto es técnicamente necesario para el juego (§ 25, apdo. 2, n.º 2, TDDDG, ley alemana de protección de datos en las telecomunicaciones y los servicios digitales). Puedes borrar estos datos en tu navegador en cualquier momento.</p>
<p><b>Cuenta de juego.</b> En el primer inicio, el juego crea una cuenta de invitado con un identificador aleatorio. Se guardan tus datos de juego (p. ej., nombre de jugador, progreso, objetos y resultados) y, si guardas tu cuenta, tu dirección de correo electrónico. Otros jugadores ven tu nombre de jugador, tu nivel y tu puntuación, por ejemplo en las clasificaciones. Finalidad: ofrecer el juego, guardar tu progreso, hacer posibles partidas justas e impedir abusos. Base jurídica: contrato (art. 6.1.b) RGPD) y, para la prevención de abusos, nuestro interés legítimo (letra f).</p>
<p><b>Partidas en línea.</b> Las partidas en línea se juegan directamente entre los dispositivos de los dos jugadores. Por eso, el dispositivo de tu rival recibe tu dirección IP. Para establecer la conexión, el juego usa dos tipos de servicios: un servidor de intermediación de PeerJS (PeerJS Cloud, 0.peerjs.com), que trata tu dirección IP y un identificador de conexión aleatorio para poner en contacto los dos dispositivos, y servidores STUN de Cloudflare (Cloudflare, Inc., EE. UU.; stun.cloudflare.com) y de Google (Google LLC, EE. UU.; stun.l.google.com), que comunican a tu dispositivo su dirección IP pública y para ello tratan esa dirección. El contenido del juego no pasa por ninguno de estos servicios. Si tu red no permite una conexión directa, los datos de juego cifrados pasan por un servidor de retransmisión (relay) de Cloudflare (Cloudflare, Inc., EE. UU.), que para ello trata tu dirección IP, pero no puede leer el contenido. Base jurídica: contrato (art. 6.1.b) RGPD).</p>
<p><b>Estadísticas de uso.</b> Con una cuenta de juego, el juego registra eventos de uso concretos, vinculados solo al identificador aleatorio de tu cuenta: la primera visita con el origen aproximado del enlace (p. ej., «enlace de invitación», «buscador» o un identificador del enlace, nunca la dirección de la página de procedencia), una visita por día, los modos jugados con la dificultad de la máquina, así como el marcador y la duración al final de una partida, la búsqueda de rival (rival encontrado, búsqueda cancelada, tiempo de espera) y si una conexión en línea se estableció de forma directa, a través del relay o no llegó a establecerse. Para ello no guardamos tu dirección IP ni datos del navegador. Solo evaluamos los eventos de forma agregada (p. ej., «cuántos jugadores nuevos llegaron ayer a través de un enlace de invitación»). Finalidad: operar y mejorar el juego. Base jurídica: interés legítimo (art. 6.1.f) RGPD). Pasados ${D("es").stats} borramos los eventos; solo quedan totales diarios sin relación con ninguna persona.</p>
<p><b>Correo electrónico.</b> Para guardar tu cuenta y para iniciar sesión te enviamos un código por correo electrónico. Si nos escribes, usamos tu mensaje solo para responderte. Base jurídica: contrato o interés legítimo (art. 6.1.b) y f) RGPD). No enviamos boletines.</p>
${payments ? pay.es + "\n" : ""}${captcha ? turn.es + "\n" : ""}<h2>Destinatarios</h2>
<p>Recurrimos a proveedores de servicios para el alojamiento y el dominio, el servidor del juego (servidores en la UE), el envío de correos electrónicos y el establecimiento de la conexión y el relay en las partidas en línea (PeerJS, Cloudflare, Google)${captcha ? ", la protección contra bots (Cloudflare)" : ""}${payments ? " y los pagos" : ""}. Solo tratan datos en la medida necesaria para su tarea. Algunos tienen su sede en EE. UU. La transferencia se basa en la decisión de adecuación de la Comisión Europea para el Marco de Privacidad de Datos UE-EE. UU. (EU-U.S. Data Privacy Framework) o en cláusulas contractuales tipo (arts. 45 y 46 RGPD) y, en lo demás, en que es necesaria para la conexión que solicitas (art. 49.1.b) RGPD).</p>
<h2>Plazo de conservación</h2>
<p>Solo guardamos los datos mientras sea necesario para su finalidad: las cuentas de invitado sin compras las borramos tras ${D("es").guest} sin actividad; las cuentas guardadas, en cuanto las borras. Las partidas en línea individuales las borramos a los 12 meses; tu puntuación y tus estadísticas se mantienen. Los eventos de uso los borramos a los ${D("es").stats} (después solo quedan totales diarios). Los registros técnicos y los datos de seguridad los borramos al poco tiempo, y las copias de seguridad, a más tardar a los ${D("es").backup}.${payments ? " Los justificantes de compra los conservamos 10 años por obligación legal." : ""}</p>
<h2>¿Tienes que facilitar datos?</h2>
<p>No. Sin cuenta de juego solo puedes jugar sin funciones en línea; sin dirección de correo electrónico no puedes guardar tu cuenta.</p>
<h2>Tus derechos</h2>
<p>Tienes derecho de acceso, rectificación, supresión, limitación del tratamiento y portabilidad de los datos (arts. 15 a 18 y 20 RGPD). Tu cuenta con todos los datos de juego la borras tú mismo en el juego, en Perfil → Cuenta. Para todo lo demás, escribe a ${mail}. Además, puedes presentar una reclamación ante una autoridad de control de protección de datos, por ejemplo ante la competente para nosotros: ${esc(L.authority.es)}, ${esc(L.authority.addr)}, ${esc(L.country.es)}.</p>
<p class="box"><b>Derecho de oposición:</b> Cuando tratamos datos sobre la base de intereses legítimos (art. 6.1.f) RGPD), puedes oponerte en cualquier momento por motivos relacionados con tu situación particular (art. 21 RGPD).</p>
<h2>Sin decisiones automatizadas</h2>
<p>No tomamos decisiones basadas únicamente en el tratamiento automatizado que produzcan efectos jurídicos sobre ti (art. 22 RGPD).</p>
${countries.es}
<h2>Cambios</h2>
<p>Adaptamos esta política cuando cambian el juego o la situación legal. Se aplica la versión publicada en esta página.</p>`,
    uk: `<p class="meta">${G} · Станом на: ${date.uk}</p>${open ? note.uk : ""}${tr.uk}
<h2>Відповідальна особа</h2>
${ctrl("uk")}
<h2>Коротко</h2>
<p>Ти можеш грати без реєстрації. Ми не використовуємо файли cookie, стороннє відстеження та рекламу й обробляємо лише те, що потрібно для гри та її вдосконалення.</p>
<h2>Що ми обробляємо і для чого</h2>
<p><b>Вебсайт.</b> Коли ти відкриваєш сайт, наш хостинг-провайдер обробляє технічно необхідні дані з’єднання (наприклад, IP-адресу та час), щоб доставити сторінку й захистити її. Правова підстава: законний інтерес у справному та безпечному вебсайті (ст. 6 ч. 1 літ. f GDPR).</p>
<p><b>Прогрес на твоєму пристрої.</b> Прогрес і налаштування гра зберігає в сховищі твого браузера. Це технічно необхідно для гри (§ 25 ч. 2 п. 2 TDDDG, німецький закон про захист даних у телекомунікаціях і цифрових сервісах). Ти можеш будь-коли видалити ці дані у своєму браузері.</p>
<p><b>Ігровий акаунт.</b> Під час першого запуску гра створює гостьовий акаунт із випадковим ідентифікатором. Зберігаються твої ігрові дані (наприклад, ім’я гравця, прогрес, предмети та результати), а якщо ти збережеш акаунт, — і твоя адреса електронної пошти. Ім’я гравця, рівень і рейтинг бачать інші гравці, наприклад у таблицях лідерів. Мета: надавати гру, зберігати твій прогрес, забезпечувати чесні матчі й запобігати зловживанням. Правова підстава: договір (ст. 6 ч. 1 літ. b GDPR), для захисту від зловживань — наш законний інтерес (літ. f).</p>
<p><b>Онлайн-матчі.</b> Онлайн-матчі відбуваються безпосередньо між пристроями двох гравців. Тому пристрій твого суперника отримує твою IP-адресу. Для встановлення з’єднання гра використовує два види сервісів: сервер-посередник PeerJS (PeerJS Cloud, 0.peerjs.com), який обробляє твою IP-адресу та випадковий ідентифікатор з’єднання, щоб з’єднати два пристрої, і STUN-сервери Cloudflare (Cloudflare, Inc., США; stun.cloudflare.com) та Google (Google LLC, США; stun.l.google.com), які повідомляють твоєму пристрою його публічну IP-адресу і для цього обробляють цю адресу. Ігровий вміст не проходить через жоден із цих сервісів. Якщо твоя мережа не дозволяє прямого з’єднання, зашифровані ігрові дані проходять через ретрансляційний сервер (relay) Cloudflare (Cloudflare, Inc., США), який для цього обробляє твою IP-адресу, але не може прочитати вміст. Правова підстава: договір (ст. 6 ч. 1 літ. b GDPR).</p>
<p><b>Статистика використання.</b> Якщо є ігровий акаунт, гра фіксує окремі події використання, пов’язані лише з випадковим ідентифікатором твого акаунта: перший візит із приблизним джерелом посилання (наприклад, «посилання-запрошення», «пошукова система» або ідентифікатор із посилання, але ніколи не адреса сторінки, з якої відбувся перехід), один візит на день, зіграні режими зі складністю комп’ютерного суперника, а також рахунок і тривалість наприкінці матчу, пошук суперника (знайдено, скасовано, час очікування) і те, чи було онлайн-з’єднання прямим, через relay чи не встановилося взагалі. IP-адресу та дані браузера ми для цього не зберігаємо. Ми аналізуємо події лише в узагальненому вигляді (наприклад, «скільки нових гравців прийшло вчора за посиланням-запрошенням»). Мета: забезпечувати роботу гри та вдосконалювати її. Правова підстава: законний інтерес (ст. 6 ч. 1 літ. f GDPR). Через ${D("uk").stats} ми видаляємо події; залишаються лише денні підсумки без зв’язку з будь-якою особою.</p>
<p><b>Електронна пошта.</b> Щоб зберегти акаунт і для входу, ми надсилаємо тобі код електронною поштою. Якщо ти нам пишеш, ми використовуємо твоє повідомлення лише для відповіді тобі. Правова підстава: договір або законний інтерес (ст. 6 ч. 1 літ. b, f GDPR). Розсилок ми не надсилаємо.</p>
${payments ? pay.uk + "\n" : ""}${captcha ? turn.uk + "\n" : ""}<h2>Одержувачі</h2>
<p>Ми залучаємо постачальників послуг для хостингу й домену, ігрового сервера (сервери в ЄС), надсилання електронних листів, а також для встановлення з’єднання та relay в онлайн-матчах (PeerJS, Cloudflare, Google)${captcha ? ", для захисту від ботів (Cloudflare)" : ""}${payments ? ", а також для платежів" : ""}. Вони обробляють дані лише в обсязі, потрібному для їхнього завдання. Деякі з них розташовані в США. Передача ґрунтується на рішенні Європейської комісії про адекватність для EU-U.S. Data Privacy Framework або на стандартних договірних положеннях (ст. 45, 46 GDPR), а в іншому — на тому, що вона необхідна для з’єднання, якого ти бажаєш (ст. 49 ч. 1 літ. b GDPR).</p>
<h2>Строк зберігання</h2>
<p>Ми зберігаємо дані лише стільки, скільки потрібно для мети: гостьові акаунти без покупок видаляємо через ${D("uk").guest} без активності, збережені акаунти — щойно ти їх видалиш. Окремі онлайн-матчі видаляємо через 12 місяців; твій рейтинг і статистика залишаються. Події використання видаляємо через ${D("uk").stats} (після цього лише денні підсумки). Технічні журнали та дані безпеки видаляємо через короткий час, резервні копії — щонайпізніше через ${D("uk").backup}.${payments ? " Документи про покупки ми зберігаємо 10 років відповідно до вимог закону." : ""}</p>
<h2>Чи мусиш ти надавати дані?</h2>
<p>Ні. Без ігрового акаунта ти можеш грати лише без онлайн-функцій, без адреси електронної пошти не можеш зберегти акаунт.</p>
<h2>Твої права</h2>
<p>Ти маєш право на доступ, виправлення, видалення, обмеження обробки та перенесення даних (ст. 15–18 і 20 GDPR). Свій акаунт з усіма ігровими даними ти видаляєш самостійно в грі в розділі Профіль → Акаунт. З усіх інших питань пиши на ${mail}. Крім того, ти можеш подати скаргу до наглядового органу із захисту даних, наприклад до компетентного щодо нас: ${esc(L.authority.uk)}, ${esc(L.authority.addr)}, ${esc(L.country.uk)}.</p>
<p class="box"><b>Право на заперечення:</b> Якщо ми обробляємо дані на підставі законних інтересів (ст. 6 ч. 1 літ. f GDPR), ти можеш будь-коли заперечити проти цього з причин, пов’язаних із твоєю особливою ситуацією (ст. 21 GDPR).</p>
<h2>Жодних автоматизованих рішень</h2>
<p>Ми не ухвалюємо рішень, що ґрунтуються виключно на автоматизованій обробці й мають щодо тебе юридичні наслідки (ст. 22 GDPR).</p>
${countries.uk}
<h2>Зміни</h2>
<p>Ми оновлюємо цю політику, коли змінюється гра або правова ситуація. Діє редакція, опублікована на цій сторінці.</p>`,
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
    es: payments ? `<h2>Compras y pago</h2>
<p>Las compras se realizan a través de Stripe. El contrato se celebra al completar el pago. Las gemas u objetos comprados aparecen en tu cuenta inmediatamente después de la confirmación del pago. Los precios se muestran antes de la compra en euros, con el IVA incluido.</p>
<h2>Derecho de desistimiento (consumidores de la UE)</h2>
<p>Como consumidor tienes, en principio, un derecho de desistimiento de 14 días. En el caso de contenidos digitales, se extingue en cuanto comenzamos la entrega (abono en tu cuenta), después de que hayas aceptado expresamente que empecemos antes de que finalice el plazo y hayas confirmado que con ello pierdes tu derecho de desistimiento (§ 356, apdo. 5, BGB, Código Civil alemán). Pedimos este consentimiento antes del pago. Información sobre el desistimiento y modelo de formulario: ${ph("INFORMACIÓN SOBRE EL DESISTIMIENTO Y MODELO DE FORMULARIO")}</p>
<h2>Reembolsos y contracargos</h2>
<p>Si se reembolsa un pago o se produce un contracargo, retiramos las gemas y los objetos obtenidos con él. Si ya has gastado las gemas, tu cuenta mostrará una deuda de gemas que se compensará con gemas futuras. Los contracargos repetidos o abusivos pueden dar lugar a una suspensión.</p>` : "",
    uk: payments ? `<h2>Покупки та оплата</h2>
<p>Покупки здійснюються через Stripe. Договір укладається після завершення оплати. Куплені самоцвіти або предмети з’являються у твоєму акаунті одразу після підтвердження оплати. Ціни показуються перед покупкою в євро з урахуванням ПДВ.</p>
<h2>Право на відмову (споживачі в ЄС)</h2>
<p>Як споживач ти, як правило, маєш право відмовитися від договору протягом 14 днів. Щодо цифрового вмісту воно припиняється, щойно ми почнемо постачання (зарахування на акаунт), після твоєї явної згоди на те, щоб ми почали до закінчення строку, і твого підтвердження, що через це ти втрачаєш право на відмову (§ 356 ч. 5 BGB, Цивільний кодекс Німеччини). Цю згоду ми отримуємо перед оплатою. Інформація про право на відмову та зразок форми: ${ph("ІНФОРМАЦІЯ ПРО ПРАВО НА ВІДМОВУ ТА ЗРАЗОК ФОРМИ")}</p>
<h2>Повернення коштів і скасування платежів</h2>
<p>Якщо платіж повернуто або скасовано через банк (chargeback), ми вилучаємо отримані за нього самоцвіти й предмети. Якщо самоцвіти вже витрачено, у твоєму акаунті відображається борг у самоцвітах, який погашається майбутніми самоцвітами. Повторні або зловмисні скасування платежів можуть призвести до блокування.</p>` : "",
  };

  const terms = {
    title: { de: "Nutzungsbedingungen", en: "Terms of Use", es: "Términos de uso", uk: "Умови користування" },
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
<li>Du kannst als Gast spielen. Ein Gastkonto hängt an deinem Browser; löschst du die Browserdaten, kann es verloren gehen. Gastkonten ohne Käufe werden nach ${D("de").guest} ohne Aktivität gelöscht.</li>
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
    en: `<p class="meta">${G} · Last updated: ${date.en}</p>${open ? note.en : ""}${tr.en}
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
<li>You can play as a guest. A guest account is tied to your browser; if you clear your browser data, it may be lost. Guest accounts without purchases are deleted after ${D("en").guest} of inactivity.</li>
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
    es: `<p class="meta">${G} · Última actualización: ${date.es}</p>${open ? note.es : ""}${tr.es}
<h2>1. Ámbito de aplicación</h2>
<p>Estos términos se aplican al uso del juego de navegador ${G} («el juego»), ofrecido por ${esc(L.operator)} («nosotros», véase el <a href="imprint.html">aviso legal</a>). Al jugar, los aceptas. Las disposiciones imperativas de protección del consumidor de tu país de residencia no se ven afectadas.</p>
<h2>2. El juego</h2>
<ul>
<li>El juego es gratuito${payments ? "; algunos contenidos se pueden comprar de forma opcional" : ""}. Lo ofrecemos tal cual y lo seguimos desarrollando; en ese proceso pueden cambiar las funciones, los contenidos y el equilibrio del juego.</li>
<li>Las partidas en línea se juegan directamente entre los dispositivos de los jugadores (peer-to-peer). Por ello, los dispositivos de los demás jugadores ven técnicamente tu dirección IP. No controlamos el contenido ni el comportamiento de otros jugadores.</li>
<li>Eres responsable de la seguridad de tu dispositivo y de tu navegador (p. ej., actualizaciones).</li>
</ul>
<h2>3. Edad</h2>
<p>El juego está dirigido a jugadores a partir de ${L.minAge} años. Los menores de esa edad necesitan el consentimiento de sus padres para tener una cuenta y jugar en línea.</p>
<h2>4. Cuenta</h2>
<ul>
<li>Puedes jugar como invitado. Una cuenta de invitado está ligada a tu navegador; si borras los datos del navegador, puede perderse. Las cuentas de invitado sin compras se borran tras ${D("es").guest} sin actividad.</li>
<li>Si guardas tu cuenta con una dirección de correo electrónico, inicias sesión con un código que recibes por correo. Protege el acceso a tu buzón; lo que ocurra a través de tu cuenta se te atribuye en la medida en que seas responsable de ello.</li>
<li>Cada cuenta es personal. No está permitido vender, intercambiar ni ceder cuentas.</li>
<li>Puedes borrar tu cuenta en cualquier momento en el juego (Perfil → Cuenta).</li>
</ul>
<h2>5. Reglas para un juego limpio y seguro</h2>
<p>Está prohibido en particular:</p>
<ul>
<li>Hacer trampas: bots, scripts, macros, programas de trucos, datos de juego o de red manipulados, aprovechar errores, resultados pactados o varias cuentas para obtener ventajas.</li>
<li>Atacar el juego, nuestros servidores u otros jugadores: transmitir software malicioso o datos dañinos, ataques de sobrecarga, eludir medidas de seguridad, acceder sin autorización a sistemas o datos, espiar las direcciones IP de otros jugadores o usarlas para ataques.</li>
<li>Accesos automatizados (p. ej., extracción de datos), salvo que sean necesarios para jugar con normalidad.</li>
<li>Nombres de jugador ofensivos, discriminatorios, extremistas o ilícitos por otro motivo, acosar a otros jugadores y hacerse pasar por otra persona, también por nosotros.</li>
<li>El uso comercial sin nuestro consentimiento, por ejemplo el comercio de cuentas u objetos o subir de nivel a otros a cambio de dinero («boosting»).</li>
<li>Cualquier uso que infrinja la ley o derechos de terceros.</li>
</ul>
<p>Por favor, comunica los errores y las vulnerabilidades de seguridad a ${mail} en lugar de aprovecharlos.</p>
<h2>6. Consecuencias de las infracciones</h2>
<p>En caso de infracción, según su gravedad, podemos: no contar resultados, restablecer el progreso, retirar recompensas obtenidas de forma desleal, cambiar tu nombre de jugador, o suspender temporalmente o borrar tu cuenta. En infracciones graves, también sin aviso previo. El servidor comprueba los resultados de las partidas en línea; los informes contradictorios o inverosímiles pueden no contarse. Si infringes estas reglas o derechos de terceros de forma culposa, respondes del daño causado y nos eximes de las reclamaciones de terceros que se deriven de ello, incluidos los costes razonables de defensa jurídica.</p>
<h2>7. Derechos sobre el juego</h2>
<p>Todos los derechos sobre el juego (programa, gráficos, personajes, sonidos, nombre y logotipo) nos pertenecen a nosotros o a nuestros licenciantes. Puedes jugar al juego de forma privada y no comercial. Se permiten vídeos, streams y capturas de pantalla del juego. Copiar, modificar, redistribuir o recrear el juego o partes de él solo está permitido en la medida en que la ley lo autorice de forma imperativa.</p>
<h2>8. Objetos y monedas virtuales</h2>
<ul>
<li>El juego tiene dos monedas virtuales: monedas y gemas. ${payments ? "Las monedas solo se obtienen jugando; las gemas, comprándolas o, rara vez, en el juego." : "Ambas se obtienen solo en el juego, no con dinero real."}</li>
<li>Las monedas virtuales y los objetos (cabezas, balones, estadios, cosméticos, pase de temporada, niveles de cabeza) son una licencia intransferible y revocable para usarlos en el juego. No tienen valor monetario, no se pueden canjear por dinero, vender ni transferir, y no se reembolsan al borrar la cuenta, salvo que la ley disponga otra cosa.</li>
<li>Los niveles de cabeza mejoran los atributos de una cabeza en el juego hasta en un 25 %. La búsqueda de rival se basa únicamente en la puntuación.</li>
<li>Podemos cambiar el equilibrio, los precios y los contenidos del juego.${payments ? " Si retiramos de forma permanente un objeto comprado con dinero real, recibirás un sustituto equivalente o el reembolso del valor restante." : ""}</li>
</ul>
${buy.es}
<h2>9. Disponibilidad</h2>
<p>Nos esforzamos por mantener el juego disponible, pero no garantizamos una disponibilidad ininterrumpida ni libre de errores. El mantenimiento, las averías y los servicios de terceros (p. ej., internet, servidores, servicios de conexión para partidas en línea) pueden limitar el uso. Podemos cerrar el juego con un preaviso de al menos 30 días en el juego.${payments ? " En ese caso, reembolsaremos a petición la parte proporcional de las gemas compradas no utilizadas." : ""}</p>
<h2>10. Salud</h2>
<p>El juego contiene movimientos rápidos y efectos de luz. Si eres propenso a sufrir ataques provocados por la luz, consulta a un médico antes de jugar. Haz pausas con regularidad y deja de jugar inmediatamente si sientes mareo o malestar.</p>
<h2>11. Responsabilidad</h2>
<ul>
<li>Respondemos de forma ilimitada en caso de dolo y negligencia grave, de daños a la vida, la integridad física o la salud, conforme a la Ley alemana de responsabilidad por productos defectuosos (Produkthaftungsgesetz) y en la medida en que hayamos asumido una garantía.</li>
<li>Por lo demás, en caso de negligencia leve solo respondemos por el incumplimiento de obligaciones esenciales, es decir, aquellas que hacen posible la ejecución del contrato y en cuyo cumplimiento puedes confiar habitualmente, y solo por el daño típico y previsible. En la medida en que ofrecemos el juego de forma gratuita, no respondemos por negligencia leve.</li>
<li>No somos responsables del comportamiento de otros jugadores ni de servicios de terceros en los que no podemos influir, salvo que nos sea imputable alguna culpa.</li>
<li>Estas reglas se aplican también a la pérdida de partidas guardadas o de objetos virtuales y a la responsabilidad personal de nuestros auxiliares.</li>
</ul>
<h2>12. Cambios en estos términos</h2>
<p>Podemos modificar estos términos con efecto para el futuro si existe un motivo justificado, por ejemplo nuevas funciones o cambios en la ley. Te informaremos de los cambios en el juego. Los cambios que te perjudiquen de forma significativa solo se aplican si los aceptas; si no los aceptas, puedes borrar tu cuenta en cualquier momento.</p>
<h2>13. Disposiciones finales</h2>
<p>Se aplica el derecho alemán, con exclusión de la Convención de las Naciones Unidas sobre los Contratos de Compraventa Internacional de Mercaderías; para los consumidores, solo en la medida en que no se les prive de la protección de las disposiciones imperativas de su país de residencia. Si una disposición es ineficaz, las demás siguen siendo válidas. No estamos dispuestos ni obligados a participar en procedimientos de resolución de litigios ante una entidad de resolución alternativa de litigios de consumo.</p>`,
    uk: `<p class="meta">${G} · Станом на: ${date.uk}</p>${open ? note.uk : ""}${tr.uk}
<h2>1. Сфера дії</h2>
<p>Ці умови діють для користування браузерною грою ${G} («гра»), яку пропонує ${esc(L.operator)} («ми», див. <a href="imprint.html">відомості про власника</a>). Граючи, ти приймаєш їх. Імперативні норми про захист прав споживачів країни твого проживання залишаються чинними.</p>
<h2>2. Гра</h2>
<ul>
<li>Гра безкоштовна${payments ? "; окремий вміст можна за бажанням купити" : ""}. Ми надаємо її такою, якою вона є, і постійно розвиваємо. Тому функції, вміст і ігровий баланс можуть змінюватися.</li>
<li>Онлайн-матчі відбуваються безпосередньо між пристроями гравців (peer-to-peer). Тому пристрої інших гравців технічно бачать твою IP-адресу. Ми не контролюємо вміст і поведінку інших гравців.</li>
<li>За безпеку свого пристрою та браузера (наприклад, оновлення) відповідаєш ти.</li>
</ul>
<h2>3. Вік</h2>
<p>Гра призначена для гравців від ${L.minAge} років. Молодшим для акаунта та онлайн-матчів потрібна згода батьків.</p>
<h2>4. Акаунт</h2>
<ul>
<li>Ти можеш грати як гість. Гостьовий акаунт прив’язаний до твого браузера; якщо ти видалиш дані браузера, його можна втратити. Гостьові акаунти без покупок видаляються через ${D("uk").guest} без активності.</li>
<li>Якщо ти збережеш акаунт з адресою електронної пошти, ти входиш за допомогою коду з листа. Захищай доступ до своєї поштової скриньки; дії, вчинені через твій акаунт, вважаються твоїми, якщо ти за них відповідаєш.</li>
<li>Кожен акаунт є особистим. Продаж, обмін або передача акаунтів заборонені.</li>
<li>Ти можеш будь-коли видалити свій акаунт у грі (Профіль → Акаунт).</li>
</ul>
<h2>5. Правила чесної та безпечної гри</h2>
<p>Зокрема, заборонено:</p>
<ul>
<li>Шахрайство: боти, скрипти, макроси, чит-програми, змінені ігрові чи мережеві дані, використання помилок, домовлені результати або кілька акаунтів для отримання переваг.</li>
<li>Атаки на гру, наші сервери або інших гравців: передавання шкідливого програмного забезпечення чи шкідливих даних, атаки перевантаження, обхід заходів безпеки, несанкціонований доступ до систем або даних, вистежування IP-адрес інших гравців або їх використання для атак.</li>
<li>Автоматизований доступ (наприклад, збирання даних), якщо він не потрібен для звичайної гри.</li>
<li>Образливі, дискримінаційні, екстремістські чи інакше протиправні імена гравців, переслідування інших гравців і видавання себе за іншу особу, зокрема за нас.</li>
<li>Комерційне використання без нашої згоди, наприклад торгівля акаунтами чи предметами або платне «прокачування».</li>
<li>Будь-яке використання, що порушує закони або права третіх осіб.</li>
</ul>
<p>Будь ласка, повідомляй про помилки та вразливості безпеки на ${mail}, а не використовуй їх.</p>
<h2>6. Наслідки порушень</h2>
<p>У разі порушення ми можемо залежно від його тяжкості: не зараховувати результати, скинути прогрес, вилучити нечесно отримані нагороди, змінити твоє ім’я гравця, тимчасово заблокувати або видалити твій акаунт. У разі серйозних порушень — також без попереднього попередження. Результати онлайн-матчів перевіряє сервер; суперечливі або неправдоподібні повідомлення можуть не зараховуватися. Якщо ти з власної вини порушуєш ці правила або права третіх осіб, ти відповідаєш за заподіяну шкоду та звільняєш нас від пов’язаних із цим претензій третіх осіб, включно з обґрунтованими витратами на юридичний захист.</p>
<h2>7. Права на гру</h2>
<p>Усі права на гру (програму, графіку, персонажів, звуки, назву й логотип) належать нам або нашим ліцензіарам. Ти можеш грати в гру приватно та некомерційно. Відео, стріми та знімки екрана з гри дозволені. Копіювання, змінення, поширення або відтворення гри чи її частин дозволене лише тією мірою, якою це імперативно дозволяє закон.</p>
<h2>8. Віртуальні предмети та валюти</h2>
<ul>
<li>У грі є дві віртуальні валюти: монети й самоцвіти. ${payments ? "Монети можна отримати лише граючи, самоцвіти — купивши або зрідка в грі." : "Обидві можна отримати лише в грі, а не за справжні гроші."}</li>
<li>Віртуальні валюти та предмети (голови, м’ячі, арени, косметика, сезонний пропуск, рівні голів) є непередаваною відкличною ліцензією на використання в грі. Вони не мають грошової вартості, їх не можна обміняти на гроші, продати чи передати, і вони не відшкодовуються під час видалення акаунта, якщо закон не передбачає іншого.</li>
<li>Рівні голови покращують характеристики голови в грі щонайбільше на 25 %. Пошук суперника залежить лише від рейтингу.</li>
<li>Ми можемо змінювати баланс, ціни та вміст гри.${payments ? " Якщо ми назавжди вилучимо предмет, куплений за справжні гроші, ти отримаєш рівноцінну заміну або відшкодування залишкової вартості." : ""}</li>
</ul>
${buy.uk}
<h2>9. Доступність</h2>
<p>Ми намагаємося підтримувати доступність гри, але не гарантуємо безперервної чи безпомилкової доступності. Технічне обслуговування, збої та сервіси третіх осіб (наприклад, інтернет, сервери, сервіси з’єднання для онлайн-матчів) можуть обмежувати користування. Ми можемо припинити роботу гри, повідомивши про це в грі щонайменше за 30 днів.${payments ? " Невикористані куплені самоцвіти ми тоді на запит пропорційно відшкодуємо." : ""}</p>
<h2>10. Здоров’я</h2>
<p>Гра містить швидкі рухи та світлові ефекти. Якщо в тебе є схильність до нападів, спричинених світловими ефектами, перед грою порадься з лікарем. Регулярно роби перерви й одразу припини гру, якщо відчуєш запаморочення чи нездужання.</p>
<h2>11. Відповідальність</h2>
<ul>
<li>Ми несемо необмежену відповідальність у разі умислу та грубої необережності, у разі шкоди життю, тілу чи здоров’ю, відповідно до Закону Німеччини про відповідальність за продукцію (Produkthaftungsgesetz) і в тих випадках, коли ми надали гарантію.</li>
<li>В інших випадках за легкої необережності ми відповідаємо лише за порушення істотних обов’язків, тобто таких, що взагалі уможливлюють виконання договору і на дотримання яких ти зазвичай можеш покладатися, і лише за типову, передбачувану шкоду. Тією мірою, якою ми надаємо гру безоплатно, за легку необережність ми не відповідаємо.</li>
<li>Ми не відповідаємо за поведінку інших гравців і за сервіси третіх осіб, на які не можемо вплинути, якщо в цьому немає нашої вини.</li>
<li>Ці правила діють також щодо втрати ігрового прогресу чи віртуальних предметів і щодо особистої відповідальності наших помічників.</li>
</ul>
<h2>12. Зміни цих умов</h2>
<p>Ми можемо змінювати ці умови з дією на майбутнє, якщо для цього є вагома причина, наприклад нові функції або зміни законодавства. Про зміни ми повідомляємо тебе в грі. Зміни, що суттєво погіршують твоє становище, діють лише після твоєї згоди; якщо ти не погоджуєшся, ти можеш будь-коли видалити свій акаунт.</p>
<h2>13. Прикінцеві положення</h2>
<p>Застосовується право Німеччини за винятком Конвенції ООН про договори міжнародної купівлі-продажу товарів; для споживачів — лише тією мірою, якою це не позбавляє їх захисту імперативних норм країни їхнього проживання. Якщо якесь положення недійсне, решта положень залишаються чинними. Ми не готові й не зобов’язані брати участь у процедурах вирішення спорів перед органом з позасудового врегулювання споживчих спорів.</p>`,
  };

  const NAV = { de: "← Zurück zum Spiel", en: "← Back to the game", es: "← Volver al juego", uk: "← Назад до гри" };
  const docs = { imprint, privacy, terms };
  const page = key => {
    const d = docs[key], langs = LEGAL_LANGS[key];
    const nav = lang => `<nav data-l="${lang}"><a href="../">${NAV[lang]}</a>${Object.keys(docs).filter(k => k !== key).map(k => `<a href="${k}.html">${docs[k].title[lang]}</a>`).join("")}${langs.filter(x => x !== lang).map(x => `<a href="?lang=${x}" lang="${x}">${LANG_NAMES[x]}</a>`).join("")}</nav>`;
    const titles = Object.fromEntries(langs.map(l => [l, `${d.title[l]} – ${L.game}`]));
    return `<!doctype html>
<!-- ERZEUGT von tools/gen-legal.mjs. Nicht von Hand ändern: dort anpassen, dann npm run legal. -->
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${d.title.de} / ${d.title.en} – ${G}</title>
<link rel="stylesheet" href="style.css">
<script>
// Sprache: ?lang=, sonst die Spielsprache, sonst der Browser; gibt es die Seite darin nicht, Englisch.
// Ohne Skript stehen alle Fassungen untereinander.
(function () {
  var L = ${JSON.stringify(langs)}, T = ${JSON.stringify(titles).replace(/</g, "\\u003c")}, w = null, l = "en";
  var ok = function (x) { return L.indexOf(x) >= 0; };
  try { w = new URLSearchParams(location.search).get("lang"); } catch (e) { w = null; }
  if (!w) { try { w = (JSON.parse(localStorage.getItem("kopfball-duell-save-v2") || "{}") || {}).lang; } catch (e) { w = null; } }
  if (w && w !== "auto") { if (ok(w)) l = w; }
  else { var ls = navigator.languages || [navigator.language]; for (var i = 0; i < ls.length; i++) { var k = String(ls[i] || "").slice(0, 2).toLowerCase(); if (ok(k)) { l = k; break; } } }
  document.documentElement.lang = l; document.documentElement.setAttribute("data-show", l); document.title = T[l];
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("nav a[href$='.html']").forEach(function (a) { a.href = a.getAttribute("href") + "?lang=" + l; });
  });
})();
</script>
</head>
<body>
<main>
${langs.map(lang => `<section data-l="${lang}" lang="${lang}">
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
