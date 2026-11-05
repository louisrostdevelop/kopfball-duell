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

## Spiellogik (`js/core/sim/`)

`core/physics.js` ist die öffentliche Schnittstelle, die Logik steckt in 13 Modulen ohne Zyklen:

`rules` (Regeln, abgeleitete Faktoren) · `tuning` (Feintuning: MOVE, KICK, AIR) · `base` (Ereignisse, Maße,
Kollisionen) · `state` (Spiel, Spieler, Ball anlegen) · `player` (Laufen, Springen) · `obstacles` · `tricks`
(Arschbombe, Grätsche) · `kick` (Schuss) · `ball` · `supers` (Spezialschüsse, Ballberührung) · `powerups` ·
`goal` · `match` (Schritt, Phasen, Vorhersage für den Online-Gast).

Online rechnet nur der Host. Der Gast schickt Eingaben, bekommt 30-mal pro Sekunde Zustände und sagt
seine eigene Figur mit derselben Logik voraus (`app/online.js`).

## Tests

```
npm test            Spiellogik: 33 Referenzspiele, Edge-Case-Matrix, Profil/Adapter, Schichten-Regeln (~6 s)
npm run test:e2e    Browser: Menü-Rundgang, Tastatur und Touch, Online mit zwei Tabs, Handy-Layout (~4 min)
npm run golden:update   Referenzspiele neu aufnehmen (nur bei gewollter Spieländerung, im Commit begründen)
```

Die **Referenzspiele** (`tests/sim/golden.test.mjs`) sind das Sicherheitsnetz für Umbauten: 33 Spiele mit
festem Zufall über alle Arenen, Hindernisse, Regeln und Modi. Ändert ein Umbau auch nur eine Nachkommastelle
im Spielverlauf, schlägt der Test fehl. Die GitHub Action führt beide Testgruppen bei jedem Push aus.

Werkzeuge fürs Balancing liegen in `tools/balance/` (Simulationen vieler Spiele mit Varianten).

## Server-Anbindung (geplant: Supabase)

Was dafür schon vorbereitet ist:

- **Profil:** `adapters/storage/synced.js` hält das Profil lokal und gleicht es mit einem beliebigen
  Server-Speicher ab (neuer gewinnt, Speichern gebündelt). Fehlt nur ein `ProfileStore` für Supabase.
- **Spieler:** `ports/auth.js` beschreibt Gast und Konto. Heute ein lokaler Gast mit fester ID
  (`adapters/auth/guest.js`). Supabase Auth hat anonyme Anmeldung, die sich später mit E-Mail oder
  Google verknüpfen lässt. Die ID bleibt dabei gleich.
- **Regeln für Belohnungen:** `core/economy.js` hat keine Abhängigkeit zum Browser und kann in einer
  Supabase Edge Function laufen, damit Münzen und Bestenlisten nicht im Browser gefälscht werden können.
- **Online:** `ports/transport.js`. Die Spieldaten bleiben direkt zwischen den Spielern (WebRTC),
  Supabase Realtime kann den Verbindungsaufbau und die Lobby übernehmen.

Schritte für Supabase:

1. Projekt anlegen, Tabelle `profiles (id uuid primary key references auth.users, data jsonb, updated_at timestamptz)`
   mit Row Level Security: jeder liest und schreibt nur seine eigene Zeile.
2. `adapters/auth/supabase.js`: `signInAnonymously()`, Sitzung merken, `upgrade()` für E-Mail/Google.
3. `adapters/storage/supabase.js`: `load()` liest `data`, `save(p)` schreibt `data` und `updated_at`.
4. In `main.js`: `initProfile(syncedProfileStore(localProfileStore(), supabaseProfileStore(client)))`
   und `provide({ auth: supabaseAuth(client) })`.
5. Später: Edge Function für Spielende-Belohnungen und Bestenliste, Realtime-Kanal für Lobby und Matchmaking.

## Bekannte nächste Schritte

- **TypeScript und Build (Vite):** Typen prüfen, Bündeln, Supabase-Bibliothek per npm. Dafür muss GitHub Pages
  auf „GitHub Actions“ als Quelle umgestellt werden (Einstellungen → Pages).
- **app ↔ ui entkoppeln:** `app/` ruft heute direkt Bildschirm-Funktionen auf (z. B. `showEnd`, `lobbyUI`).
  Sauberer wäre ein Ereignis-Kanal, über den `app/` meldet, was passiert ist, und `ui/` entscheidet, was es zeigt.
- **Spielende-Belohnungen** aus `app/results.js` als reine Funktion nach `core/economy.js` ziehen
  (Voraussetzung für die Prüfung auf dem Server).
