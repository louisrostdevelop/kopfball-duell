# Sounds: Liste und Klangkonzept

Stand 06.11.2026. Heute erzeugt das Spiel alle Sounds live im Browser (`js/adapters/audio/webaudio.js`, Funktion
`sfx(name, v)`). Jeder Sound hat schon einen festen Namen (Spalte **Name**). Echte Dateien in `audio/sfx` ersetzen genau
diese Namen (das Laden ist eingebaut, siehe Technik); fehlt eine Datei, spielt weiter der erzeugte Sound. So kann man
Stück für Stück austauschen.

## Klang-Motor und Sound-Lab

- **Mischpult** (`js/adapters/audio/webaudio.js`): vier Kategorie-Busse (`ui`, `body`, `fx`, `big`) nach der
  Lautstärke-Leiter, leichte Sättigung, Klangregelung, Bus-Kompressor und Limiter vor dem Ausgang, ein kurzer
  Stadion-Hall als Send (erzeugte Impulsantwort). Tor, Super, Sieg, Kisten ducken die Menü-Musik kurz.
- **Erzeugte Sounds** (`js/adapters/audio/synth.js`): jeder Sound in Schichten (Anschlag, Körper, Ausklang) aus wenigen
  Bausteinen: Wumms mit Klick, Gummi-Feder, gefiltertes Rauschen, Marimba und Glocke per FM, Synth-Blech für Fanfaren,
  Schiri-Trillerpfeife. Häufige Sounds streuen in Tonhöhe und Panorama. Belohnungen und Menü sind eine Familie
  (Marimba/Glocke in C), keine Rechteckwellen mehr. Publikum: drei Rausch-Bänder mit langsam schwankendem Gemurmel.
- **Pegel-Abgleich**: `TRIM` in `synth.js` hebt bzw. senkt jeden erzeugten Sound auf seine Stufe (gemessen als
  lautestes 100-ms-Fenster, Spitze unter -2 dB). Nach Änderungen an einem Rezept im Sound-Lab neu messen.
- **Sound-Lab** (`node tools/serve.mjs`, dann `http://localhost:8765/tools/sound-lab/`): jeder Sound mit „Alt“ (Motor
  vor der Überarbeitung, `tools/sound-lab/old-webaudio.js`) und „Neu“, Musik und Publikum zum Umschalten, Aufnahmen aus
  `audio/sfx` ein und aus, Messwerte je Sound gegen die Leiter.

Priorität: **P1** = macht das Spielgefühl aus, zuerst. **P2** = Fortschritt und Belohnung. **P3** = pro Kosmetik-Gegenstand.

## Klangkonzept (gilt für alle)

**Stil: Cartoon-Arcade.** Kurz, knackig, hell, übertrieben. Wie ein Comic, nicht wie eine Sport-Übertragung.

- **Ball und Körper** klingen echt, aber überzeichnet: Leder-Wumms, Gummi-Boing, Holz-/Metall-Pling am Pfosten.
- **Menü, Münzen, Belohnungen** kommen aus einer Instrumenten-Familie: Synth-Pluck plus Marimba oder Glocke. Kein
  Mischmasch aus fünf verschiedenen Klicks.
- **Supers, Torexplosionen, Emotes** sind größer und stilisiert (Synth, Whoosh, Bass), aber in derselben Familie wie die
  Belohnungs-Sounds, damit es wie ein Spiel klingt.
- **Meme-Sounds immer selbst nachbauen**, nie Original-Schnipsel (kein Vine-Boom, kein „Bruh“, kein MLG-Airhorn-Sample,
  keine TikTok-Audios, keine Songs). Die Idee darf erkennbar sein, die Aufnahme nicht.

**Tonart: C.** Die Menü-Musik läuft in c-Moll mit 112 BPM. Alles mit Tonhöhe steht in C: Jingles, Münzen,
Level-Up, Kisten-Enthüllung, Sieg/Niederlage. Erfolg in C-Dur, Misserfolg in c-Moll. Dann beißt sich nichts mit der Musik.

**Lautstärke-Leiter** (damit Wichtiges immer oben liegt):

| Stufe | Was | Ziel |
|---|---|---|
| 1 | Menü-Klicks, Ticks | leise, ca. -24 LUFS, sehr kurz |
| 2 | Ball, Sprung, Landung, Grätsche | ca. -20 LUFS |
| 3 | Supers, Power-ups, Emotes, Pfosten | ca. -16 LUFS |
| 4 | Tor, Torexplosion, legendäre Kiste, Sieg | ca. -14 LUFS, Spitze höchstens -1 dBFS |
| Musik | Menü-Loop | ca. -23 LUFS, wird bei Stufe 4 kurz leiser |

