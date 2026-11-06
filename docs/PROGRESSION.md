# Fortschritt: Level, Kisten, Herausforderungen, Freischalten

Stand: Konzept vom 06.11.2026. Zahlen sind Startwerte; geprüft mit `node tools/balance/progression.mjs`, Ergebnis in docs/BALANCE.md.
Die Kosmetik-Inhalte sind bis auf die Schuhe vorerst Platzhalter (einfache Formen und Farben, nummerierte Namen); die
echten Inhalte ersetzen nur die Daten in `js/content/cosmetics.js`. Schuhe: 10 Skins (`SHOES`, gezeichnet in
`js/ui/render/shoes.js`), 5 Selten, 4 Episch, 1 Legendär, ohne Teamfarbe.

## Grundsätze

- **Kisten gibt es nur durch Spielen.** Nie gegen Juwelen oder Echtgeld (keine Lootbox im rechtlichen Sinn).
- **Kisten gehen sofort auf.** Kein Timer.
- **Die Chancen stehen in jeder Kiste offen.**
- **Gewürfelt wird nur auf dem Server.**
- **Jedes bestehende System bleibt** und bekommt Kisten dazu. Wer schon spielt, behält alles: Köpfe, Kopf-Level, Münzen.
- **Kopf-Level zählen überall**, auch in Ranked. Das Matchmaking nach Wertung gleicht Stärke über die Zeit aus.

## Inhalte

Kosmetisch heißt: kein Einfluss aufs Spiel, auch nicht auf Trefferflächen. Kopfbedeckungen gibt es nicht (entschieden 06.11.); Köpfe und Schuhe kommen als echte Grafik.

| Art | Zum Start | Gilt für | Woher |
|---|---|---|---|
| Köpfe (Spielfiguren mit eigenem Super) | 12 (3 Basis, 3 Selten, 4 Episch, 2 Legendär) | – | Kisten, Shop |
| Schuhe (einzige Kosmetik am Kopf/Körper) | 12 | jeden Kopf | Kisten, Shop, Pass |
| Torexplosion (beide sehen sie, es läuft die des Torschützen) | 8 + 1 pro Kopf | Spieler | Kisten, Shop, Meisterschaft |
| Figur-Emote (Kopf macht etwas) | 8 + 1 pro Kopf | Spieler | Kisten, Shop, Meisterschaft |
| Emoji-Emote (Sprechblase) | 12 | Spieler | Kisten, Shop, Pass |
| Titel | je 1 pro Kopf + Pass | Spieler | Meisterschaft, Pass, Erfolge |
| Rahmen (Spieler-Karte) | 1 pro Kopf, 3 Medaillen, 6 Pass, 6 Liga | Spieler | Meisterschaft, Siege-Erfolge (25/250/1000), Pass-Stufen, Ranked-Saisonende nach Liga |

Alles sind feste Varianten zum Freischalten und Ausrüsten, kein Editor.

**Ausrüstung:**
- 1 Paar Schuhe, 1 Torexplosion
- 4 Emote-Plätze (Figur oder Emoji)
- 1 Titel, 1 Rahmen

**Emotes (internationale Meme-Trends 2025/26, Platzhalter-Grafik):** Figur-Emotes: 6-7, Crashout, Locked in, Peak (selten), Ragebait, Unbothered, Mog (episch), Aura +1000 (legendär); die Meisterschafts-Emotes nutzen dieselben Animationen mit dem Namen des Kopfes. Emoji: 😭 💀 👀 🫠 🤯 🙃 (selten), 🧢 💅 🤫 🫡 (episch), 🗿 🐐 (legendär); 😂 🔥 😤 😎 🤡 GG hat jeder frei. Keine echten Personen, keine fremden Figuren oder Sounds, keine abwertenden Begriffe. Austauschen: nur `EMOTE_DEFS`/`EMOJI` in js/content/cosmetics.js und die Animation in render.js (`EMOTE_FX`).

**Torexplosionen (internationale Meme-Trends 2025/26, Platzhalter-Grafik, js/ui/render/goalfx.js):** 6-7, Crashout, Peak (selten), Brainrot-Regen, Dank 2016, K.O. (episch), Aura +1000, AI-Slop-Glitch (legendär). Jede hat einen eigenen Sound; K.O., Aura und Glitch lassen den Kopf des Gegners kurz reagieren (Sterne, grau, flimmern), Dank und Aura setzen dem Torschützen eine Sonnenbrille auf. Nur Optik, kein Einfluss aufs Spiel. Die Meisterschafts-Explosionen sind noch die alten Platzhalter (später pro Kopf: Eis, Blitz, Rakete …).

