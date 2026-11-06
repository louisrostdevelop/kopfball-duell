# Headstars

Head Soccer im Browser. 1 gegen 1, große Köpfe, kleine Tore. Läuft auf Handy, Tablet und PC, ohne Download und ohne Account.

**Spielen:** https://louisrostdevelop.github.io/kopfball-duell/

## Was drin ist

- **22 Köpfe**, jeder mit eigenem Spezialschuss: Feuerball, Eisschuss, Donnerkeil, Rakete, Bananenflanke, Flummi, Geisterball, Riesenball, Tornado, Magnetschuss, Meteor, Dreifach. Dazu 10 Meme- und Szene-Köpfe (Emo, Rapper, Raver, Gamer, NPC, Steinkopf, Krypto-Bro, Sigma, Kinn-Chad, Brezelini Kickerini) mit Sad-Ball, Flex-Ball, Bass-Drop, Aimbot, Copy-Paste, Steinschlag, Kryptoball, Ghosting, Rizz-Ball und Brezel-Looping.
- **12 Power-ups**, die man mit dem Ball abschießt: Riesenkopf, Mini-Gegner, Einfrieren, Turbo, Sprungfeder, Feuerschuss, Torwand, Riesentor, Super voll, Verwirrung, Doppelsprung, Rückenwind. Alles bleibt abwehrbar.
- **9 Arenen** mit eigener Physik: Flutlicht, Strand (Sand bremst), Neon City (schneller, ab Level 5), Eishalle (rutschig, ab Level 10), Mond (wenig Schwerkraft, ab Level 15), dazu Vulkan (Geysire), Skatepark (Rampen), Tiefsee (Blasen, alles langsamer) und Backrooms (Noclip-Türen). Die neuen kommen je Saison in den Pass und danach in den Shop.
- **10 Modi:** Schnelles Spiel (4 Stufen), Cup mit 3 Runden, Karriere (4 Ligen, 20 feste Gegner, bis zu 3 Sterne pro Spiel, Bonus pro Liga), Casual und Ranked (Gegnersuche, mit Server; in Ranked kommen Power-ups immer als Paar, eins pro Seite), mit Freunden per Link oder QR-Code, zu zweit an einem Gerät, Tages-Challenge, Endlos (Siege am Stück), Training gegen einen Torwart.
- **Eigene Regeln:** Schussstärke, Abprall, Ballgröße, Tore, Tempo, Sieg (Zeit oder Erster bis 3/5), unter „Mehr“ Schwerkraft, Boden, Power-ups, Spezialschüsse. Drei Vorlagen (Chaos, Mondfußball, Eisfläche) und bis zu fünf eigene Presets. Online stellt der Gastgeber die Regeln ein.
- **Hindernisse:** pro Arena drei spiegelbildliche Layouts oder Zufall, alle auch auf dem Handy voll sichtbar (Regeln und Messwerte in [docs/ARENEN.md](docs/ARENEN.md)). Dazu Feldgröße Klein/Normal/Groß.
- **Schuss:** halten lädt auf, loslassen schießt. Voll geladen fliegt der Ball härter und höher. Sauber mit dem Fuß getroffen gibt am meisten Wumms, ein geladener Kopfball etwas weniger.
- Golden Goal bei Gleichstand, Zeitlupe und Wiederholung nach jedem Tor, Emotes.
- **Fortschritt:** Münzen, Level, Tagesbonus, tägliche Aufgaben, Angebot des Tages, Shop für Köpfe, Bälle und Arenen, 16 Erfolge. Wird im Browser gespeichert.
- **Kisten:** bei jedem Level-Up (Bronze bis Legendär), für Tages- und Wochenaufgaben, Tages-Challenge, Erfolgs-Stufen, Karriere-Ligen, Kopf-Meisterschaft, Pass und Ranked-Saisonende, mit Köpfen und Kosmetik (10 Schuh-Skins, Rest vorerst Platzhalter). Rahmen für die Spieler-Karte: Meister-Rahmen pro Kopf, Medaillen für Siege-Erfolge, Pass- und Liga-Rahmen, animiert, Chancen offen, Garantien, doppelte werden zu Splittern oder Kopf-XP. Nur erspielbar.
- **Meisterschaft pro Kopf:** 5 Stufen mit Titel, Rahmen, eigenem Emote und eigener Torexplosion.
- **Ausrüstung:** Schuhe, Torexplosion, Titel, Rahmen (sieht auch der Gegner), 4 Emote-Plätze (höchstens eins alle 3 s, Gegner stummschaltbar), Herstellen mit Splittern.
- **Mit Server (optional):** Konto, Juwelen-Shop, Saison-Pass, Kopf-Level (bis +25 %), Bestenlisten, Freunde. Siehe [docs/BACKEND.md](docs/BACKEND.md).
- **Deutsch und Englisch**, umschaltbar in den Einstellungen.
- Als App installierbar (Zum Home-Bildschirm hinzufügen), dann im Vollbild und offline spielbar.

