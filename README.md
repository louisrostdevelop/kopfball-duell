# Kopfball Duell

Head Soccer im Browser. 1 gegen 1, große Köpfe, kleine Tore. Läuft auf Handy, Tablet und PC, ohne Download und ohne Account.

**Spielen:** https://louisrostdevelop.github.io/kopfball-duell/

## Was drin ist

- **12 Köpfe**, jeder mit eigenem Spezialschuss: Feuerball, Eisschuss, Donnerkeil, Rakete, Bananenflanke, Flummi, Geisterball, Riesenball, Tornado, Magnetschuss, Meteor, Dreifach.
- **9 Power-ups**, die man mit dem Ball abschießt: Riesenkopf, Mini-Gegner, Einfrieren, Turbo, Sprungfeder, Feuerschuss, Torwand, Riesentor, Super voll.
- **5 Arenen** mit eigener Physik: Flutlicht, Strand (Sand bremst), Neon City (schneller), Eishalle (rutschig), Mond (wenig Schwerkraft).
- **Modi:** Schnelles Spiel gegen den Computer (4 Stufen), Cup mit 3 Runden, zu zweit an einem Gerät, online gegen Kumpels per Link oder QR-Code.
- **Chaos-Modus** mit zufälligen Sonderregeln, Golden Goal bei Gleichstand, Zeitlupe und Wiederholung nach jedem Tor, Emotes.
- **Fortschritt:** Münzen, Level, Tagesbonus, Shop für Köpfe, Bälle und Arenen, 16 Erfolge. Wird im Browser gespeichert.
- Als App installierbar (Zum Home-Bildschirm hinzufügen), dann im Vollbild und offline spielbar.

## Steuerung

| | Laufen | Springen | Schuss (halten = Power) | Super |
|---|---|---|---|---|
| Touch | links ziehen | hoch wischen oder Sprung-Button | Schuss-Button | Super-Button |
| Spieler 1 | A / D | W | S oder Leertaste | E oder Shift |
| Spieler 2 (lokal) | ← / → | ↑ | ↓ oder Enter | . oder Shift rechts |
| Controller | Stick / Steuerkreuz | A | X / B | Y / RB |

Emotes: Tasten 1 bis 6 oder der Smiley-Button oben links. Pause: Esc, P oder Start.

## Online

„Online“ → „Spiel erstellen“ → Link oder QR-Code schicken. Der Kumpel öffnet den Link und ist direkt in der Lobby. Läuft Peer-to-Peer über WebRTC ([PeerJS](https://peerjs.com/)): der Gastgeber rechnet die Physik, der Gast schickt seine Tasten und sieht seine eigene Figur sofort (Vorhersage), alles andere wird geglättet.

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

Schriften: Bungee und Barlow Condensed (SIL Open Font License), lokal eingebunden.
