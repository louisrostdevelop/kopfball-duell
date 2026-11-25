// Infoseiten auf Deutsch: Pfade, Oberfläche und Seitentexte (Aufbau und Bausteine: tools/gen-seo.mjs, Liste: tools/seo/langs.mjs)
import L from "../../js/content/i18n/de.js";

export default {
  lang: "de", L, locale: "de_DE",
  /** Name im Sprachumschalter der anderen Sprachen, Tooltip dazu */
  name: "Deutsch", thisPage: "Diese Seite auf Deutsch",
  /** Aufnahmen (tools/gen-landing-media.mjs): Browser-Sprache, Namen in der Einladungs-Lobby */
  media: { locale: "de-DE", host: "Lena", guest: "Tom" },
  ui: { play: "Jetzt spielen", facts: ["Kostenlos", "Ohne Download", "Ohne Anmeldung"], faq: "Häufige Fragen",
    legal: ["Impressum", "Datenschutz", "Nutzungsbedingungen"], main: "Spielinfos", friends: "Gegen Freunde spielen", langs: "Sprachen",
    ctaNote: "Startet direkt im Browser, auf Handy, Tablet und PC.",
    video: "Spielszene aus Headstars: zwei Köpfe spielen Kopfball-Fußball im Stadion", online: "Online", offline: "Gegen den Computer oder zu zweit",
    endTitle: "Bereit für den Anpfiff?", action: "Aktion" },
  pages: {
    main: { path: "/de/", src: "seo-de", build: ({ esc, pic, kbd, n, pu, path, modes, headChips, arenaMosaic, controls, PAYMENTS }) => ({
      title: "Kopfball-Fußball online spielen – kostenlos im Browser | Headstars",
      desc: "Kopfball-Fußball im Browser: 1 gegen 1 gegen den Computer, gegen Spieler aus aller Welt oder per Link gegen Freunde. Kostenlos, ohne Download, ohne Anmeldung.",
      h1: "Kopfball-Fußball online spielen",
      lead: "Eins gegen eins mit großen Köpfen: laufen, springen, köpfen, schießen. Gegen den Computer, gegen Gegner aus aller Welt oder gegen deine Freunde, direkt im Browser.",
      sections: [
        { id: "spielen", media: pic("scene-head", "scene", "Kopfball in Headstars: ein Kopf springt hoch und köpft den Ball Richtung Tor"), h2: "Köpfen, schießen, grätschen",
          html: `<p>Zwei Spieler, ein Ball, zwei Tore. Wie der Ball fliegt, hängt vom Moment des Treffers ab: Ein ruhender Ball geht im Bogen, ein Ball in Kopfhöhe flach, und in der Luft wird daraus ein Volley.</p>
<p>Am Boden grätschst du, in der Luft landest du mit einer Arschbombe, je höher, desto härter. Wer das Timing raus hat, köpft den Ball aus der Luft ins Tor.</p>` },
        { id: "koepfe", media: pic("heads-group", "heads", `Alle ${n.heads} Köpfe aus Headstars nebeneinander`, { cls: "lp-cutout" }), h2: `${n.heads} Köpfe, jeder mit eigenem Super-Schuss`,
          html: `<p>Jeder Kopf spielt sich anders: schneller, sprungstärker oder mit mehr Wucht im Schuss. Ist deine Super-Leiste voll, zündest du seinen Super-Schuss.</p>`, after: headChips(), wide: true },
        { id: "supers", media: pic("scene-super", "scene", "Ein Super-Schuss fliegt über das Spielfeld in Headstars"), h2: "Super-Schüsse und Power-ups",
          html: `<p>Feuerball, Eisschuss, Donnerkeil: Ein Super-Schuss kann ein Spiel drehen. Dazu tauchen ${n.pus} verschiedene Power-ups auf dem Feld auf, etwa ${pu[0]}, ${pu[1]} oder ${pu[2]}.</p>
<p>Im schnellen Spiel und gegen Freunde stellst du selbst ein, ob und wie oft Power-ups kommen und ob Super-Schüsse erlaubt sind.</p>` },
        { id: "arenen", wide: true, media: arenaMosaic(), h2: `${n.arenas} Arenen mit eigener Physik`,
          html: `<p>In der ${esc(L["arena.eis.name"])} rutschst du, auf dem ${esc(L["arena.mond.name"])} springst du riesig, und am ${esc(L["arena.strand.name"])} bremst der Sand den Ball. ${n.start} Arenen sind von Anfang an da, ${n.byLevel} schaltest du über dein Level frei, ${n.bySeason} weitere kommen mit den Saisons.</p>` },
        { panel: true, id: "modi", h2: "Spielmodi", html: modes() },
        { id: "freunde", media: pic("scene-goal-de", "scene", "Torjubel in Headstars nach einem Treffer"), h2: "Zu zweit oder online gegen Freunde",
          html: `<p>Sitzt ihr nebeneinander, spielt ihr im Modus „${esc(L["mode.local.name"])}“ an einem Gerät: an einer Tastatur, mit zwei Controllern oder auf einem geteilten Touchscreen.</p>
<p>Seid ihr nicht am selben Ort, reicht ein Link: Raum erstellen, Link schicken, anpfeifen. <a href="${path("friends")}">So spielst du online gegen Freunde</a>.</p>` },
        { panel: true, id: "steuerung", h2: "Steuerung", html: `${controls()}
<p>Springen kurz tippen: halb hoch, halten: voll. Spielt ihr zu zweit an einer Tastatur, nimmt Spieler 2 ${kbd("←")}${kbd("→")} zum Laufen, ${kbd("↑")} zum Springen, ${kbd("↓")} für die Grätsche, ${kbd("Enter")} zum Schießen und ${kbd(".")} für den Super-Schuss. Auf dem Handy spielst du am besten quer.</p>` },
      ],
      faq: [
        ["Ist Headstars kostenlos?", `Ja. Headstars kostet nichts. Münzen und Juwelen für neue Köpfe, Bälle und Arenen verdienst du beim Spielen.${PAYMENTS ? " Einzelne Inhalte kannst du optional kaufen." : " Käufe mit echtem Geld gibt es nicht."}`],
        ["Muss ich etwas installieren oder ein Konto anlegen?", "Nein. Headstars läuft im Browser. Beim ersten Start legt das Spiel ein Gastkonto an, ohne E-Mail und ohne Passwort. Willst du deinen Fortschritt sichern oder auf einem anderen Gerät weiterspielen, verknüpfst du das Konto mit deiner E-Mail-Adresse. Für Ranked und die Bestenlisten ist das nötig."],
        ["Läuft Headstars auf dem Handy?", "Ja. Auf Handy und Tablet steuerst du per Touch, am besten im Querformat. Bietet dein Browser es an, installierst du Headstars wie eine App (Einstellungen → App installieren)."],
        ["Kann ich mit Controller spielen?", "Ja. Die Belegung steht in der Tabelle unter „Steuerung“. Spielt ihr zu zweit an einem Gerät, kann jeder einen eigenen Controller nehmen."],
        ["Wie spiele ich gegen Freunde?", `Raum erstellen, Link schicken, anpfeifen. Die Anleitung Schritt für Schritt: <a href="${path("friends")}">Online gegen Freunde spielen</a>.`],
      ],
    }) },
    friends: { path: "/de/gegen-freunde/", src: "seo-de-freunde", build: ({ esc, pic, path, steps, len, lock }) => ({
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
          html: `<p>Sitzt ihr nebeneinander, braucht ihr keinen Link: Im Modus „${esc(L["mode.local.name"])}“ spielt ihr an einem Gerät, an einer Tastatur, mit zwei Controllern oder auf einem geteilten Touchscreen.</p><p>Alle Modi, Köpfe und die Steuerung: <a href="${path("main")}">Kopfball-Fußball online spielen</a>.</p>` },
      ],
      faq: [
        ["Muss sich mein Freund anmelden oder etwas installieren?", "Nein. Er öffnet den Link im Browser und ist in deiner Lobby."],
        ["Kann ich vom Handy gegen jemanden am PC spielen?", "Ja. Headstars läuft auf allen Geräten im Browser, und ihr spielt über dieselbe Lobby."],
        ["Was, wenn der Link nicht ankommt?", `Dein Freund wählt im Spiel ebenfalls „${esc(L["mode.online.name"])}“ und gibt unter „${esc(L["html.online.codeVonDeinemKumpel"])}“ den vierstelligen Raumcode ein.`],
        ["Was passiert, wenn die Verbindung abreißt?", "Das Spiel hält an und wartet kurz auf die Gegenseite. Kommt sie zurück, geht es an derselben Stelle weiter."],
        ["Kann ich auch gegen fremde Spieler antreten?", `Ja, in ${esc(L["mode.casual.name"])} (${esc(lock("casual"))}) und ${esc(L["mode.ranked.name"])} (${esc(lock("ranked"))}). Mehr dazu unter <a href="${path("main")}">Spielmodi</a>.`],
        ["Kostet das Online-Spiel etwas?", "Nein. Headstars ist kostenlos, auch online."],
      ],
    }) },
  },
};