**Längen:** Ball und Körper 50 bis 300 ms, Menü 30 bis 150 ms, Supers 0,4 bis 1,2 s, Emotes bis 1 s,
Torexplosionen bis 2,5 s (die Szenen dauern 2,6 bis 3,4 s), Kisten-Enthüllung bis 1,5 s, Jingles bis 2 s.

**Varianten statt Wiederholung:** Was oft hintereinander kommt (Schuss, Kopfball, Aufprall, Sprung, Landung, Klick),
braucht 3 bis 4 leicht verschiedene Aufnahmen. Sonst klingt es nach Maschinengewehr. Das Spiel kann zusätzlich die
Tonhöhe um ±5 % streuen.

**Stärke `v`:** Schuss, Kopfball, Aufprall, Quetschen und Rempler bekommen eine Stärke mit. Am besten je eine leise und eine
harte Version, das Spiel blendet dazwischen. Sonst reicht eine Aufnahme, die das Spiel lauter und höher macht.

**Technik:** Mono, 48 kHz (Musik Stereo). Stille am Anfang abschneiden, kurz ausblenden. Dateien als `.ogg` und `.m4a`
(für ältere iPhones). Ablage `audio/sfx/<Name>.ogg`, Varianten mit Unterstrich: `audio/sfx/kick_1.ogg`, `kick_2.ogg`.
Danach `node tools/sound-manifest.mjs` ausführen (schreibt `audio/sfx/manifest.json`, meldet fehlende Formate). Das Spiel
nimmt dann die Dateien; was fehlt, erzeugt es weiter selbst. Für `crowd` und `music-menu` als Loop schneiden.

**Lizenzen:** Nur CC0 oder lizenzfrei mit kommerzieller Nutzung. Für jede Datei Quelle und Lizenz in
`audio/CREDITS.md` eintragen. Mögliche Quellen: Freesound (Filter CC0), Kenney (CC0), Sonniss GDC-Pakete. Lizenz bei
jeder Datei selbst prüfen, die ändern sich.

## Was voneinander abhängt

- **Tor:** kurzes Netzrauschen mit hellem Akkord (`goal`, Synth), dazu der Jubel (`roar`), darüber die Torexplosion des Schützen (`gfx-*`). Die frühere Torhupe ist raus, sie nervte auf Dauer.
  Alle drei laufen gleichzeitig. Die Torexplosion sollte deshalb eher mittel und hoch klingen und nicht wieder eine
  tiefe Hupe sein.
- **Super:** Ein gemeinsamer Auslöser für alle (`super`), danach die eigene Signatur des Kopfes (`super-<name>`), beim
  Abwehren der Preis-Sound (`freeze`, `burn`, `zap` …). Die Preis-Sounds teilen sich mehrere Supers, also allgemein halten.
- **Kopf als Motiv:** Super, Meisterschafts-Torexplosion und Meisterschafts-Emote eines Kopfes sollten ein gemeinsames
  Motiv haben, z. B. Yuki: Eis-Klirren in allen drei. Dann erkennt man den Kopf am Klang.
- **Kiste öffnen** ist eine Kette: Aufbau während sie wackelt (Loop), Aufspringen, Enthüllung nach der besten Seltenheit,
  dann ein kurzer Tick je Gegenstand. Die Enthüllung steigert sich: selten < episch < legendär < neuer Kopf.
- **Emotes:** gleiches kurzes „Plopp“ beim Erscheinen für alle, dazu bei Figur-Emotes ein eigener Mini-Sound.
  Stummgeschaltete Gegner-Emotes bleiben still (macht das Spiel schon).
- **Publikum:** ein Dauer-Loop, dessen Lautstärke dem Spiel folgt, dazu Jubel (`roar`) und Raunen (`ohh`). Alle drei
  aus derselben Aufnahme oder zumindest demselben Raum, sonst klingt es zusammengeschnitten.

## Liste

### A. Ball und Körper (P1)

