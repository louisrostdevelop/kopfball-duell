# Architektur

Kurz: Der **Kern** (Spiellogik, KI, Wirtschaftsregeln) weiß nichts von Browser, Speicher oder Netzwerk.
Alles, was nach außen geht (Speicher, Konto, Online-Verbindung, Ton, Eingabe), läuft über
**Schnittstellen** (`js/ports/`) und wird über **Adapter** (`js/adapters/`) eingesteckt.
Welche Adapter benutzt werden, entscheidet nur `js/main.js`.

```
                    ┌──────────────── main.js (setzt alles zusammen) ────────────────┐
                    │                                                                 │
   ui/  Bildschirme, Navigation, Canvas  ◄──►  app/  Ablauf, Profil, Online-Protokoll │
                    │                              │                                  │
                    │                              ▼  nur über app/services.js         │
                    │                        ports/  Schnittstellen                    │
                    │                              ▲                                   │
                    │                        adapters/  WebAudio · DOM-Eingabe ·       │
                    │                                   PeerJS · localStorage · Gast   │
                    │                                   (später: Supabase)             │
                    ▼
   core/  Spiellogik (sim/), KI, Wirtschaftsregeln      content/  Köpfe, Arenen, Regeln, Layouts
          läuft im Browser, in Node und auf einem Server
```

## Schichten

| Ordner | Aufgabe | darf importieren |
|---|---|---|
| `js/content/` | Spielinhalte als Daten: Köpfe, Bälle, Arenen, Modi, Regel-Optionen, Hindernis-Layouts | nur `content/` |
| `js/core/` | Spiellogik (`sim/`, ein Modul pro Thema), Computer-Gegner (`ai.js`), Fortschritt und Wirtschaft (`economy.js`). Reine Funktionen, deterministisch mit festem Zufall | `content/`, `core/` |
| `js/ports/` | Schnittstellen als JSDoc-Typen: `storage.js`, `auth.js`, `transport.js`, `devices.js`, `server.js` | nichts |
| `js/adapters/` | Umsetzungen der Schnittstellen: `audio/webaudio.js`, `input/dom-input.js`, `net/peerjs.js`, `storage/local.js`, `storage/synced.js`, `auth/guest.js`, `auth/supabase.js`, `server/supabase.js` (+ `supabase-rest.js`, `turnstile.js`) | `adapters/`, `ports/` |
| `js/app/` | Ablauf: Zustand, Spiel starten/beenden, Hauptschleife, Effekte, Online-Protokoll, Modi, Spielende, Profil-Dienst, Dienste-Register | alles außer `adapters/` |
| `js/ui/` | Bildschirme (`screens/`), Navigation, Dialoge, Spiel-Knöpfe, DOM-Helfer, Canvas-Zeichnen (`render/`) | alles außer `adapters/` |
| `js/main.js` | Einstiegspunkt: steckt Adapter ein, lädt Spieler und Profil, baut die Oberfläche auf | alles |

Die Regeln prüft `tests/sim/architecture.test.mjs` bei jedem Testlauf.

## Wie Adapter eingesteckt werden

`js/app/services.js` hält Stellvertreter für `audio`, `input`, `net` und `auth`. Module schreiben
`import { net as Net } from "../app/services.js"` und rufen `Net.send(...)` auf. Welcher Adapter dahinter
steckt, legt `main.js` mit `provide({ ... })` fest. Das Profil bekommt seinen Speicher über
`initProfile(store)`.

Neuen Adapter bauen = ein Objekt mit den Funktionen aus der passenden Datei in `js/ports/` schreiben
und in `main.js` einstecken. Spielablauf und Bildschirme ändern sich dabei nicht.

## Server (optional)

Ist in `js/content/backend.js` ein Supabase-Projekt eingetragen, steckt `main.js` statt des lokalen Gasts
`auth/supabase.js` und den Spiel-Server `server/supabase.js` ein. `app/account.js` übernimmt dann den Stand
vom Server ins Profil: Käufe, Tagesbonus und Spielmeldungen gehen an den Server, die Anzeige rechnet lokal vor
und übernimmt danach die Server-Zahlen. Ohne Eintrag läuft alles lokal wie bisher. Backend: `docs/BACKEND.md`.

Mit Server zusätzlich: Juwelen und Echtgeld-Shop (`ui/screens/shop.js`), Konto sichern und anmelden
(`ui/screens/account.js`), Gegnersuche Casual/Ranked (`app/matchmaking.js`, `ui/screens/search.js`). Der Server
paart, verbunden wird per PeerJS mit festem Raumnamen aus der Spiel-ID; beide melden das Ergebnis, gewertet wird
nur bei gleicher Meldung.

## Spiellogik (`js/core/sim/`)

`core/physics.js` ist die öffentliche Schnittstelle, die Logik steckt in 13 Modulen ohne Zyklen:

`rules` (Regeln, abgeleitete Faktoren) · `tuning` (Feintuning: MOVE, KICK, AIR) · `base` (Ereignisse, Maße,
Kollisionen) · `state` (Spiel, Spieler, Ball anlegen) · `player` (Laufen, Springen) · `obstacles` · `tricks`
(Arschbombe, Grätsche) · `kick` (Schuss) · `ball` · `supers` (Spezialschüsse, Ballberührung) · `powerups` ·
`goal` · `match` (Schritt, Phasen, Vorhersage für den Online-Gast).

Online rechnet nur der Host. Der Gast schickt Eingaben, bekommt 30-mal pro Sekunde Zustände und sagt
seine eigene Figur mit derselben Logik voraus (`app/online.js`).

