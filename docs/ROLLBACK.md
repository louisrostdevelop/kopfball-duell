# Rollback-Netcode

Stand: 07.11.2026 (morgens), Zweig `rollback`, sieben Review-Runden. Ersetzt online das bisherige Verfahren „Host rechnet, Gast bekommt Zustände“.
Das alte Verfahren bleibt als Rückfall erhalten (`?netcode=classic` beim Host).

## Idee

Beide Geräte rechnen das Spiel selbst. Übertragen werden nur die Eingaben (7 Bits je Takt, dazu ab und zu ein Emote).

- **Eigene Eingaben** gelten mit einer kleinen Verzögerung von `delay` Takten. Der Host legt sie beim Anpfiff aus der
  gemessenen Laufzeit fest: 2 Takte (33 ms) bei kurzen Wegen, höchstens 6.
- **Fehlende Eingaben der Gegenseite** werden vorhergesagt: Die letzte bekannte Eingabe gilt weiter.
- **Weicht die echte Eingabe ab**, rechnet das Gerät ab diesem Takt neu („Rollback“). Gespeicherte Zustände der letzten
  Takte machen das billig: Ein Takt kostet etwa 0,1 ms.
- **Höchstens `maxPred` Takte** (10) über die letzte bekannte Eingabe hinaus wird vorhergesagt. Danach steht das Spiel,
  bis wieder Eingaben ankommen. So läuft keine Seite davon.

Vorteil gegenüber vorher: Beide Seiten sind gleichberechtigt, der Gast spielt ohne Verzögerung durch den Host. Der
Host ist nicht mehr der einzige, der rechnen muss. Die Wiederholung beim Gast ist so flüssig wie beim Host.

## Bausteine

| Datei | Aufgabe |
| --- | --- |
| `js/content/dmath.js` | Deterministische Mathematik und Zufall im Zustand (`st.rng`, mulberry32) |
| `js/core/sim/match.js` `tick()` | Fester Takt 1/60 s = 2 Physikschritte. Hit-Stop und Zeitlupe zählen in Takten, der Rest liegt ganzzahlig in `st.tq` |
| `js/core/rbgame.js` | Ein Spieltakt aus Eingaben: Emotes und „Jubel überspringen“ (Bit x, nur Host) sind Teil der Eingaben. Emotes gelten nur, wenn sie Standard, Torjubel oder in den beim Anpfiff mitgeschickten Plätzen des Spielers sind (`cleanInput`, auf beiden Seiten gleich) |
| `js/core/rollback.js` | Sitzung: Eingabepuffer, Vorhersage, Zustände je Takt, Neurechnen, `sync` (ab hier endgültig), Korrektur |
| `js/core/rbpeer.js` | Gegenstelle: Takt aus echter Zeit, Pakete, Bestätigungen, Zeitabgleich, Prüfsummen, Korrektur durch den Host |
| `js/app/rbnet.js` | Anbindung an die App: Eingaben, Ereignisse, Wiederholung, weiches Zeichnen, Spielende |

## Determinismus

JavaScript rechnet `+ - * /` und `Math.sqrt` überall bit-genau gleich (IEEE 754, vom Standard vorgeschrieben).
`Math.sin`, `cos`, `atan2`, `exp`, `pow`, `tanh` und `hypot` dürfen sich zwischen Browsern in der letzten Stelle
unterscheiden. Die Physik nutzt deshalb eigene Umsetzungen aus `dmath.js`. Der Zufall (Power-ups, Anstoß, Klon-Super,
Ball-Befreiung) kommt aus dem Zustand statt aus `Math.random`.

- **Wächter-Test** (`tests/sim/determinism.test.mjs`): verbietet in der Physik `Math.sin` und Verwandte, `Math.random`,
  `Date`, `performance` und `**`.
- **Gegenprobe:** Sechs Szenen laufen in V8 und in QuickJS. QuickJS hat eine eigene Mathe-Bibliothek. Die Prüfsummen
  müssen gleich sein.
