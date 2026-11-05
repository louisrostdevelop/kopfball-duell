# Kopfball Duell

Head Soccer im Browser. 1 gegen 1, große Köpfe, kleine Tore. Läuft auf Handy, Tablet und PC, ohne Download und ohne Account.

**Spielen:** https://louisrostdevelop.github.io/kopfball-duell/

## Was drin ist

- **12 Köpfe**, jeder mit eigenem Spezialschuss: Feuerball, Eisschuss, Donnerkeil, Rakete, Bananenflanke, Flummi, Geisterball, Riesenball, Tornado, Magnetschuss, Meteor, Dreifach.
- **12 Power-ups**, die man mit dem Ball abschießt: Riesenkopf, Mini-Gegner, Einfrieren, Turbo, Sprungfeder, Feuerschuss, Torwand, Riesentor, Super voll, Verwirrung, Doppelsprung, Rückenwind. Alles bleibt abwehrbar.
- **5 Arenen** mit eigener Physik: Flutlicht, Strand (Sand bremst), Neon City (schneller), Eishalle (rutschig), Mond (wenig Schwerkraft).
- **7 Modi:** Schnelles Spiel (4 Stufen), Cup mit 3 Runden, Online per Link oder QR-Code, zu zweit an einem Gerät, Tages-Challenge, Endlos (Siege am Stück), Training gegen einen Torwart.
- **Eigene Regeln:** Schussstärke, Abprall, Ballgröße, Tore, Tempo, Sieg (Zeit oder Erster bis 3/5), unter „Mehr“ Schwerkraft, Boden, Power-ups, Spezialschüsse. Drei Vorlagen (Chaos, Mondfußball, Eisfläche) und bis zu fünf eigene Presets. Online stellt der Gastgeber die Regeln ein.
- **Schuss:** halten lädt auf, loslassen schießt. Voll geladen fliegt der Ball härter und höher. Sauber mit dem Fuß getroffen gibt am meisten Wumms, ein geladener Kopfball etwas weniger.
- Golden Goal bei Gleichstand, Zeitlupe und Wiederholung nach jedem Tor, Emotes.
- **Fortschritt:** Münzen, Level, Tagesbonus, tägliche Aufgaben, Angebot des Tages, Shop für Köpfe, Bälle und Arenen, 16 Erfolge. Wird im Browser gespeichert.
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

„Online“ → „Raum erstellen“ → Link oder QR-Code schicken. Der Kumpel öffnet den Link und ist direkt in der Lobby. Läuft Peer-to-Peer über WebRTC ([PeerJS](https://peerjs.com/)): der Gastgeber rechnet die Physik, der Gast schickt seine Tasten und sieht seine eigene Figur sofort (Vorhersage), alles andere wird geglättet.

Manche Netze (Schule, Firma, manche Handynetze) blockieren direkte Verbindungen. Dann hilft meist ein anderes WLAN oder mobile Daten.

## Technik

Reines HTML, CSS und JavaScript ohne Build-Schritt. Grafik komplett per Canvas gezeichnet, Sounds und Musik live per Web Audio erzeugt.

```
index.html          Gerüst und Menüs
css/style.css       Aussehen
js/main.js          Ablauf, Menüs, Online, Belohnungen
js/physics.js       Spielphysik, Spezialschüsse, Power-ups
js/render.js        Arenen, Kamera, Partikel, HUD, Wiederholung
js/art.js           Köpfe, Bälle, Icons
js/ai.js            Computer-Gegner
js/input.js         Tastatur, Touch, Controller
js/audio.js         Soundeffekte und Musik
js/net.js           PeerJS-Verbindung
js/store.js         Speicherstand, Erfolge
```

Schriften: Lilita One und Nunito (SIL Open Font License), lokal eingebunden.