## Steuerung

| | Laufen | Springen (kurz = halb, halten = voll) | Grätsche / Arschbombe | Schuss (halten = Power) | Super |
|---|---|---|---|---|---|
| Touch | links ziehen | hoch wischen | runter wischen | Schuss-Button | Super-Button |
| Spieler 1 | A / D | W | S | Leertaste | E oder Shift |
| Spieler 2 (lokal) | ← / → | ↑ | ↓ | Enter | . oder Shift rechts |
| Controller | Stick / Steuerkreuz | A | Stick oder Kreuz runter | X / B | Y / RB |

Runter am Boden ist eine Grätsche nach vorn oder hinten (spitzelt den Ball weg, lässt den Gegner kurz stolpern). Runter in der Luft ist eine Arschbombe: bringt dich sofort nach unten und quetscht einen Ball, der unter dir liegt, seitlich raus. Je höher du fällst, desto härter.

Emotes: Tasten 1 bis 6 oder der Smiley-Button oben links. Pause: Esc, P oder Start.

## Online

„Online“ → „Raum erstellen“ → Link oder QR-Code schicken. Der Kumpel öffnet den Link und ist direkt in der Lobby. Läuft Peer-to-Peer über WebRTC ([PeerJS](https://peerjs.com/)): der Gastgeber rechnet die Physik, der Gast schickt seine Tasten und sieht seine eigene Figur sofort (Vorhersage), alles andere wird geglättet. Der Spielstand geht über einen eigenen, unzuverlässigen Kanal (kein Warten auf verlorene Pakete), kompakt kodiert (~6 KB/s).

Manche Netze (Schule, Firma, manche Handynetze) blockieren direkte Verbindungen. Dann hilft meist ein anderes WLAN oder mobile Daten.

## Technik

Reines HTML, CSS und JavaScript (ES-Module) ohne Build-Schritt. Grafik komplett per Canvas gezeichnet, Sounds und Musik live per Web Audio erzeugt.

```
index.html, css/      Gerüst, Menüs, Aussehen
js/main.js            Einstiegspunkt: steckt Adapter ein und startet
js/content/           Spielinhalte: Köpfe, Arenen, Regeln, Hindernis-Layouts
js/core/              Spiellogik (sim/), Computer-Gegner, Fortschritt und Wirtschaft
js/app/               Ablauf: Spiel, Schleife, Effekte, Online, Modi, Spielende, Profil
js/ui/                Bildschirme, Navigation, Dialoge, Canvas-Zeichnen
js/ports/             Schnittstellen nach außen (Speicher, Konto, Verbindung, Ton, Eingabe)
js/adapters/          Umsetzungen: Web Audio, Touch/Tastatur/Controller, PeerJS, localStorage, Gast
tests/                Referenzspiele, Edge-Case-Matrix, Browser-Tests
tools/                Testserver, Service-Worker-Liste, Balancing-Simulationen
```

Aufbau und Regeln der Schichten, Server-Anbindung: siehe [ARCHITECTURE.md](ARCHITECTURE.md).

Lokal starten: `node tools/serve.mjs` und http://localhost:8765 öffnen. Tests: `npm test` (Spiellogik, Sekunden) und `npm run test:e2e` (Browser, nach `npm ci` und `npx playwright install chromium`).

Schriften: Lilita One und Nunito (SIL Open Font License), lokal eingebunden.