| Name | Wann | Hinweis |
|---|---|---|
| `kick` | Schuss mit dem Fuß | Stärke `v`, 4 Varianten |
| `hammer` | voll geladener Schuss | Wumms plus kurzer Bass |
| `chip` | Lupfer | weicher, mit kleinem „Pling“ |
| `head` | Kopfball | Stärke `v`, 3 Varianten, eher hohl |
| `bounce` | Ball springt auf dem Boden | Stärke `v`, 3 Varianten |
| `post` | Pfosten oder Latte | Metall-Pling, klingt nach |
| `wallhit` | Ball an Bande/Wand | dumpfer als `post` |
| `bumper` | Ball an Flipper-Hindernis | federnd, Stärke `v` |
| `swing` | Schuss ins Leere | kurzer Whoosh |
| `jump` | Sprung | 3 Varianten, sehr kurz |
| `land` | Landung | 3 Varianten |
| `slide` | Grätsche | Rutschen über Rasen |
| `bomb` | Arschbombe im Fallen | fallender Pfeifton |
| `pound` | Arschbombe kommt auf | Stärke `v`, Boden-Wumms |
| `stomp` | auf den Kopf springen | Gummi-Boing |
| `squash` | Ball zerquetschen (Bombe auf den Ball) | Stärke `v`, matschig plus Boing |
| `bump` | Köpfe rempeln, Stolpern, Kontern | Stärke `v` |
| `pop` | Spieler „ploppt“ zurück | kurz |

### B. Supers (P1, Signaturen P2)

| Name | Wann | Hinweis |
|---|---|---|
| `full` | Super-Leiste voll | kurzer Akkord nach oben |
| `arm` | Super scharf geschaltet | Aufladen, ca. 0,3 s |
| `charged` | Schuss fertig geladen | sehr kurzer Ping |
| `super` | jeder Super beim Abschuss | gemeinsamer Auslöser, Stufe 3 |
| `launch` | Super ändert die Flugbahn (Rakete zündet, Drop …) | Zisch |
| `super-<name>` | Signatur je Super, 22 Stück | **neu**, siehe unten |

Signaturen (je 0,4 bis 1,2 s): `fire` Feuerball, `ice` Eisschuss, `thunder` Donnerkeil, `rocket` Rakete, `banana`
Bananenflanke, `ghost` Geisterball, `giant` Riesenball, `tornado` Tornado, `magnet` Magnetschuss, `meteor` Meteor,
`bouncy` Flummi, `clone` Dreifach, `sad` Sad-Ball (Regen, Moll), `flex` Flex-Ball (Bling), `bassdrop` Bass-Drop
(Aufbau, Stille, Drop), `aimbot` Aimbot (Ziel erfasst, Piepen), `copypaste` Copy-Paste (Kopier-Klick, dreifach),
`stone` Steinschlag (Felsrollen), `crypto` Kryptoball (Münzen, Kurs steigt und stürzt), `ghosting` Ghosting
(fast nichts, Hauch), `rizz` Rizz-Ball (verliebtes „Mwah“, Harfe), `brezel` Brezel-Looping (Feuer plus Looping-Whoosh).

Preis fürs Abwehren (werden geteilt):

| Name | Wann |
|---|---|
| `freeze` | eingefroren (Eisschuss), traurig (Sad-Ball) |
| `burn` | verbrannt (Feuerball, Brezel) |
| `zap` | Blitz, geblendet (Flex) |
| `quake` | Meteor/Steinschlag schlägt ein, Bass-Drop drückt weg |
| `tick` | Lag (Aimbot), letzte 10 Sekunden |
| `emote` | verliebt (Rizz) |

### C. Power-ups (P1, eigene P3)

| Name | Wann | Hinweis |
|---|---|---|
| `puSpawn` | Power-up erscheint | leises Glitzern |
| `pu` | Power-up eingesammelt | heute einer für alle |
| `pu-<name>` | je Power-up, 12 Stück | **neu, optional**: `bighead`, `mini`, `freeze`, `speed`, `jump`, `fire`, `wall`, `biggoal`, `meter`, `confuse`, `dbljump`, `wind` |

### D. Spielablauf und Publikum (P1)