**Emotes im Spiel:** höchstens 1 alle 3 Sekunden. Den Gegner kann man mit einem Tipp stummschalten, das wird gespeichert.

**Spieler-Karte vor dem Anpfiff** (Online und Ranked): Kopf mit Level, Titel, Rahmen, Liga. Was jeder ausgerüstet hat,
schickt er beim Anpfiff mit. In Casual und Ranked prüft der Server, ob er es besitzt.

## Seltenheit

Basis, Selten, Episch, Legendär. Die Farben bleiben wie heute.

| | Kaufbar im Shop ab | Shop-Preis Kopf (Münzen) | Shop-Preis Kosmetik (Münzen / Juwelen) |
|---|---|---|---|
| Selten | Level 1 | ~450 | 150 / 60 |
| Episch | Level 5 | ~750 | 400 / 150 |
| Legendär | Level 10 | ~1400 | 900 / 350 |

Köpfe sind im Shop etwa 1,5-mal so teuer wie heute: Der Shop ist der Weg zum Wunschkopf, Kisten der normale.
Kosmetik im Shop wechselt wöchentlich (6 Angebote). In Kisten gibt es keine Level-Sperre.

## Kisten

| Kiste | Münzen | Kosmetik | Kopf: Selten / Episch / Legendär |
|---|---|---|---|
| Bronze | 40–80 | 35 %, sonst Selten | 5 % / 1 % / 0,2 % |
| Silber | 100–160 | 70 % (Selten oder Episch) | 12 % / 5 % / 1 % |
| Gold | 250 | sicher, 20 % davon Legendär | 25 % / 18 % / 6 % |
| Legendär | – (+30 Juwelen) | sicher Legendär | – / 50 % / 50 % (sicher ein Kopf) |

Würfelt eine Kiste einen Kopf, den der Spieler schon hat, wird er zu Kopf-XP für genau diesen Kopf:

| Kopf | Kopf-XP |
|---|---|
| Selten | 40 |
| Episch | 100 |
| Legendär | 250 |

Ist der Kopf schon auf Level 10, gibt es stattdessen Splitter.

**Doppelte Kosmetik → Splitter:**

| Seltenheit | Splitter |
|---|---|
| Selten | 10 |
| Episch | 30 |
| Legendär | 80 |

Mit Splittern stellt man sich gezielt etwas her:

| Seltenheit | Kosten in Splittern |
|---|---|
| Selten | 50 |
| Episch | 150 |
| Legendär | 400 |

Köpfe lassen sich nicht herstellen.

**Garantien** (pro Spieler gezählt):

| Garantie | Wann |
|---|---|
| Mindestens Episch | spätestens jede 10. Kiste |
| Etwas Legendäres | spätestens jede 40. Kiste |
| Ein neuer Kopf | nach 50 Kisten ohne neuen Kopf |
| Ein legendärer Kopf | nach 90 Kisten ohne legendären Kopf |

## Woher Kisten kommen

| Quelle | Kiste |
|---|---|
| Level-Up | Bronze, jedes 5. Level Silber, jedes 10. Gold, jedes 25. Legendär |
| Level 2 / Level 5 | sicher ein seltener / epischer Kopf (Einstieg) |
| Alle 3 Tagesaufgaben | Bronze |
| Tages-Challenge gewonnen | Bronze (zusätzlich zu den 15 Juwelen) |
| Alle 5 Wochenaufgaben | Silber |
| Erfolgs-Stufe | Bronze, Silber oder Gold je nach Stufe |
| Meisterschaft (Stufe 3 und 5) | Silber, Gold |
| Karriere-Liga geschafft | Silber, Gold, Gold, Legendär (zusätzlich zum Liga-Bonus) |
| Saison-Pass gratis / premium | Bronze und Silber / Gold |
| Ranked-Saisonende | Bronze- bis Diamant-Liga: Bronze, Silber, Gold, Gold, Legendär |
| Freundes-Herausforderungen | Silber |

Die alte Schätzung (nur Kisten, ohne Shop, 9 Köpfe) ist überholt. Die vollständige Simulation mit Shop, allen
Quellen und Server-Regeln steht in **docs/BALANCE.md**: Mit den heutigen Werten hat ein Stammspieler alle Köpfe nach
etwa 2 Wochen, dort steht auch ein Vorschlag zum Nachjustieren.

Später als eigenes Paket: Events mit Event-Kiste und Sammel-Herausforderungen. Beides braucht laufend neue Inhalte.

## Herausforderungen