Netzcode (`app/netcode.js`, `adapters/net/peerjs.js`):
- Zustände kompakt (nur Abweichungen vom Standard, ganze Zahlen, kurze Schlüssel): ~235 statt ~1260 Bytes.
- Zustände und Eingaben über einen zweiten, ungeordneten Kanal ohne Wiederholung: ein verlorenes Paket hält
  nichts auf. Ereignisse (Tore, Effekte) und Statistik zuverlässig über die normale Verbindung.
- Eingaben bei Änderung plus dreimal wiederholt; Sprung- und Bomben-Zähler machen Verluste harmlos.
- Gast zeichnet auf der Zeitachse des Hosts, der Puffer richtet sich nach der gemessenen Schwankung.
- Messung: `node tools/net-bench.mjs` (Netz nachgespielt in `tests/e2e/mockpeer.js`).

| Netz (Verzögerung, Schwankung, Verlust) | Ball-Verzug vorher → jetzt | Ball-Fehler | Sprünge/min | Daten |
|---|---|---|---|---|
| gut (20 ms, 5 ms, 0 %) | 110 → 75 ms | 2,1 → 1,7 px | 0 → 0 | 28 → 6,7 KB/s |
| mobil (50 ms, 25 ms, 2 %) | 150 → 135 ms | 9,7 → 4,0 px | 68 → 0 | 28 → 6,5 KB/s |
| schlecht (90 ms, 45 ms, 6 %) | 210 → 205 ms | 44,7 → 6,7 px | 478 → 0 | 28 → 6,0 KB/s |

## Tests

```
npm run lint        ESLint (streng, 0 Warnungen) und Stylelint
npm test            Lint, dann Spiellogik: 33 Referenzspiele, Edge-Case-Matrix, Netzcode, Sprachen, Schichten-Regeln (~7 s)
npm run test:e2e    Browser: Menü-Rundgang, Tastatur und Touch, Online mit zwei Tabs (auch bei schlechtem Netz), Handy-Layout, Englisch
npm run test:db     Datenbank: Sicherheit, Wirtschaft, Online, Review-Funde, Gleichzeitigkeit, Sicherung
npm run golden:update   Referenzspiele neu aufnehmen (nur bei gewollter Spieländerung, im Commit begründen)
```

Die **Referenzspiele** (`tests/sim/golden.test.mjs`) sind das Sicherheitsnetz für Umbauten: 33 Spiele mit
festem Zufall über alle Arenen, Hindernisse, Regeln und Modi. Ändert ein Umbau auch nur eine Nachkommastelle
im Spielverlauf, schlägt der Test fehl. Die GitHub Actions führen Lint und Spiellogik, dann den Browser-Test aus; die Datenbank-Tests nur, wenn sich `supabase/` ändert.

Werkzeuge fürs Balancing liegen in `tools/balance/` (Simulationen vieler Spiele mit Varianten).

## Sprachen (`js/content/i18n.js`)

Kein Text steht fest im Code. Alles, was Spieler lesen, kommt aus den Wörterbüchern `js/content/i18n/de.js` und
`en.js` (je ~710 Schlüssel: Inhalte oben, Oberfläche darunter, sortiert).

| Wo | Wie |
|---|---|
| JavaScript | `t("shop.gems", { n: 550 })` → „550 Juwelen“ / „550 Gems“. Werte dürfen Funktionen sein (Mehrzahl) |
| HTML | `data-i18n="schlüssel"` für Text, `data-i18n-attr="aria-label:schlüssel;placeholder:schlüssel"` für Attribute; `applyI18n()` in `ui/dom.js` |
| Inhalte (Köpfe, Arenen, Modi, Aufgaben) | Namen und Texte als Getter über `localize()`, die Daten selbst bleiben sprachfrei |
| Zahlen und Preise | `num()` und `money()` mit dem Format der Sprache |

Die Sprache wählt der Spieler in den Einstellungen (Auto, DE, EN); *Auto* nimmt die Browser-Sprache, sonst Englisch.
Neue Sprache = neue Datei in `js/content/i18n/` mit denselben Schlüsseln und ein Eintrag in `i18n.js`.

`tests/sim/i18n.test.mjs` prüft bei jedem Lauf: beide Wörterbücher haben dieselben Schlüssel und Platzhalter,
jeder benutzte Schlüssel existiert, im HTML hat jeder sichtbare Text einen Schlüssel, und in `js/ui`, `js/app`,
`js/core` steht kein Text im Code (`tools/i18n-scan.mjs`; Ausnahmen mit `// i18n-ok`).

Die Rechtstexte liegen auf Englisch in `legal/` (Datenschutz, Nutzungsbedingungen, Impressum) und sind aus den
Einstellungen und dem Juwelen-Shop verlinkt.

## Bekannte nächste Schritte

- **TypeScript und Build (Vite):** Typen prüfen, Bündeln, Supabase-Bibliothek per npm. Dafür muss GitHub Pages
  auf „GitHub Actions“ als Quelle umgestellt werden (Einstellungen → Pages).
- **app ↔ ui entkoppeln:** `app/` ruft heute direkt Bildschirm-Funktionen auf (z. B. `showEnd`, `lobbyUI`).
  Sauberer wäre ein Ereignis-Kanal, über den `app/` meldet, was passiert ist, und `ui/` entscheidet, was es zeigt.
- **Spielende-Belohnungen** aus `app/results.js` als reine Funktion nach `core/economy.js` ziehen
  (Voraussetzung für die Prüfung auf dem Server).
