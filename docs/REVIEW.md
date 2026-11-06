# Review: Spiel, Online, Wirtschaft, Code (06.11.2026)

Ohne UI (daran arbeitet ein anderer Agent). Geprüft wurde mit Simulationen (Computer gegen Computer, alle Köpfe
gegeneinander, jeder Super einzeln), Browser-Tests mit zwei Tabs, Lasttests auf dem Handy-Format mit gedrosselter CPU und
am Code.

## Behoben

| # | Fund | Wirkung vorher | Behebung | Test |
|---|---|---|---|---|
| 1 | **Meteor (Max, legendär) traf nie** | 0 von 20 Schüssen aufs leere Tor, der Anflug traf immer die Lattenecke | Bahn so gelegt, dass er knapp unter der Latte ins Tor fällt | `supers.test.mjs` |
| 2 | **Flummi-Super sprang übers Tor** | 1 von 32 ins leere Tor, 10 Eigentore | flache, gleich hohe Sprünge Richtung Tor | ebd. |
| 3 | **Supers je nach Seite verschieden** (Rizz, Donnerkeil, Bass-Drop, Tornado) | Rizz traf von links 78 %, von rechts 100 %; Zickzack nicht gespiegelt | Drehrichtung mit der Seite gespiegelt | Bahnen links/rechts müssen deckungsgleich sein |
| 4 | **Kurven-Supers aus mittlerer Entfernung daneben** (Banane, Flex, Magnet, Rizz, Krypto, Bass-Drop) | flogen übers Tor oder an die Lattenecke und rollten ins eigene Tor | aus der Nähe enger einlenken; bei steilem Anflug Zielpunkt senken; Krypto startet nah am Tor früher; Bass-Drop vor dem Tor ruhiger | alle 22 Supers treffen aus 4 Entfernungen und 2 Höhen, beide Seiten |
| 5 | **Online: Gast friert ein** (Tab im Hintergrund, Absturz), Verbindung bleibt offen | festgehaltene Taste lief beim Host ewig weiter; das Spiel lief ohne Ende weiter | Eingabe älter als 350 ms gilt als losgelassen; Wächter: nach 4 s Hinweis, nach 15 s Abbruch wie bei geschlossener Verbindung (Ranked: Aufgabe des anderen) | `online.test.mjs` „Gast friert ein“ |
| 6 | Ball-Spur bei Sprüngen | Noclip-Tür und Meteor zogen einen Strich quer übers Feld | Spur fängt bei Sprüngen über 160 px neu an | – |
| 7 | **Ein Fehler in einem Frame fror das ganze Spiel ein** | nächster Frame wurde erst am Ende angemeldet | Frame immer anmelden, Fehler einmal in die Konsole | – |
| 8 | **Belohnungen ohne Server ≠ mit Server** | Pokal 30/9 + 180 Pokal-Bonus, Endlos-Bonus, Tages-Challenge 18/6 und +100 auf Legende, Torprämie online: angezeigt, aber vom Server nie gebucht; die Münzanzeige sprang danach | Client rechnet wie `api.report_cpu_match` / `game.settle` | Unit- und Server-Tests |
| 9 | **Erfolg „Pokalsieger“ mit Server unerreichbar** | Server kannte die Meldung nicht | Server vergibt ihn beim Sieg in der letzten Pokalrunde | `02_economy.sql` |
| 10 | Neon-Hindernisse | shadowBlur pro Frame: 2,7-fache Frame-Zeit auf dem Handy-Format (133 statt 50 ms bei 4-fach gedrosselter CPU) | Leuchten als Verlauf, jetzt 50 ms wie überall | Messung |

## Offen, braucht eine Entscheidung

**A. Super-Balance.** Gegen den Computer werden die Supers sehr unterschiedlich zu Toren:

| Super (Kopf) | Tore pro Super |
|---|---|
| Bass-Drop (Raver) | 82 % |
| Meteor (Max) | 79 % |
| Banane (Nala) | 64 % |
| Flex (Rapper) | 63 % |
| Tornado (Tina) | 48 % |
| Steinschlag (Steinkopf) | 45 % |
| … | |
| Feuer (Kalle), Eis (Yuki) | 17–22 % |
| Riesenball (Tank) | 3 % |
| Flummi (Flummi) | 2 % |

- **Folge:** Raver, Rapper und Nala gewinnen 60–72 % ihrer Spiele, ohne Supers liegen alle Köpfe bei etwa 50 %.
- **Vorbehalt:** Der Computer wehrt Bälle von oben schlecht ab, bei Menschen ist der Abstand vermutlich kleiner.
- **Vorschlag:**
  - Anflug-Supers (Bass-Drop, Meteor, Banane, Flex) 10–15 % langsamer.
  - Riesenball und Flummi deutlich stärker, zum Beispiel schneller und schwerer abzuwehren.
  - Danach mit echten Spieldaten nachjustieren.
- **Doppelt:** Flex und Banane fliegen identisch (gleicher Start, gleiche Kurve). Nur der Preis fürs Abwehren und die
  Optik unterscheiden sich. Flex sollte eine eigene Flugbahn bekommen.

**B. Online: kein Wiederverbinden.** Ein kurzer Netzaussetzer beendet ein Freundesspiel, in Ranked zählt er als
Aufgabe. Vorschlag: 10 s Pause mit „Verbindung wird wiederhergestellt“, der Gast tritt demselben Raum automatisch wieder bei,
der Host nimmt ihn mit derselben Spieler-ID an und schickt den vollen Stand.

