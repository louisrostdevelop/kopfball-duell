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

**A. Super-Balance (entschieden: angleichen, umgesetzt).** Gemessen gegen den Computer:

| | vorher | nachher |
|---|---|---|
| Tore pro Super | 0–82 % | 4–39 % |
| Siegquote der Köpfe (alle gegen alle) | 38–72 % | 36–67 % |
| Köpfe über 60 % | Rapper 72, Raver 65, Max 61, Nala 60 | Steinkopf 67, Raver 60 |

- **Bass-Drop:** schwebt tiefer (mit einem Sprung erreichbar), stürzt langsamer, schwächerer Zickzack.
- **Meteor:** langsamer, bleibt auf gerader Bahn.
- **Banane:** langsamer.
- **Flex:** hat eine eigene Bahn: flach heran, dann ein berechneter Hüpfer über den Verteidiger und unter die Latte. Vorher
  flog er identisch wie die Banane.
- **Riesenball:** schleudert den ersten Blocker hoch und rollt unten durch, der zweite Block stoppt ihn.
- **Flummi:** schneller, Sprünge abwechselnd flach und hoch, prallt einmal vom Blocker ab und springt weiter.
- **Feuer, Eis, Geist, Sad:** etwas schneller.
- **Fehler in der Torwertung:** Prallte ein weiterlaufender Super (Riesenball) vom Blocker ab und ging ins Tor, zählte das
  als **Eigentor des Blockers**. Jetzt gehört der Ball weiter dem Schützen.
- **Vorbehalt:** Die Zahlen kommen vom Computer, die Start-Köpfe (Kalle, Yuki) und Emo liegen mit 36–39 % noch etwas
  unten. Mit echten Spieldaten nachjustieren.

**B. Online: Wiederverbinden (entschieden: bauen, umgesetzt).** Vorher beendete ein kurzer Netzaussetzer ein
Freundesspiel, in Ranked zählte er als Aufgabe. Jetzt:

- Reißt die Verbindung im Spiel ab, steht das Spiel bis zu 10 s mit „Verbindung wird wiederhergestellt …“, die Spielzeit
  läuft nicht weiter.
- Der Gast tritt demselben Raum automatisch wieder bei und weist sich mit seinem Sitzungs-Merker und der Spiel-Nummer aus.
  Der Host nimmt nur ihn an (sonst „Raum voll“) und schickt den Start erneut, die Zustände holen den Rest nach.
- Kommt 8 s nichts an, ohne dass die Verbindung schließt, trennt die Seite selbst und versucht es neu. Kommt danach
  weiterhin nichts (eingefrorener Gegner), gilt nach 7 s der bisherige Abbruch, es wird nicht endlos neu verbunden.
- Wer das Spiel absichtlich verlässt, schickt „bye“, die andere Seite wartet dann nicht.
- Tests: `online.test.mjs` „Verbindung reißt ab und kommt zurück“ (Spielstand bleibt, Zeit steht), „Gast kommt nicht
  zurück“ (Host nach 10 s in der Lobby), „Gast friert ein“.
- Nebenbei: Ein Sprung des Gasts ging bei langsamer CPU und schlechtem Netz gelegentlich verloren (1 von 6). Jeder Druck
  gilt jetzt mindestens kurz, auch wenn danach keine Eingabe rechtzeitig kommt.

**C. Ranked: der Host rechnet.** Ist der Host im Hintergrund, steht das Spiel. Nach 15 s bricht der Gast ab und meldet
eine Aufgabe. Ohne Server-Schiedsrichter lässt sich ein manipulierter Host nicht erkennen. Der Server prüft heute
Plausibilität (Tore zur Dauer, beide Meldungen gleich, sonst strittig). Langfristig hilft eine Server-Wiederholung der
Eingaben oder ein Schiedsrichter-Dienst.

## Online-Grenzfälle, geprüft

| Fall | Verhalten |
|---|---|
| Netz reißt kurz ab | neu: Spiel steht bis 10 s, Gast verbindet automatisch neu, Spielstand bleibt |
| Gast schließt den Tab / kommt nicht zurück | Host: nach 10 s Hinweis, zurück in die Lobby. Ranked: Host meldet Aufgabe, gewinnt nach spätestens 180 s (Wartung) |
| Host verlässt das Spiel | Gast sofort (Abschied „bye“), schließt der Host nur den Tab: nach 10 s. Gast: „Gastgeber hat das Spiel verlassen“, ins Menü. Ranked: Gast meldet Aufgabe |
| Beide melden „Gegner weg“ (z. B. Netz in der Mitte gerissen) | gleicher Spielstand → normal gewertet, abweichend → strittig, verfällt nach 24 h |
| Verlierer reißt absichtlich die Verbindung | Gewinner meldet Aufgabe → Gewinner gewinnt, Abhauen bringt nichts |
| Gast/Host friert ein ohne Verbindungsende | neu: Hinweis nach 4 s, nach 8 s Trennung und Neuversuch, kommt weiter nichts: Abbruch |
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