- **Golden-Replays** (`tests/sim/golden.json`) sind neu aufgenommen. Das Spielverhalten ändert sich nur in der letzten
  Kommastelle. Der Klon-Super ist für rechts gespiegelt.

## Ablauf im Spiel

- **Anpfiff:** Der Host baut den Startzustand. Er schickt ihn im `start` mit (`rb: { ep, st, d }`), und beide starten
  davon. `ep` ist die Sitzungsnummer, alte Pakete werden ignoriert.
- **Pakete:**
  - `ri` (schneller Kanal, ungeordnet, verlustbehaftet): alle eigenen, noch unbestätigten Eingaben, dazu die Bestätigung
    der fremden, der eigene Takt und der Vorsprung. Es geht nach jedem Takt raus, im Stau höchstens 30-mal pro Sekunde.
  - `rh` (zuverlässig): alle 60 Takte die Prüfsumme des endgültigen Zustands.
  - `rs` (zuverlässig, nur Host): Bei Abweichung schickt der Host seinen endgültigen Zustand, und beide rechnen von dort
    weiter.
- **Zeitabgleich:** Beide schicken mit, wie weit sie der Gegenseite voraus sind. Die halbe Differenz ist der echte
  Uhrversatz, die Laufzeit kürzt sich heraus. Wer im Mittel mindestens einen Takt vorne liegt, wartet einen Takt, höchstens
  einmal je 30 Takte.
- **Ereignisse:**
  - Töne und Effekte kommen sofort aus der Vorhersage. Doppelte nach dem Neurechnen werden unterdrückt: gleiche Art und
    gleicher Spieler innerhalb von ±2 Takten.
  - Tor, Anstoß und Spielende zählen erst, wenn sie endgültig sind. Es gibt also keine Phantom-Tore.
  - Die Wiederholung wird aus endgültigen Takten aufgenommen.
- **Weich zeichnen:** Korrigiert ein Rollback die Position von Ball oder Spielern, wird der Sprung in etwa 70 ms
  nachgezogen statt sofort gezeigt.
- **Spielende:** Der Ergebnis-Bildschirm kommt erst mit dem endgültigen Abpfiff, mit dem endgültigen Stand. Danach
  wird noch 30 s weiter gesendet, ab dem Abpfiff bzw. dem Wiederverbinden. So kommt auch die Gegenseite sicher bis zum
  Abpfiff. Wer danach geht (Lobby, Menü, Revanche, nächster Gegner), wartet bis zu 3 s, bis die Gegenseite alle
  Eingaben bis zum Abpfiff hat. Meldet sich ein Gast ohne Sitzung zurück, nachdem der Host schon abgepfiffen hat,
  bekommt er den Endstand (`rb.ended`).
- **Wiederverbinden ohne Neustart:** Reißt nur die Verbindung ab, läuft die Sitzung einfach weiter. Der Gast nennt im
  `hello` seine Sitzung (`ep`), der Host bestätigt mit `rb.keep`. Unbestätigte Eingaben kommen erneut, nichts
  Endgültiges wird zurückgenommen.
- **App-Neustart** (Sitzung aus PR 8): Der Host sichert seinen letzten endgültigen Stand alle 0,25 s. Nach einem
  Neustart startet er davon eine neue Sitzung, der Gast übernimmt sie. Startet der Host neu, kann der Gast bis zu etwa
  0,3 s zurückgedreht werden. Ein Abpfiff wird je Spiel trotzdem nur einmal gewertet (`App.endedKey`, eindeutige
  Kennung je Spiel vom Host); ein zweiter zeigt nur das Ergebnis. Wer abgepfiffen hat, wartet bei einem Abriss auf die
  Gegenseite, bis sie alle Eingaben bis zum Abpfiff hat, und schickt so lange weiter.
- **Spielende online** (Wächter, Sitzung sichern, Aufgabe-Meldung) richtet sich nach dem endgültigen Abpfiff
  (`netEnded()`), nicht nach einer Vorhersage.