**C. Ranked: der Host rechnet.** Ist der Host im Hintergrund, steht das Spiel. Nach 15 s bricht der Gast ab und meldet
eine Aufgabe. Ohne Server-Schiedsrichter lässt sich ein manipulierter Host nicht erkennen. Der Server prüft heute
Plausibilität (Tore zur Dauer, beide Meldungen gleich, sonst strittig). Langfristig hilft eine Server-Wiederholung der
Eingaben oder ein Schiedsrichter-Dienst.

## Online-Grenzfälle, geprüft

| Fall | Verhalten |
|---|---|
| Gast schließt den Tab / Verbindung bricht | Host: Hinweis, zurück in die Lobby. Ranked: Host meldet Aufgabe, gewinnt nach spätestens 180 s (Wartung) |
| Host schließt / bricht ab | Gast: „Gastgeber hat das Spiel verlassen“, ins Menü. Ranked: Gast meldet Aufgabe |
| Beide melden „Gegner weg“ (z. B. Netz in der Mitte gerissen) | gleicher Spielstand → normal gewertet, abweichend → strittig, verfällt nach 24 h |
| Verlierer reißt absichtlich die Verbindung | Gewinner meldet Aufgabe → Gewinner gewinnt, Abhauen bringt nichts |
| Gast/Host friert ein ohne Verbindungsende | neu: Hinweis nach 4 s, Abbruch nach 15 s |
| Gast im Hintergrund mit gedrückter Taste | neu: zählt nach 350 ms als losgelassen |
| Pakete verloren, Netz schwankt | Eingaben mehrfach mit Zählern, Zustände ungeordnet, Puffer passt sich an (Test „schlechtes Netz“) |
| Alte Pakete aus dem letzten Spiel | über Spiel-Nummer verworfen |
| Dritter versucht beizutreten | „Raum voll“ |
| Verschiedene Spielversionen | Hinweis bzw. Abbruch beim Gast |
| Ball springt (Noclip) beim Gast | keine Zwischenbilder über den Sprung, Spur neu |

## Code: Modularität, Qualität, Skalierbarkeit

**Gut:**
- Die Schichten (content, core, app, ui, adapters, ports) sind sauber getrennt, ein Test erzwingt die Importregeln.
- Der Kern (Physik, KI, Regeln) läuft ohne Browser, darum sind die Simulationen und die Referenzspiele möglich.
- Alles Wirtschaftliche entscheidet der Server, mit Doppelt-Schutz, Sperren und Tests auch bei gleichzeitigen Anfragen.
- Inhalte sind Daten (Köpfe, Arenen, Layouts, Kosmetik), der Server-Katalog wird daraus erzeugt.

**Schwächen (Empfehlung):**
1. **`render.js` hat 1.460 Zeilen** und mischt Kamera, Partikel, Hintergründe, Tore, Spieler, Ball, HUD und Wiederholung.
   Besser wären Module wie `goals.js`, `obstacles.js`, `hud.js` und `particles.js` mit einem gemeinsamen Zeichen-Kontext.
   Das jetzt nicht anfassen, weil der UI-Agent dort arbeitet (Konfliktgefahr), sondern danach.
2. **app und ui importieren sich gegenseitig** (8 app-Dateien importieren ui, 20 ui-Dateien app). Online-Ablauf und
   Gegnersuche sprechen direkt mit Bildschirmen (`lobbyUI`, `showScreen`, `toast`). Besser: app meldet Ereignisse, ui hört
   zu. Dann lässt sich der Online-Ablauf ohne Browser testen.
3. **Ein globales `App`-Objekt mit rund 60 Feldern.** Online-Felder (Eingaben, Puffer, Uhr, Wächter, Gegnersuche) gehören
   in eine eigene Sitzung, die beim Spielende als Ganzes weggeworfen wird. Heute muss jedes Feld einzeln zurückgesetzt
   werden.
4. **59 Zeilen über 300 Zeichen** (vor allem Zeichen-Code). Schwer zu lesen und zu prüfen, eine Lint-Regel `max-len` mit
   Ausnahmen für Daten würde helfen.
5. **Kein Fehlerbericht vom Gerät.** Fehler landen nur in der Konsole. Empfehlung: Fehler gesammelt (einmal pro Meldung)
   an den Server schicken, z. B. in eine Tabelle `game.client_errors` mit Rate-Limit.
6. **Server-Skalierung:** Ledger und Anfrage-Tabellen wachsen unbegrenzt (bekannt, docs/BACKEND.md). Die Wartung räumt
   die Doppelt-Schutz-Einträge in 5.000er-Schritten auf, bei vielen Spielern braucht sie einen häufigeren Lauf.
7. **Leistung auf echten Handys** ist nicht gemessen (nur Desktop-Browser mit gedrosselter CPU). Ball-Skins und Arenen
   sind dort unauffällig. Vorschlag: einmal auf einem älteren Android messen, die Qualität schaltet sich bei unter 42 fps
   schon selbst herunter.

## Werkzeuge für spätere Prüfungen

| Werkzeug | Zweck |
|---|---|
| `node tools/balance/arenas.mjs [Spiele] [arena]` | Hindernis-Layouts messen |
| `node tools/balance/progression.mjs` | Wirtschaft und Fortschritt simulieren |
| `tests/sim/supers.test.mjs` | jeder Super trifft frei ins Tor, links und rechts gleich |