| Art | Heute | Neu |
|---|---|---|
| Tagesaufgaben | 3 am Tag, Münzen | bleiben, Münzen −20 %. Alle 3 = Bronze-Kiste. 1-mal am Tag tauschbar |
| Wochenaufgaben | – | 5 pro Woche, andere Ziele: 3 verschiedene Köpfe, Ranked- oder Casual-Siege, Karriere-Spiele, Super-Tore, Freunde. Alle 5 = Silber |
| Erfolge | einmalig, Münzen | in Stufen (z. B. Kopfballtore 10 / 100 / 1000) mit Kiste je Stufe. Echte Einmal-Erfolge (Erster Sieg, Cup) bleiben einmalig |
| Meisterschaft pro Kopf | – | 5 Stufen mit Kopf-Aufgaben („5 Super-Tore mit Kalle“). Belohnung: Titel, Rahmen, eigene Torexplosion, eigenes Emote, goldenes Meister-Abzeichen |
| Freundes-Herausforderungen | – | wöchentlich, z. B. „Spiele 3-mal gegen Freunde“. Silber-Kiste |

## Level

- **XP wie heute:** Münzen eines Spiels × 1,2 + 15. Online und Ranked zählen gleich.
- **Kurve:** XP für das nächste Level = 120 + (Level − 1) × 60, ab Level 50 bleibt es bei 3060. Kein Maximal-Level.
- **Belohnung je Level-Up:** wie heute Münzen (50 + 10 × Level, ab Level 50 fest 550) und alle 5 Level 20 Juwelen, dazu die Kiste.
- **Was das Level sperrt:**
  - Shop-Seltenheiten (oben)
  - Casual ab Level 3, Ranked ab Level 5 (wie heute)

## Kopf-Level

- **Bleibt bis Level 10** (bis +25 % Schuss und Super-Ladung, +5 % Tempo).
- **Kopf-XP kommt aus Spielen mit dem Kopf (wie heute) und aus doppelten Köpfen in Kisten.**
- **Aufwerten kostet weiter Münzen.** Fehlende XP lassen sich mit Juwelen auffüllen (wie heute).

## Juwelen

- **Wofür:** Saison-Pass, Köpfe und Kosmetik im Shop, Kopf-XP auffüllen. Nie Kisten.
- **Woher ohne Geld:**
  - alle 5 Level 20
  - Tages-Challenge 15
  - Legendär-Kiste 30
  - Karriere-Weltliga 30

## Server

Alles, was zählt, rechnet der Server:
- Kisten vergeben und würfeln
- Garantie-Zähler
- Splitter
- Aufgaben und Meisterschaft
- Besitz der Ausrüstung

Die Kisten-Chancen kommen aus `js/content` über `supabase/catalog.sql`, wie Preise und Karriere. Ohne Server würfelt
der Client lokal mit denselben Tabellen.

## Reihenfolge beim Bauen

1. **Kisten und Level-Belohnungen.** Server, Öffnen-Bildschirm, Chancen-Anzeige, Splitter, Garantien. *(fertig; Kisten als SVG in 4 Stufen, `js/ui/render/chest-art.js`; Öffnen: hereinfallen, wackeln, aufladen in der Farbe der besten Seltenheit, Deckel springt auf, Strahlen und Funken, Karten fliegen heraus, der beste Gegenstand zuletzt; bei Legendär oder neuem Kopf größer mit Blitz. Sounds siehe docs/SOUNDS.md)*
2. **Kosmetik:** Schuhe, Torexplosionen, Emotes. Zeichnen, Ausrüsten, Online übertragen, Spieler-Karte, Stummschalten. *(fertig; Schuhe sind echte Skins, Torexplosionen und Emotes nach Meme-Trends, Rahmen und Meisterschafts-Inhalte Platzhalter)*
3. **Wochenaufgaben, Erfolgs-Stufen, Meisterschaft, Freundes-Herausforderungen.** *(Wochenaufgaben, Erfolgs-Stufen, Meisterschaft und die Kisten für Tagesaufgaben, Tages-Challenge und Karriere fertig; Freundes-Herausforderungen brauchen erst vom Server gewertete Freundesspiele, Spiele unter Freunden laufen bisher ohne Server)*
4. **Shop-Umbau:** neue Kopf-Preise, Level-Sperren, wöchentliche Kosmetik. *(fertig)*
5. **Ranked-Saisonende-Kisten, Pass-Kisten.** *(fertig: Wartung vergibt nach Saisonende die Liga-Kiste, Pass-Stufen können Kisten sein)*
6. **Später:** Events, Sammel-Herausforderungen.