| Name | Wann | Hinweis |
|---|---|---|
| `count` | Countdown 3-2-1 | Ton in C |
| `go` | Anpfiff | heller Ton |
| `whistle` | Abpfiff, Golden Goal | Schiri-Pfiff, dreimal |
| `whistle1` | Anpfiff im Golden Goal | ein Pfiff |
| `tick` | letzte 10 Sekunden | leise, Stufe 1 |
| `goal` | Tor | Netzrauschen + heller Akkord (Synth), Stufe 4 |
| `crowd` | Publikum im Spiel | **Loop**, Lautstärke folgt dem Spiel |
| `roar` | Jubel nach Tor | aus derselben Aufnahme wie `crowd` |
| `ohh` | Pfosten, knapp vorbei | Raunen |
| `win` | Sieg | Jingle C-Dur, bis 2 s |
| `lose` | Niederlage | Jingle c-Moll, nicht traurig-schwer, eher „ach Mist“ |

### D2. Arenen (P2)

| Name | Wann | Hinweis |
|---|---|---|
| `geyser` | Geysir bricht aus (Vulkan) | Grollen, dann zischende Fontäne, Stufe 3 |
| `noclip` | Ball geht durch eine Tür (Backrooms) | kurzes digitales Stottern, hohler Nachhall |
| `grind` | Ball schrammt über eine Rampe (Skatepark) | Metall-Schaben, kurz, Stufe 2 |

### E. Torexplosionen und Emotes (P3)

| Name | Wann | Hinweis |
|---|---|---|
| `gfx-67`, `gfx-crash`, `gfx-peak`, `gfx-brainrot`, `gfx-dank`, `gfx-ko`, `gfx-aura`, `gfx-glitch` | Torexplosion aus Kisten | gibt es schon erzeugt, bis 2,5 s |
| `gfx-m-<kopf>` | Meisterschafts-Explosion, 22 Stück | **neu**, Motiv des Kopfes (heute erzeugt: eine Fanfare für alle) |
| `emote` | jedes Emote erscheint | gemeinsames „Plopp“ |
| `emote-<name>` | Figur-Emote, 8 Stück | **neu**: `67`, `crash`, `lockin`, `peak`, `bait`, `unbothered`, `mog`, `aura` |
| `emote-m-<kopf>` | Meisterschafts-Emote, 22 Stück | **neu**, Motiv des Kopfes |

### F. Menü und Fortschritt (P2)

| Name | Wann | Hinweis |
|---|---|---|
| `click` | jeder Knopf | 2 bis 3 Varianten, Stufe 1 |
| `coin` | Münzen bekommen, kaufen | Münz-Pling in C |
| `levelup` | Level-Up, Tagesbonus, Pokal | Jingle C-Dur |
| `chest-shake` | Kiste wackelt vorm Öffnen | **neu**, kurzer Loop |
| `chest-open` | Kiste springt auf | **neu** |
| `chest-selten`, `chest-episch`, `chest-legend` | Enthüllung nach bester Seltenheit | **neu**, steigert sich |
| `chest-head` | neuer Kopf in der Kiste | **neu**, größter Moment |
| `chest-item` | jeder weitere Gegenstand | **neu**, kurzer Tick |
| `shards` | Doppeltes wird zu Splittern | **neu**, Kristall-Klirren |
| `craft` | Gegenstand herstellen | **neu** |
| `deny` | geht nicht (zu wenig Geld, gesperrt) | **neu**, freundlich, nicht nervig |
| `achievement` | Erfolg freigeschaltet | **neu**, kürzer als `levelup` |
| `task` | Tages- oder Wochenaufgabe fertig | **neu** |

### G. Musik (P2)

| Name | Wann | Hinweis |
|---|---|---|
| `music-menu` | alle Menüs | Loop, c-Moll, 112 BPM, nahtlos, 1 bis 2 min |
| `music-result` | Endbildschirm | **optional**, kurzer Loop, gleiche Tonart |

Im Spiel selbst läuft keine Musik, nur Publikum. Das bleibt so, damit die Spielgeräusche klar sind.

## Anzahl

| Bereich | heute erzeugt | neu nötig |
|---|---|---|
| Ball und Körper | 18 | 0 (besser mit Varianten) |
| Supers | 5 | 22 Signaturen |
| Abwehr-Preise | 6 (geteilt) | 0 |
| Power-ups | 2 | 12 optional |
| Spielablauf, Publikum | 11 | 0 |
| Arenen | 3 | 0 (besser als Aufnahme) |
| Torexplosionen | 8 | 22 Meisterschaft |
| Emotes | 1 | 8 + 22 Meisterschaft |
| Menü, Fortschritt | 3 | 12 |
| Musik | 1 | 1 optional |

**Reihenfolge zum Suchen:** erst A und D (das hört man in jedem Spiel), dann B und F, zuletzt E und die optionalen.
