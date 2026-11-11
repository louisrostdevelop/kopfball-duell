# Headstars

Kopfball-Fußball im Browser: 1 gegen 1, große Köpfe, kleine Tore. Läuft auf Handy, Tablet und PC, ohne Download und
ohne Anmeldung.

**Spielen:** https://headstars.app

## Das Spiel

- Köpfe mit eigenem Spezialschuss, Power-ups, Arenen mit eigener Physik und optionalen Hindernissen.
- Spiel gegen den Computer (Schnelles Spiel, Cup, Karriere, Tages-Challenge, Endlos, Training) oder zu zweit an einem
  Gerät.
- Online gegen Freunde per Link oder QR-Code, dazu Gegnersuche (Casual und Ranked).
- Eigene Regeln: Schussstärke, Ballgröße, Tempo, Schwerkraft, Siegbedingung und mehr.
- Fortschritt mit Münzen, Levels, Aufgaben, Erfolgen und Shop für Köpfe, Bälle, Arenen und Kosmetik.
- Deutsch und Englisch.
- Als App installierbar (PWA) und danach auch offline spielbar.

## Steuerung

| | Laufen | Springen | Grätsche / Arschbombe | Schuss | Super |
|---|---|---|---|---|---|
| Touch | links ziehen | hoch wischen | runter wischen | Schuss-Button | Super-Button |
| Spieler 1 | A / D | W | S | Leertaste | E oder Shift |
| Spieler 2 (lokal) | ← / → | ↑ | ↓ | Enter | . oder Shift rechts |
| Controller | Stick / Steuerkreuz | A | Stick oder Kreuz runter | X / B | Y / RB |

Emotes: Tasten 1 bis 6. Pause: Esc, P oder Start.

## Lokal starten

Voraussetzung: Node.js 22.

```sh
npm install
npm run serve          # http://localhost:8765
```

Tests:

```sh
npm test               # Lint und Spiellogik
npx playwright install chromium
npm run test:e2e       # Browser-Tests
npm run test:db        # Datenbank-Tests (lokal installiertes PostgreSQL oder DB_URL auf einen Supabase-Stack)
```

## Technik

- Statische Seite aus HTML, CSS und JavaScript (ES-Module) ohne Build-Schritt. Grafik per Canvas, Ton über Web Audio.
- Deterministische Simulation: beide Geräte rechnen dasselbe Spiel aus denselben Eingaben.
- Online-Spiele laufen Peer-to-Peer über WebRTC ([PeerJS](https://peerjs.com/)) mit Rollback-Netzcode: die eigene
  Figur reagiert sofort, verspätete Eingaben des Gegners werden nachgerechnet.
- Optionales Backend auf [Supabase](https://supabase.com/) für Konten, Gegnersuche, Bestenlisten und Fortschritt.
  Ohne Backend ist das Spiel lokal und mit Freunden per Link spielbar.

## Aufbau

```
index.html, css/   Seite, Menüs, Aussehen
js/content/        Spielinhalte: Köpfe, Arenen, Regeln, Texte
js/core/           Spiellogik, Computer-Gegner, Rollback, Fortschritt
js/app/, js/ui/    Ablauf, Bildschirme, Zeichnen
js/ports/, js/adapters/   Schnittstellen und Umsetzungen (Speicher, Verbindung, Ton, Eingabe, Server)
supabase/          Datenbank-Migrationen, Edge Functions, Datenbank-Tests
tests/, tools/     Tests, Testserver, Hilfsskripte
legal/             Impressum, Datenschutz, Nutzungsbedingungen (erzeugt mit npm run legal)
```

## Lizenz

Alle Rechte vorbehalten, siehe [LICENSE](LICENSE). Der Quelltext ist einsehbar, aber nicht zur
Weiterverwendung freigegeben.

Fremde Bestandteile unter eigenen Lizenzen:

- PeerJS (MIT) und QR-Code-Generator von Kazuhiko Arase (MIT), in `vendor/`
- Schriften Lilita One und Nunito (SIL Open Font License 1.1), siehe [fonts/OFL.txt](fonts/OFL.txt)
- Sounds von Freesound (CC0 1.0), Quellen in [audio/CREDITS.md](audio/CREDITS.md)
