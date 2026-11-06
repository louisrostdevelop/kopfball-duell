# Arenen und Hindernisse

Stand 06.11.2026. Inhalte: `ARENAS` in `js/content/config.js`, Layouts in `js/content/layouts.js`, Zeichnung der alten
Arenen in `js/ui/render/render.js`, der neuen in `js/ui/render/arena-art.js`.

## Die 9 Arenen

| Arena | Physik | Hindernis-Art | Freischalten |
|---|---|---|---|
| Flutlicht | normal | Banden, Torbalken, Hügel | von Anfang an |
| Strand | Sand bremst | Surfbretter, Treibgut, Wasserbälle | von Anfang an |
| Neon City | schneller | Bumper, Laser, Aufzug | ab Level 5 |
| Eishalle | rutschig | Schollen, Eiszapfen, Gletscher | ab Level 10 |
| Mond | wenig Schwerkraft | Asteroiden, Krater, Umlaufbahn | ab Level 15 |
| Vulkan | Ball springt höher | **Geysire** (Takt, kündigen sich an) | Saison 1 im Pass, danach Shop |
| Skatepark | glatt, schnell | **Rampen** (Funbox, Kicker, Wellen) | Saison 2 im Pass, danach Shop |
| Tiefsee | langsam, Ball stark gebremst | **Blasensäulen**, Quallen | Saison 3 im Pass, danach Shop |
| Backrooms | Teppich bremst | **Noclip-Türen**, Neonröhren | Saison 4 im Pass, danach Shop |

**Freischalten** (entschieden 06.11.2026):

- Die alten Arenen kosten nichts mehr, sie werden mit dem Spieler-Level frei. Nach dem Level-Up erscheint ein Hinweis.
- Jede neue Arena ist in ihrer Saison die letzte Gratis-Stufe im Pass (950 Punkte, `supabase/ops/new-season.sql`).
- Ab der nächsten Saison gibt es sie im Shop für 2.500 Münzen (episch, ab Level 5). Der Server prüft das in
  `api.buy_item` (`not_yet`).
- Ohne Server gibt es keine Saisons, dann stehen die neuen Arenen gleich im Shop.
- Casual und Ranked spielen weiter nur in Flutlicht und Strand.

## Neue Hindernis-Arten

| Art | Was passiert | fair, weil |
|---|---|---|
| Rampe | Ball rollt hoch und hebt ab, Spieler laufen drüber (höchstens 45°) | spiegelbildlich, fest |
| Geysir | bricht im festen Takt aus, 1,2 s vorher Dampf und gestrichelte Säule. Schießt Ball und Spieler hoch, den Ball nur bis knapp über die Fontäne (bleibt im Bild) | beide Seiten gleichzeitig, Takt nach Spielzeit |
| Blasensäule | sprudelt im Takt, hebt den Ball langsam, Spieler springen darin höher. Danach sinkt der Ball wieder, er bleibt nie oben hängen | spiegelbildlich, Takt nach Spielzeit |
| Noclip-Tür | fliegt der Ball **Richtung Tor** durch eine Tür, kommt er aus der gespiegelten Tür auf der anderen Seite mit gleichem Tempo wieder heraus. Richtung Mitte und für Spieler ist die Tür offen | rettet eher, als dass sie Tore schenkt |

Alles läuft nach der Spielzeit (`st.el`) und ist damit online auf beiden Seiten gleich. Geräusche: `geyser`, `noclip`,
`grind` (docs/SOUNDS.md).

## Regeln für Layouts (getestet in `tests/sim/layouts.test.mjs`)

- **Nichts über y 230**, auch nicht in der Bewegung. Auf dem Handy quer liegt darüber die Anzeige oder der Bildrand. Vorher
  waren 8 von 15 Layouts betroffen, vor allem Teile über dem Anstoßpunkt.
- Torraum frei (|dx| ≤ 520), über dem Anstoßpunkt nichts, auf den Startplätzen kein Block.
- Die Touch-Buttons sind im Spiel halb durchsichtig, damit Tor und Blöcke rechts unten sichtbar bleiben.

