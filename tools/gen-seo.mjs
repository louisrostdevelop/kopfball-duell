// Erzeugt die Infoseiten für Suchmaschinen (de/, de/gegen-freunde/, en/, en/play-with-friends/), sitemap.xml und
// robots.txt. Zahlen und Namen (Köpfe, Supers, Arenen, Modi, Sperren) kommen aus dem Spiel, damit die Seiten stimmen,
// wenn sich das Spiel ändert. Nach einer Änderung: `npm run seo`. Ein Test prüft, dass die Dateien aktuell sind.
// Bilder und Gameplay-Loop: landing/ (tools/gen-landing-media.mjs, aus dem echten Spiel aufgenommen).
// Aussehen: css/landing.css (Design-Tokens des Spiels). Fremde Spielnamen nie in Titel, Überschrift oder URL.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ARENAS, CHARS, MODES, PAYMENTS, POWERUPS } from "../js/content/config.js";
import de from "../js/content/i18n/de.js";
import en from "../js/content/i18n/en.js";
import { SIZES, VIDEO } from "./gen-landing-media.mjs";

export const SITE = "https://headstars.app";
const I18N = { de, en };
// Sperren der Online-Modi stehen in js/app/matchmaking.js (zieht Browser-Code nach, daher hier nur gelesen)
const mm = readFileSync(new URL("../js/app/matchmaking.js", import.meta.url), "utf8").match(/MIN_LEVEL = \{ casual: (\d+), ranked: (\d+) \}/);
if (!mm) throw new Error("MIN_LEVEL in js/app/matchmaking.js nicht gefunden");
const MIN_LEVEL = { casual: +mm[1], ranked: +mm[2] };
// Symbole aus dem Spiel (index.html), damit die Seiten dieselben Icons zeigen
const INDEX = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const symbol = id => { const m = INDEX.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`)); if (!m) throw new Error("Symbol fehlt: " + id); return m[0]; };
const ICONS = ["i-play", "i-users", "i-globe", "i-trophy", "i-star", "i-cal", "i-inf", "i-target", "i-crown", "i-share", "i-bolt", "i-stadium"];

/** Seiten: Pfad, Sprache, Kennung für „Jetzt spielen“ (?src=), Gegenstück in der anderen Sprache (hreflang) */
export const PAGES = [
  { path: "/de/", lang: "de", src: "seo-de", kind: "main", alt: "/en/" },
  { path: "/de/gegen-freunde/", lang: "de", src: "seo-de-freunde", kind: "friends", alt: "/en/play-with-friends/" },
  { path: "/en/", lang: "en", src: "seo-en", kind: "main", alt: "/de/" },
  { path: "/en/play-with-friends/", lang: "en", src: "seo-en-friends", kind: "friends", alt: "/de/gegen-freunde/" },
];
/** Datei zur URL (GitHub Pages liefert für /de/ die Datei de/index.html) */
export const fileOf = path => path.slice(1) + "index.html";
/** hreflang-Gruppe einer Seite: beide Sprachen, x-default = Englisch */
export function alternates(p) {
  const de_ = p.lang === "de" ? p.path : p.alt, en_ = p.lang === "en" ? p.path : p.alt;
  return [["de", de_], ["en", en_], ["x-default", en_]];
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const playUrl = p => `/?src=${p.src}&amp;lang=${p.lang}`;
const kbd = s => `<kbd>${esc(s)}</kbd>`;
const icon = (id, cls = "lp-ico") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const pair = (p, kind) => PAGES.find(x => x.lang === p.lang && x.kind === kind).path;

// ---------- Bilder ----------
/** Seitenverhältnis der Aufnahmen (Breite x Höhe der größten Fassung) */
const DIMS = { scene: [1600, 1000], heads: [2400, 1200], arena: [1600, 900], mode: [600, 340], step: [1920, 1080], head: [512, 512] };
/** Bild mit AVIF und WebP in mehreren Breiten; eager nur für das, was im ersten Bildschirm steht */
function pic(name, kind, alt, { sizes = "(min-width: 960px) 52vw, 100vw", cls = "", eager = false } = {}) {
  const ws = kind === "head" ? [256] : SIZES[kind === "heads" ? "heads" : kind];
  const set = ext => ws.map(w => `/landing/${name}-${w}.${ext} ${w}w`).join(", ");
  const [w, h] = DIMS[kind];
  return `<picture${cls ? ` class="${cls}"` : ""}><source type="image/avif" srcset="${set("avif")}" sizes="${sizes}"><img src="/landing/${name}-${ws[Math.min(1, ws.length - 1)]}.webp" srcset="${set("webp")}" sizes="${sizes}" width="${w}" height="${h}" alt="${esc(alt)}"${eager ? "" : ` loading="lazy"`} decoding="async"></picture>`;
}
/** Alle Dateien, die eine Seite aus landing/ einbindet (für den Test) */
export const mediaOf = html => [...new Set([...html.matchAll(/\/landing\/[\w.-]+/g)].map(m => m[0].slice(1)))];

const UI = {
  de: { play: "Jetzt spielen", facts: ["Kostenlos", "Ohne Download", "Ohne Anmeldung"], faq: "Häufige Fragen", other: "English",
    otherLong: "This page in English", legal: ["Impressum", "Datenschutz", "Nutzungsbedingungen"], main: "Spielinfos",
    friends: "Gegen Freunde spielen", ctaNote: "Startet direkt im Browser, auf Handy, Tablet und PC.",
    video: "Spielszene aus Headstars: zwei Köpfe spielen Kopfball-Fußball im Stadion", online: "Online", offline: "Gegen den Computer oder zu zweit",
    endTitle: "Anpfiff in zehn Sekunden" },
  en: { play: "Play now", facts: ["Free", "No download", "No sign-up"], faq: "FAQ", other: "Deutsch",
    otherLong: "Diese Seite auf Deutsch", legal: ["Legal Notice", "Privacy", "Terms"], main: "Game guide",
    friends: "Play with friends", ctaNote: "Starts right in your browser, on phone, tablet and PC.",
    video: "Gameplay from Headstars: two heads play header soccer in the stadium", online: "Online", offline: "Against the computer or two players",
    endTitle: "Kick-off in ten seconds" },
};

// ---------- Bausteine aus dem Spiel ----------
const n = { heads: CHARS.length, arenas: ARENAS.length, pus: Object.keys(POWERUPS).length,
  start: ARENAS.filter(a => !a.level && !a.season).length, byLevel: ARENAS.filter(a => a.level).length, bySeason: ARENAS.filter(a => a.season).length };
const lockNote = (L, id) => {
  if (id === "casual") return L["lock.level"].replace("{n}", MIN_LEVEL.casual);
  if (id === "ranked") return L["lock.level"].replace("{n}", MIN_LEVEL.ranked) + ", " + L["lock.account"];
  return "";
};
function modeCards(lang, side) {
  const L = I18N[lang];
  return `<ul class="lp-modes">${MODES.filter(m => m.side === side).map(m => {
    const lock = lockNote(L, m.id), name = L[`mode.${m.id}.name`];
    return `<li class="lp-mode">${pic("mode-" + m.id, "mode", "", { sizes: "(min-width: 960px) 300px, 50vw", cls: "lp-mode__art" })}<div class="lp-mode__body"><h4 class="lp-mode__name">${icon(m.icon)}${esc(name)}</h4><p class="lp-mode__desc">${esc(L[`mode.${m.id}.desc`])}</p>${lock ? `<p class="lp-mode__lock">${esc(lock)}</p>` : ""}</div></li>`;
  }).join("")}</ul>`;
}
function headChips(lang) {
  const L = I18N[lang];
  return `<ul class="lp-heads">${CHARS.map(c => `<li class="lp-head">${pic("head-" + c.id, "head", "", { sizes: "56px", cls: "lp-head__img" })}<span class="lp-head__name">${esc(c.name)}</span><span class="lp-head__super">${esc(L[`super.${c.super}.name`])}</span></li>`).join("")}</ul>`;
}
function arenaMosaic(lang) {
  const L = I18N[lang];
  return `<ul class="lp-arenas">${ARENAS.map(a => `<li class="lp-arena">${pic("arena-" + a.id, "arena", "", { sizes: "(min-width: 960px) 240px, 45vw" })}<span class="lp-arena__name">${esc(L[`arena.${a.id}.name`])}</span></li>`).join("")}</ul>`;
}
// Steuerung wie in den Einstellungen des Spiels (js/ui/screens/settings.js)
function controls(lang) {
  const L = I18N[lang], s = k => L["html.settings." + k];
  const rows = [
    [s("laufen"), kbd("A") + kbd("D"), s("stick"), s("linksZiehen")],
    [s("springen"), kbd("W"), "A", s("linksHoch")],
    [s("graetscheBombe"), kbd("S"), s("stick2"), s("linksRunter")],
    [s("schuss"), kbd(s("leer")), s("xB"), L["ctl.shootBtn"]],
    [s("super"), kbd("E"), s("yRb"), L["ctl.superBtn"]],
  ];
  return `<div class="lp-keys"><table class="lp-keys__table">
<thead><tr><th scope="col"><span class="lp-sr">${lang === "de" ? "Aktion" : "Action"}</span></th><th scope="col">${esc(L["ctl.keyboard"])}</th><th scope="col">${esc(s("controller"))}</th><th scope="col">${esc(s("touch"))}</th></tr></thead>
<tbody>${rows.map(([a, k, p, t]) => `<tr><th scope="row">${esc(a)}</th><td>${k}</td><td>${p === "A" ? kbd("A") : esc(p)}</td><td>${esc(t)}</td></tr>`).join("")}</tbody>
</table></div>`;
}

// ---------- Abschnitte ----------
/** Bild links/rechts im Wechsel, Text daneben (H2 + Fließtext); media = fertiges HTML oder Bild */
const feature = (s, i) => `<section class="lp-feature${i % 2 ? " lp-feature--flip" : ""}${s.wide ? " lp-feature--wide" : ""}" id="${s.id}">
<div class="lp-feature__media">${s.media}</div>
<div class="lp-feature__text">
<h2 class="lp-h2">${esc(s.h2)}</h2>
${s.html}
</div>${s.after ? `\n<div class="lp-feature__after">${s.after}</div>` : ""}
</section>`;
const panel = s => `<section class="lp-panel" id="${s.id}">
<h2 class="lp-h2 lp-h2--ink">${esc(s.h2)}</h2>
${s.html}
</section>`;

function mainPage(p) {
  const L = I18N[p.lang], U = UI[p.lang], pu = ["boot", "time", "portal"].map(k => esc(L[`pu.${k}.name`])), friends = pair(p, "friends");
  const modes = `<h3 class="lp-h3">${U.online}</h3>\n${modeCards(p.lang, "on")}\n<h3 class="lp-h3">${U.offline}</h3>\n${modeCards(p.lang, "off")}`;
  if (p.lang === "de") return {
    title: "Kopfball-Fußball online spielen – kostenlos im Browser | Headstars",
    desc: "Kopfball-Fußball im Browser: 1 gegen 1 gegen den Computer, gegen Spieler aus aller Welt oder per Link gegen Freunde. Kostenlos, ohne Download, ohne Anmeldung.",
    h1: "Kopfball-Fußball online spielen",
    lead: "Eins gegen eins mit großen Köpfen: laufen, springen, köpfen, schießen. Gegen den Computer, gegen Gegner aus aller Welt oder gegen deine Freunde, direkt im Browser.",
    sections: [
      { id: "spielen", media: pic("scene-head", "scene", "Kopfball in Headstars: ein Kopf springt hoch und köpft den Ball Richtung Tor"), h2: "Köpfen, schießen, grätschen",
        html: `<p>Zwei Spieler, ein Ball, zwei Tore. Wie der Ball fliegt, hängt vom Moment des Treffers ab: Ein ruhender Ball geht im Bogen, ein Ball in Kopfhöhe flach, und in der Luft wird daraus ein Volley.</p>
<p>Am Boden grätschst du, in der Luft landest du mit einer Arschbombe, je höher, desto härter. Wer das Timing raus hat, köpft den Ball aus der Luft ins Tor.</p>` },
      { id: "koepfe", media: pic("heads-group", "heads", `Alle ${n.heads} Köpfe aus Headstars nebeneinander`, { cls: "lp-cutout" }), h2: `${n.heads} Köpfe, jeder mit eigenem Super-Schuss`,
        html: `<p>Jeder Kopf spielt sich anders: schneller, sprungstärker oder mit mehr Wucht im Schuss. Ist deine Super-Leiste voll, zündest du seinen Super-Schuss.</p>`, after: headChips("de"), wide: true },
      { id: "supers", media: pic("scene-super", "scene", "Ein Super-Schuss fliegt über das Spielfeld in Headstars"), h2: "Super-Schüsse und Power-ups",
        html: `<p>Feuerball, Eisschuss, Donnerkeil: Ein Super-Schuss kann ein Spiel drehen. Dazu tauchen ${n.pus} verschiedene Power-ups auf dem Feld auf, etwa ${pu[0]}, ${pu[1]} oder ${pu[2]}.</p>
<p>Im schnellen Spiel und gegen Freunde stellst du selbst ein, ob und wie oft Power-ups kommen und ob Super-Schüsse erlaubt sind.</p>` },
      { id: "arenen", wide: true, media: arenaMosaic("de"), h2: `${n.arenas} Arenen mit eigener Physik`,
        html: `<p>In der ${esc(L["arena.eis.name"])} rutschst du, auf dem ${esc(L["arena.mond.name"])} springst du riesig, und am ${esc(L["arena.strand.name"])} bremst der Sand den Ball. ${n.start} Arenen sind von Anfang an da, ${n.byLevel} schaltest du über dein Level frei, ${n.bySeason} weitere kommen mit den Saisons.</p>` },
      { panel: true, id: "modi", h2: "Spielmodi", html: modes },
      { id: "freunde", media: pic("scene-goal-de", "scene", "Torjubel in Headstars nach einem Treffer"), h2: "Zu zweit oder online gegen Freunde",
        html: `<p>Sitzt ihr nebeneinander, spielt ihr im Modus „${esc(L["mode.local.name"])}“ an einem Gerät: an einer Tastatur, mit zwei Controllern oder auf einem geteilten Touchscreen.</p>
<p>Seid ihr nicht am selben Ort, reicht ein Link: Raum erstellen, Link schicken, anpfeifen. <a href="${friends}">So spielst du online gegen Freunde</a>.</p>` },
      { panel: true, id: "steuerung", h2: "Steuerung", html: `${controls("de")}
<p>Springen kurz tippen: halb hoch, halten: voll. Spielt ihr zu zweit an einer Tastatur, nimmt Spieler 2 ${kbd("←")}${kbd("→")} zum Laufen, ${kbd("↑")} zum Springen, ${kbd("↓")} für die Grätsche, ${kbd("Enter")} zum Schießen und ${kbd(".")} für den Super-Schuss. Auf dem Handy spielst du am besten quer.</p>` },
    ],
    faq: [
      ["Ist Headstars kostenlos?", `Ja. Headstars kostet nichts. Münzen und Juwelen für neue Köpfe, Bälle und Arenen verdienst du beim Spielen.${PAYMENTS ? " Einzelne Inhalte kannst du optional kaufen." : " Käufe mit echtem Geld gibt es nicht."}`],
      ["Muss ich etwas installieren oder ein Konto anlegen?", "Nein. Headstars läuft im Browser. Beim ersten Start legt das Spiel ein Gastkonto an, ohne E-Mail und ohne Passwort. Willst du deinen Fortschritt sichern oder auf einem anderen Gerät weiterspielen, verknüpfst du das Konto mit deiner E-Mail-Adresse. Nur für Ranked ist das Pflicht."],
      ["Läuft Headstars auf dem Handy?", "Ja. Auf Handy und Tablet steuerst du per Touch, am besten im Querformat. Bietet dein Browser es an, installierst du Headstars wie eine App (Einstellungen → App installieren)."],
      ["Kann ich mit Controller spielen?", "Ja. Die Belegung steht in der Tabelle unter „Steuerung“. Spielt ihr zu zweit an einem Gerät, kann jeder einen eigenen Controller nehmen."],
      ["Wie spiele ich gegen Freunde?", `Raum erstellen, Link schicken, anpfeifen. Die Anleitung Schritt für Schritt: <a href="${friends}">Online gegen Freunde spielen</a>.`],
    ],
  };
  return {
    title: "Header Soccer Online – Free 1v1 Browser Game | Headstars",
    desc: "A 1v1 header soccer game in your browser: play the computer, players from around the world or a friend by link. Free, no download, no sign-up.",
    h1: "Play header soccer online",
    lead: "One-on-one soccer with oversized heads: run, jump, head and shoot. Against the computer, opponents from around the world or your friends, right in your browser.",
    sections: [
      { id: "play", media: pic("scene-head", "scene", "A header in Headstars: a head jumps and heads the ball towards the goal"), h2: "Head it, shoot it, slide in",
        html: `<p>Two players, one ball, two goals. How the ball flies depends on the moment you hit it: a ball at rest goes up in an arc, a ball at head height flies low, and in the air you hit a volley.</p>
<p>On the ground you slide tackle, in the air you come down with a ground pound, and the higher you are, the harder it lands. Get the timing right and you head the ball straight out of the air into the goal.</p>` },
      { id: "heads", media: pic("heads-group", "heads", `All ${n.heads} heads from Headstars side by side`, { cls: "lp-cutout" }), h2: `${n.heads} heads, each with its own special shot`,
        html: `<p>Every head plays differently: faster, jumping higher or shooting harder. Once your super meter is full, you unleash its special shot.</p>`, after: headChips("en"), wide: true },
      { id: "supers", media: pic("scene-super", "scene", "A special shot flies across the pitch in Headstars"), h2: "Special shots and power-ups",
        html: `<p>Fireball, Ice Shot, Thunderbolt: one special shot can turn a match around. On top of that, ${n.pus} different power-ups appear on the pitch, such as ${pu[0]}, ${pu[1]} or ${pu[2]}.</p>
<p>In quick matches and against friends you decide whether and how often power-ups appear and whether special shots are allowed.</p>` },
      { id: "arenas", wide: true, media: arenaMosaic("en"), h2: `${n.arenas} arenas with their own physics`,
        html: `<p>You slide around the ${esc(L["arena.eis.name"])}, jump sky-high on the ${esc(L["arena.mond.name"])}, and on the ${esc(L["arena.strand.name"])} the sand slows the ball down. ${n.start} arenas are there from the start, you unlock ${n.byLevel} through your level, and ${n.bySeason} more come with the seasons.</p>` },
      { panel: true, id: "modes", h2: "Game modes", html: modes },
      { id: "friends", media: pic("scene-goal-en", "scene", "Goal celebration in Headstars after a goal"), h2: "Two players or online with friends",
        html: `<p>Sitting next to each other? Pick “${esc(L["mode.local.name"])}” and play on one device: on one keyboard, with two controllers or on a split touchscreen.</p>
<p>Not in the same place? A link is all it takes: create a room, send the link, kick off. <a href="${friends}">How to play online with friends</a>.</p>` },
      { panel: true, id: "controls", h2: "Controls", html: `${controls("en")}
<p>Tap jump for half height, hold it to jump fully. When two of you share a keyboard, player 2 uses ${kbd("←")}${kbd("→")} to run, ${kbd("↑")} to jump, ${kbd("↓")} to slide, ${kbd("Enter")} to shoot and ${kbd(".")} for the special shot. On a phone, play in landscape.</p>` },
    ],
    faq: [
      ["Is Headstars free?", `Yes. Headstars costs nothing. You earn coins and gems for new heads, balls and arenas by playing.${PAYMENTS ? " Some content can optionally be bought." : " There are no real-money purchases."}`],
      ["Do I need to install anything or create an account?", "No. Headstars runs in your browser. On first start the game creates a guest account, with no email and no password. If you want to save your progress or keep playing on another device, link the account to your email address. Only Ranked requires that."],
      ["Does Headstars work on my phone?", "Yes. On phones and tablets you play with touch controls, best in landscape. If your browser offers it, you can install Headstars like an app (Settings → Install app)."],
      ["Can I play with a controller?", "Yes. The button layout is in the table under “Controls”. When two of you play on one device, each player can use their own controller."],
      ["How do I play against friends?", `Create a room, send the link, kick off. Step by step: <a href="${friends}">Play soccer with friends online</a>.`],
    ],
  };
}

function friendsPage(p) {
  const L = I18N[p.lang], main = pair(p, "main"), len = esc(["0", "1", "2"].map(i => L["rule.len.opt." + i]).join(", "));
  const steps = (list, alts) => `<ol class="lp-steps">${list.map(([h, t], i) => `<li class="lp-step">${pic(`step-${p.lang}-${i + 1}`, "step", alts[i], { sizes: "(min-width: 960px) 380px, 100vw", cls: "lp-step__img" })}<div class="lp-step__body"><h3 class="lp-step__title"><span class="lp-step__num" aria-hidden="true">${i + 1}</span>${esc(h)}</h3><p>${t}</p></div></li>`).join("")}</ol>`;
  if (p.lang === "de") return {
    title: "Fußball online gegen Freunde – per Link, ohne Anmeldung | Headstars",
    desc: "Online gegen Freunde spielen per Link: Raum erstellen, Link schicken, anpfeifen. Kopfball-Fußball im Browser auf Handy, Tablet und PC, kostenlos und ohne Anmeldung.",
    h1: "Fußball online gegen Freunde – einfach per Link",
    lead: "Schick deinem Freund einen Link, er tippt drauf und ihr spielt. Kein Download, keine Anmeldung, keine App, auch vom Handy gegen den PC.",
    sections: [
      { panel: true, id: "so-gehts", h2: "So geht's in drei Schritten", html: steps([
        ["Raum erstellen", `Tippe auf „Jetzt spielen“. Wähle unter „${esc(L["html.home.modus"])}“ den Modus „${esc(L["mode.online.name"])}“, tippe auf „${esc(L["html.home.spielen"])}“ und dann auf „${esc(L["html.online.raumErstellen"])}“.`],
        ["Link schicken", "Du bekommst einen Link, einen QR-Code und einen vierstelligen Raumcode. Schick den Link über deinen Messenger, oder lass deinen Freund den QR-Code scannen."],
        ["Anpfiff", "Dein Freund öffnet den Link und landet direkt in deiner Lobby. Jeder wählt seinen Kopf, du stellst Arena und Regeln ein und pfeifst an."],
      ], ["Online-Menü von Headstars mit dem Knopf „Raum erstellen“", "Lobby mit Raumcode, QR-Code und Knopf „Link teilen“", "Lobby, nachdem der Freund über den Link beigetreten ist"]) },
      { id: "brauchst", media: pic("scene-head", "scene", "Online-Spiel in Headstars: Kopfball vor dem Tor"), h2: "Was ihr braucht",
        html: `<ul class="lp-list"><li>einen aktuellen Browser auf Handy, Tablet oder PC,</li><li>eine Internetverbindung. Das Spiel verbindet eure Geräte direkt; lässt euer Netz das nicht zu, läuft die Verbindung über einen Relay-Server,</li><li>kein Konto, keine App und kein Geld.</li></ul>` },
      { id: "regeln", media: pic("scene-super", "scene", "Super-Schuss in einem Spiel mit eigenen Regeln"), h2: "Eure Regeln",
        html: `<p>Als Gastgeber legst du fest, wie gespielt wird: Arena, Hindernisse, Spiellänge (${len} oder bis ${esc(L["rule.len.opt.3"])} bzw. ${esc(L["rule.len.opt.4"])}), Tempo, Schussstärke, Abprall, Ball-, Tor- und Feldgröße, Schwerkraft, Power-ups und Super-Schüsse.</p><p>Nach dem Abpfiff geht es mit einer Revanche direkt weiter.</p>` },
      { id: "zu-zweit", media: pic("scene-goal-de", "scene", "Torjubel nach einem Treffer in Headstars"), h2: "Zu zweit an einem Gerät",
        html: `<p>Sitzt ihr nebeneinander, braucht ihr keinen Link: Im Modus „${esc(L["mode.local.name"])}“ spielt ihr an einem Gerät, an einer Tastatur, mit zwei Controllern oder auf einem geteilten Touchscreen.</p><p>Alle Modi, Köpfe und die Steuerung: <a href="${main}">Kopfball-Fußball online spielen</a>.</p>` },
    ],
    faq: [
      ["Muss sich mein Freund anmelden oder etwas installieren?", "Nein. Er öffnet den Link im Browser und ist in deiner Lobby."],
      ["Kann ich vom Handy gegen jemanden am PC spielen?", "Ja. Headstars läuft auf allen Geräten im Browser, und ihr spielt über dieselbe Lobby."],
      ["Was, wenn der Link nicht ankommt?", `Dein Freund wählt im Spiel ebenfalls „${esc(L["mode.online.name"])}“ und gibt unter „${esc(L["html.online.codeVonDeinemKumpel"])}“ den vierstelligen Raumcode ein.`],
      ["Was passiert, wenn die Verbindung abreißt?", "Das Spiel hält an und wartet kurz auf die Gegenseite. Kommt sie zurück, geht es an derselben Stelle weiter."],
      ["Kann ich auch gegen fremde Spieler antreten?", `Ja, in ${esc(L["mode.casual.name"])} (${esc(lockNote(L, "casual"))}) und ${esc(L["mode.ranked.name"])} (${esc(lockNote(L, "ranked"))}). Mehr dazu unter <a href="${main}">Spielmodi</a>.`],
      ["Kostet das Online-Spiel etwas?", "Nein. Headstars ist kostenlos, auch online."],
    ],
  };
  return {
    title: "Play Soccer with Friends Online via Link | Headstars",
    desc: "Play soccer online with friends via link: create a room, send the link, kick off. 1v1 in the browser on phone, tablet and PC, free and without sign-up.",
    h1: "Play soccer with friends online – just send a link",
    lead: "Send your friend a link, they tap it, and you play. No download, no sign-up, no app, even from your phone against a PC.",
    sections: [
      { panel: true, id: "how", h2: "Three steps to kick-off", html: steps([
        ["Create a room", `Tap “Play now”. Under “${esc(L["html.home.modus"])}” pick “${esc(L["mode.online.name"])}”, tap “${esc(L["html.home.spielen"])}” and then “${esc(L["html.online.raumErstellen"])}”.`],
        ["Send the link", "You get a link, a QR code and a four-character room code. Send the link through your messenger, or let your friend scan the QR code."],
        ["Kick off", "Your friend opens the link and lands right in your lobby. Each of you picks a head, you choose the arena and rules, and you kick off."],
      ], ["Headstars online menu with the “Create room” button", "Lobby with room code, QR code and “Share link” button", "Lobby after the friend joined through the link"]) },
      { id: "need", media: pic("scene-head", "scene", "Online match in Headstars: a header in front of the goal"), h2: "What you need",
        html: `<ul class="lp-list"><li>a current browser on a phone, tablet or PC,</li><li>an internet connection. The game connects your devices directly; if your network does not allow that, the connection runs through a relay server,</li><li>no account, no app and no money.</li></ul>` },
      { id: "rules", media: pic("scene-super", "scene", "A special shot in a match with custom rules"), h2: "Your rules",
        html: `<p>If you have played head soccer games before, you know the idea: two oversized heads, one ball, two goals. In Headstars the host decides how you play: arena, obstacles, match length (${len} or first to ${esc(L["rule.len.opt.3"])} or ${esc(L["rule.len.opt.4"])}), speed, shot power, bounce, ball, goal and field size, gravity, power-ups and special shots.</p><p>After the final whistle, go straight into a rematch.</p>` },
      { id: "two", media: pic("scene-goal-en", "scene", "Goal celebration after a goal in Headstars"), h2: "Two players on one device",
        html: `<p>Sitting next to each other? Then you don't need a link: pick “${esc(L["mode.local.name"])}” and play on one device, on one keyboard, with two controllers or on a split touchscreen.</p><p>All modes, heads and controls: <a href="${main}">Play header soccer online</a>.</p>` },
    ],
    faq: [
      ["Does my friend need to sign up or install anything?", "No. They open the link in their browser and they are in your lobby."],
      ["Can I play from my phone against someone on a PC?", "Yes. Headstars runs in the browser on every device, and you meet in the same lobby."],
      ["What if the link doesn't arrive?", `Your friend also picks “${esc(L["mode.online.name"])}” in the game and enters the four-character room code under “${esc(L["html.online.codeVonDeinemKumpel"])}”.`],
      ["What happens if the connection drops?", "The game pauses and waits briefly for the other side. If it comes back, you continue right where you left off."],
      ["Can I play against strangers too?", `Yes, in ${esc(L["mode.casual.name"])} (${esc(lockNote(L, "casual"))}) and ${esc(L["mode.ranked.name"])} (${esc(lockNote(L, "ranked"))}). More under <a href="${main}">game modes</a>.`],
      ["Does playing online cost anything?", "No. Headstars is free, online too."],
    ],
  };
}