- **Protokollversion 10:** Ein alter Client trifft keinen neuen. Die Versionsprüfung beim Beitritt greift wie bisher.

## Grenzen und Nachteile

- **Spielende bei schlechtem Netz** (bewusst offen, selten):
  - Wer nach dem eigenen Abpfiff geht (Lobby, Revanche, „Nochmal“), wartet höchstens 3 s auf die Gegenseite. Hat sie
    bis dahin nicht abgepfiffen, bleibt ihr Spiel ohne Wertung. In der Gegnersuche kann es strittig werden.
  - Ein Gast mit Lobby-Sitzung bekommt „Raum voll“, wenn der Host noch auf ihn wartet.
  - Startet der Host neu, nachdem der Gast schon abgepfiffen hat, kann aus dem gesicherten Stand (höchstens 0,25 s alt)
    ein anderes Ergebnis entstehen. In der Gegnersuche wäre das strittig.

- **Eingabeverzögerung** für den eigenen Spieler: 33–100 ms je nach Laufzeit. Bisher hatte der Host keine, der Gast
  sagte sich selbst voraus.
- **Korrekturen bei schlechtem Netz:** Ab etwa 100 ms Laufzeit springt der Gegner sichtbar etwas, wenn er die Richtung
  wechselt, weich gezeichnet. Ab etwa 150 ms Laufzeit mit Schwankung kommt es zu kurzen Stockern.
- **Rechenaufwand:** Beide Geräte rechnen die Physik. Bei Rollbacks rechnen sie bis zu 10 Takte doppelt, gemessen im
  Mittel etwa 20 zusätzliche Takte pro Sekunde, also rund 2 ms.
- **Takt 60 Hz:** Auf 120-Hz-Bildschirmen ändert sich der Zustand nur jedes zweite Bild. Offline sind es 120 Hz.
  Möglich wäre später ein Zwischenbild beim Zeichnen.
- **Schummeln:** Wie bei jedem Peer-to-Peer-Spiel kann ein manipulierter Client eigene Eingaben fälschen. Er kann aber
  nicht mehr wie ein Host den Spielstand diktieren. Bei abweichender Prüfsumme gilt der Host-Stand.
- **Dauerhafte Abweichung** (wäre ein Determinismus-Fehler): Der Host korrigiert dann etwa jede Sekunde mit einem vollen
  Zustand von rund 4 KB. Zwischen zwei Korrekturen kann der Gast kurz Falsches sehen.
- **Feldbreite:** Sie liegt global in `config.js` (`W`), nicht im Zustand. Sie wird beim Sitzungsstart aus
  `rules.field` gesetzt. Wer künftig mitten im Spiel ein zweites Spiel anlegt, muss das beachten.

## Tests

- `tests/sim/rollback.test.mjs`:
  - simuliertes Netz mit Laufzeit, Schwankung, Verlust, Ausfall und verschieden schnellen Uhren;
  - 24 Zufallsspiele;
  - beide Seiten erreichen dieselbe Prüfsumme in jedem endgültigen Takt;
  - das Ergebnis entspricht der Einzelrechnung mit denselben Eingaben;
  - keine Phantom-Tore, Stau statt Davonlaufen, Korrektur nach Abweichung.
- `tests/sim/determinism.test.mjs`: Wächter, eigene Mathe-Funktionen, Gegenprobe V8 gegen QuickJS.
- `tests/e2e/rollback.test.mjs`, `tests/e2e/rbresume.test.mjs`: zwei Browser-Tabs mit nachgespieltem Netz. Geprüft
  werden Gast-Eingaben, Emote, Tor, Wiederholung, Spielende, Netzausfall, Wiederverbinden, Neustart von Gast und Host
  und Revanche.
- Das alte Verfahren prüfen weiter `online.test.mjs`, `resume.test.mjs` und `matchmaking.test.mjs`, mit
  `window.__netcode = "classic"`.