## Messung: Computer gegen Computer

Werkzeug: `node tools/balance/arenas.mjs [Spiele] [arena]`, hier 24 Spiele je Layout. Verglichen wird mit derselben
Arena ohne Hindernisse.

- **Zufallstore:** Anteil der Tore, bei denen das Hindernis den Ball zuletzt berührt hat.
- **Ziel:** Zufallstore unter 25 %, Ballkontakte nicht unter 85 %.

Ersetzt wurden unter anderem:

| Layout | Zufallstore | Ballkontakte | Grund |
|---|---|---|---|
| Stadion „Treppe“ | 41 % | −28 % | Plattform im Torraum |
| Mond „Asteroiden“ | 47 % | | |
| Eis „Schollen“ | 79 Abpraller pro Minute | | Block direkt neben dem Startplatz |

| Layout | Tore/min (ohne) | Ballkontakte | Hindernis/min | Zufallstore |
|---|---|---|---|---|
| Flutlicht 1 Banden | 6,9 (6,4) | 102 % | 14 | 16 % |
| Flutlicht 2 Torbalken | 6,4 (6,4) | 102 % | 10 | 16 % |
| Flutlicht 3 Hügel | 6,9 (6,4) | 85 % | 15 | 6 % |
| Strand 1 Surfbretter | 6,5 (6,5) | 104 % | 16 | 21 % |
| Strand 2 Treibgut | 7,4 (6,5) | 108 % | 13 | 17 % |
| Strand 3 Wasserbälle | 7,4 (6,5) | 112 % | 23 | 23 % |
| Neon 1 Flipper | 6,2 (7,4) | 93 % | 22 | 19 % |
| Neon 2 Laser | 7,6 (7,4) | 99 % | 10 | 12 % |
| Neon 3 Aufzug | 6,6 (7,4) | 98 % | 13 | 14 % |
| Eis 1 Schollen | 9,0 (8,0) | 107 % | 15 | 25 % |
| Eis 2 Eiszapfen | 7,5 (8,0) | 101 % | 14 | 24 % |
| Eis 3 Gletscher | 8,9 (8,0) | 93 % | 20 | 19 % |
| Mond 1 Asteroiden | 3,9 (3,9) | 94 % | 19 | 25 % |
| Mond 2 Krater | 3,4 (3,9) | 89 % | 12 | 8 % |
| Mond 3 Umlaufbahn | 4,1 (3,9) | 99 % | 18 | 27 % |
| Vulkan 1 Geysire | 5,7 (7,1) | 92 % | 8 | 5 % |
| Vulkan 2 Lavafelsen | 5,6 (7,1) | 81 % | 21 | 10 % |
| Vulkan 3 Krater | 6,0 (7,1) | 88 % | 24 | 24 % |
| Skatepark 1 Funbox | 6,5 (6,2) | 86 % | 9 | 6 % |
| Skatepark 2 Kicker | 5,6 (6,2) | 91 % | 8 | 8 % |
| Skatepark 3 Wellen | 5,6 (6,2) | 92 % | 10 | 13 % |
| Tiefsee 1 Blasen | 5,0 (4,4) | 102 % | – | – |
| Tiefsee 2 Quallen | 4,4 (4,4) | 112 % | 16 | 23 % |
| Tiefsee 3 Riff | 3,2 (4,4) | 88 % | 16 | 10 % |
| Backrooms 1 Noclip | 5,7 (7,2) | 88 % | 14 | 5 % |
| Backrooms 2 Neonröhren | 7,1 (7,2) | 102 % | 13 | 16 % |
| Backrooms 3 Endlose Flure | 7,6 (7,2) | 108 % | 20 | 25 % |

**Grenzen:** Der Computer kennt die Hindernisse nicht. Mond und Tiefsee liegen höher, weil der Ball dort lange fliegt. Die
Zahlen sind Vergleichswerte, keine Spielerdaten.