// ---------- Seite ----------
function page(p) {
  const c = p.kind === "main" ? mainPage(p) : friendsPage(p), u = UI[p.lang], other = PAGES.find(x => x.path === p.alt);
  const sibling = PAGES.find(x => x.lang === p.lang && x !== p);
  const cta = (cls = "") => `<a class="lp-btn${cls}" href="${playUrl(p)}">${icon("i-play", "lp-btn__ico")}<span>${u.play}</span></a>`;
  const legal = ["imprint", "privacy", "terms"].map((f, i) => `<a href="/legal/${f}.html?lang=${p.lang}">${u.legal[i]}</a>`).join("");
  const poster = `/landing/poster-${p.lang}`;
  let fi = 0;
  const body = c.sections.map(s => (s.panel ? panel(s) : feature(s, fi++))).join("\n");
  return `<!doctype html>
<!-- ERZEUGT von tools/gen-seo.mjs. Nicht von Hand ändern: dort anpassen, dann npm run seo. -->
<html lang="${p.lang}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<link rel="canonical" href="${SITE}${p.path}">
${alternates(p).map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${SITE}${h}">`).join("\n")}
<meta name="theme-color" content="#0d2275">
<meta property="og:title" content="${esc(c.h1)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:image" content="${SITE}/og.jpg">
<meta property="og:url" content="${SITE}${p.path}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${p.lang === "de" ? "de_DE" : "en_US"}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preload" as="image" href="${poster}-640.webp" imagesrcset="${SIZES.poster.map(w => `${poster}-${w}.webp ${w}w`).join(", ")}" imagesizes="(max-width: 899px) 40vw, 100vw" fetchpriority="high">
<link rel="preload" href="/fonts/lilita.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/landing.css">
</head>
<body class="lp">
<svg class="lp-sprite" aria-hidden="true">${ICONS.map(symbol).join("")}</svg>
<header class="lp-top">
<a class="lp-top__brand" href="${playUrl(p)}"><img src="/icons/wordmark.webp" width="600" height="200" alt="Headstars"></a>
<a class="lp-top__lang" href="${other.path}" hreflang="${other.lang}" lang="${other.lang}" title="${esc(u.otherLong)}">${icon("i-globe")}${u.other}</a>
</header>
<main>
<section class="lp-hero">
<div class="lp-hero__stage" aria-hidden="true"><img class="lp-hero__backdrop" src="${poster}-640.webp" srcset="${SIZES.poster.map(w => `${poster}-${w}.webp ${w}w`).join(", ")}" sizes="(max-width: 899px) 40vw, 100vw" width="${VIDEO[0]}" height="${VIDEO[1]}" alt="" fetchpriority="high"></div>
<div class="lp-hero__screen"><img class="lp-hero__still" src="${poster}-960.webp" width="${VIDEO[0]}" height="${VIDEO[1]}" alt=""><video class="lp-hero__video" autoplay muted loop playsinline preload="auto" poster="${poster}-960.webp" width="${VIDEO[0]}" height="${VIDEO[1]}" aria-label="${esc(u.video)}"><source src="/landing/gameplay-${p.lang}.mp4" type="video/mp4"></video></div>
<div class="lp-hero__body">
<h1 class="lp-hero__title">${esc(c.h1)}</h1>
<p class="lp-hero__lead">${esc(c.lead)}</p>
<div class="lp-hero__cta">${cta(" lp-btn--hero")}</div>
<ul class="lp-hero__facts">${u.facts.map(f => `<li>${f}</li>`).join("")}</ul>
</div>
</section>
${body}
<section class="lp-panel lp-faq" id="faq">
<h2 class="lp-h2 lp-h2--ink">${u.faq}</h2>
${c.faq.map(([q, a]) => `<h3 class="lp-faq__q">${esc(q)}</h3>\n<p class="lp-faq__a">${a}</p>`).join("\n")}
</section>
<section class="lp-end">
${pic("scene-super", "scene", "", { sizes: "100vw", cls: "lp-end__bg" })}
<div class="lp-end__body">
<h2 class="lp-h2 lp-end__title">${u.endTitle}</h2>
${cta(" lp-btn--hero")}
<p class="lp-end__note">${u.ctaNote}</p>
</div>
</section>
</main>
<div class="lp-sticky">${cta()}</div>
<footer class="lp-foot">
<nav class="lp-foot__nav"><a href="${sibling.path}">${sibling.kind === "main" ? u.main : u.friends}</a><a href="${other.path}" hreflang="${other.lang}" lang="${other.lang}">${u.other}</a>${legal}</nav>
</footer>
</body>
</html>
`;
}

/** Startseite plus alle Infoseiten, je Seite mit hreflang-Gruppe */
export function sitemap() {
  const url = (loc, alt = []) => `<url><loc>${SITE}${loc}</loc>${alt.map(([l, h]) => `\n  <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${h}"/>`).join("")}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[url("/"), ...PAGES.map(p => url(p.path, alternates(p)))].join("\n")}
</urlset>
`;
}
export const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;

/** Alle erzeugten Dateien: Pfad relativ zum Projekt → Inhalt */
export function seoFiles() {
  return { ...Object.fromEntries(PAGES.map(p => [fileOf(p.path), page(p)])), "sitemap.xml": sitemap(), "robots.txt": robots() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [f, body] of Object.entries(seoFiles())) {
    const to = new URL("../" + f, import.meta.url);
    mkdirSync(dirname(fileURLToPath(to)), { recursive: true });
    writeFileSync(to, body);
  }
  console.log("Infoseiten, sitemap.xml und robots.txt geschrieben");   // i18n-ok
}
