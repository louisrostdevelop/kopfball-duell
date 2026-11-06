# Fortschritt geprüft: Simulation, Exploits, Bindungsdauer

Stand 06.11.2026. Werkzeug: `node tools/balance/progression.mjs [Tage] [Läufe] [aktuell|ohneSplitterXp]`.

**Umgesetzt:** Der Vorschlag unten ist komplett in Inhalten, Client und Server. Dazu kommt: Splitter lassen sich in
Kopf-XP tauschen. Kopf-Level in Ranked und die Endlos-Liste bleiben bewusst, wie sie sind (siehe Entscheidungen).

## Wie simuliert wird

Die Simulation nutzt die echten Inhalte und Regeln, nicht nachgebaute Zahlen:

- Köpfe, Preise, Erfolge, Karriere, Kosmetik, Rahmen, Meisterschaft aus `js/content`
- Kisten mit dem echten Würfeln aus `js/core/chests.js` (Chancen, Garantien, Splitter, Kopf-XP für Doppelte)
- Server-Einstellungen (Tagesdeckel, Zeitkonto, Kopf-Level-Kosten, Elo) direkt aus der Migration `foundation.sql`
- Münzen pro Spiel wie `api.report_cpu_match` und `game.settle`, Level-Ups wie `game.add_xp`
- Pass-Stufen aus der Saison-Vorlage `supabase/ops/new-season.sql`, Saison 28 Tage, Ranked mit Saisonende-Kiste und Liga-Rahmen

Jeder Spielertyp läuft 40-mal mit anderem Zufall, gezeigt wird der Median. Gespielt wird mit dem besten Kopf (Hälfte der
Spiele) und sonst mit einem zufälligen. Ausgegeben wird in dieser Reihenfolge: erst Köpfe, dann Kopf-Level, Splitter
zum Herstellen, Bälle und Arenen, zuletzt Kosmetik aus dem Wochenangebot.

| Typ | aktive Tage/Woche | Spiele/Tag | online | vs. Computer | Tages-/Wochenaufgaben |
|---|---|---|---|---|---|
| gelegentlich | 3 | 4 | – | Normal | selten / kaum |
| Stammspieler | 5 | 8 (~25 min) | 25 % | Normal, ab Woche 4 Schwer | meist / oft |
| Vielspieler | 7 | 20 | 50 % (Ranked ab Level 5) | Schwer, ab Woche 4 Legende | fast immer |
| Zahler | wie Stammspieler | | | | + 1200 Juwelen/Monat |
| Bot | 7 | 80 (das Maximum, das der Server belohnt) | – | meldet nur Siege gegen Legende mit Höchstwerten | alles |

**Grenzen der Simulation:** Siegquoten und Tore pro Spiel sind Annahmen, keine Messwerte. Aufgaben werden als
„geschafft mit Wahrscheinlichkeit x“ gerechnet. Die Zahlen zeigen Größenordnungen und Verhältnisse; echte Spielerdaten
ersetzen sie, sobald es welche gibt.

## Ergebnis mit den alten Werten (vor dem 06.11.2026)

| Meilenstein (Tag, Median) | gelegentlich | Stammspieler | Vielspieler | Bot |
|---|---|---|---|---|
| erster legendärer Kopf | 35 | **14** | 7 | 7 |
| alle 22 Köpfe | 42 | **14** | 7 | 7 |
| alle 38 Kisten-Kosmetik | 140 | 84 | 42 | 49 |
| Karriere komplett | 126 | 42 | 21 | – |
| erster Kopf auf Level 10 | 252 | 77 | 21 | 14 |
| Hälfte der Meisterschaft (55 von 110) | 406 | 119 | 35 | 14 |
| ganze Meisterschaft | – | – | 252 | 98 |

Münzen des Stammspielers: 52.000 nach 3 Monaten, 119.000 nach 6, 267.000 nach einem Jahr. Neue Sachen pro Woche (Köpfe,
Kosmetik, Rahmen, Titel, Meisterschaft, Kopf-Level, Pass-Stufen): 38 in Woche 1, 14 in Woche 13, 4 in Woche 27,
1 in Woche 40.

### Was daran nicht schlüssig ist

1. **Köpfe sind in zwei Wochen alle da.** Ein Stammspieler kauft 16 bis 17 der 19 kaufbaren Köpfe im Shop. Aus Kisten
   kommen nur 2 bis 3. Eigentlich sollten die Köpfe vor allem aus Kisten kommen. So sind die Kopf-Chancen in den Kisten
   fast egal, und das Sammeln ist vorbei, bevor es richtig losgeht.
2. **Münzen verlieren nach etwa einem Monat ihren Wert.** Danach gibt es nichts mehr zu kaufen. Kopf-Level wären der große
   Verbraucher (9.000 Münzen pro Kopf bis Level 10), aber dafür fehlt Kopf-XP: Es gibt nur 15 bis 30 pro Spiel, verteilt
   auf 22 Köpfe. Tagesbonus, Aufgaben und Münz-Belohnungen werden damit bedeutungslos.
3. **Splitter sammeln sich an**, sobald alle Kisten-Kosmetik da ist: 3.700 nach einem Jahr, ohne Verwendung.
4. **Juwelen lohnen sich kaum.** Ein Spieler ohne Kauf hat nach einem Jahr 3.200 übrig. Der Zahler ist kaum schneller als
   der Stammspieler, weil Münzen ohnehin alles kaufen. Allein die Tages-Challenge bringt 15 Juwelen am Tag, also
   420 pro Saison. Damit bezahlt sich ein Vielspieler den Premium-Pass (500) fast jede Saison selbst.
5. **Bindung:** Neue Inhalte kommen beim Stammspieler bis etwa Monat 4 bis 6. Danach bleiben nur Level-Kisten, die meist
   Doppelte bringen, die letzten Meisterschafts-Stufen (50 Siege pro Kopf) und Ranked. Der Pass bringt ab der zweiten
   Saison dieselben Rahmen noch einmal, als 200 Münzen.

## Umgesetzt am 06.11.2026

| Stellschraube | vorher | jetzt |
|---|---|---|
| Kopf-Preise im Shop | 400–1.500 | 1.600–6.000 |
| Münzen pro Spiel (Computer) | 40 Sieg / 12 / Tor 8 / zu null 20 | 24 / 7 / Tor 5 / zu null 12 |
| Münzen Online | 70 Sieg / 25 | 42 / 15 |
| Tagesdeckel Computer | 600 voll, ab 1.500 nichts | 360 voll, ab 900 nichts |
| Tagesbonus | 40 + 30 je Tag | 20 + 15 je Tag |
| Münzen pro Level-Up | 50 + 10 × Level | 25 + 5 × Level |
| Münzen in Kisten | | halbiert |
| Chance auf Kosmetik in Kisten | 35 / 70 / 100 / 100 % | 21 / 42 / 60 / 60 % |
| Kopf-XP pro Spiel | 30 Sieg / 15 (online 40 / 20) | 60 / 30 (online 80 / 40) |
| Spieler-XP pro Spiel | Münzen × 1,2 + 15 | Münzen × 2 + 15 (bleibt gleich schnell) |
| Kopf-Level-Kosten | 200 × Level | 300 × Level |
| Juwelen für die Tages-Challenge | 15 | 5 |
| Splitter | nur Herstellen | auch Kopf-XP: 1 Splitter = 2 Kopf-XP, bis zum nächsten Level |

Neu simuliert (40 Läufe, Median):

| Meilenstein (Tag) | gelegentlich | Stammspieler | Vielspieler | Zahler | Bot |
|---|---|---|---|---|---|
| erster legendärer Kopf | 119 | 35 | 14 | 35 | 14 |
| alle 22 Köpfe | 210 | **63** | 28 | 49 | 21 |
| alle 38 Kisten-Kosmetik | 301 | 161 | 84 | 168 | 56 |
| Karriere komplett | 126 | 42 | 21 | 49 | – |
| erster Kopf auf Level 10 | – | 245 | 91 | 196 | 77 |
| Hälfte der Meisterschaft | 315 | 91 | 28 | 98 | 14 |
| alle Köpfe auf Level 10 | – | – | 231 | – | 189 |

- **Münzen haben wieder Wert.** Stammspieler: 1.000 nach einem Monat, 100 nach 3, 300 nach 6, 4.500 nach einem Jahr.
  Es gibt also fast immer etwas, worauf man spart. Erst nach etwa einem Jahr wächst der Vorrat wieder.
- **Neue Sachen pro Woche (Stammspieler):** 27 in Woche 1, 25 in Woche 9, 17 in Woche 13, 5 in Woche 27.
- **Splitter:** Stammspieler und Gelegenheitsspieler verbrauchen sie jetzt. Beim Vielspieler bleiben sie liegen, weil
  Münzen für die Kopf-Level fehlen. Die Splitter halten also nur die Kopf-XP voll, die Grenze bleibt das Geld. Darum
  bringt Splitter-zu-Kopf-XP in der Simulation keinen schnelleren Meilenstein (Vergleich `ohneSplitterXp`). Das ist
  gewollt: Splitter haben einen Nutzen, ohne die Wirtschaft zu kippen.
- **Zahler:** bekommt Köpfe etwa 2 Wochen früher und den ersten Kopf auf Level 10 etwa 7 Wochen früher.

### Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wirtschaft | Vorschlag komplett umgesetzt |
| Splitter ohne Verwendung | Splitter in Kopf-XP tauschen (`api.shards_to_head_xp`, Button in der Kopf-Auswahl) |
| Kopf-Level zählen in Ranked, Juwelen füllen Kopf-XP auf | so gelassen; Münzen sind nicht käuflich, das bremst |
| Endlos-Bestenliste ohne Wiederholungs-Prüfung | so gelassen |

**Was noch fehlt:** Nach etwa einem halben Jahr wird es dünn. Länger halten nur **neue Inhalte pro Saison**: zum
Beispiel 1 bis 2 neue Köpfe, 4 bis 6 Kosmetik-Teile und eigene Pass-Rahmen je Saison statt derselben Vorlage.

## Bindungsdauer, kurz

| | vorher | jetzt | jetzt + neue Inhalte je Saison |
|---|---|---|---|
| Stammspieler: Sammeln (Köpfe, Kosmetik) | 2 Wochen / 3 Monate | 2 Monate / 5 Monate | läuft mit |
| Stammspieler: spürbar Neues jede Woche | bis Monat 4–6 | bis Monat 6–7 | offen, solange Inhalte kommen |
| Stammspieler: Langzeitziele (Meisterschaft, Kopf-Level) | ab Monat 4 kaum noch Neues | über 1,5 Jahre | über 1,5 Jahre |
| Gelegenheitsspieler: Sammeln | 6 Wochen / 5 Monate | 7 Monate / 10 Monate | |

## Exploits

Geprüft gegen den Server (alles, was der Client meldet, gilt als frei erfunden):

| Weg | Wirkung | Stand |
|---|---|---|
| Spiele gegen den Computer erfinden (Bot) | höchstens 80 belohnte Spiele am Tag, Münzen gedeckelt (360 voll, danach 20 %, ab 900 nichts), Zeitkonto | **begrenzt:** der Bot ist nur 1,5- bis 2-mal so schnell wie ein Vielspieler |
| Schwierigkeit „Legende“ behaupten (×2,4 Münzen) | erreicht den Tagesdeckel schneller | begrenzt durch den Deckel |
| Statistik in unbelohnten Spielen hochzählen | alle Erfolgs-Stufen (Kisten, Medaillen-Rahmen) an einem Tag | **behoben:** Statistik zählt nur noch belohnte Spiele |
| Online-Absprache mit 50:0 nach 30 s | Meisterschaft „30 Tore“ und Tor-Aufgaben sofort | **behoben:** Tore müssen zur Dauer passen, gezählt werden höchstens 10 pro Spiel |
| Ranked mit Zweitkonten hochspielen | Legende-Kiste und Liga-Rahmen am Saisonende | **erschwert:** Saison-Belohnung erst ab 5 verschiedenen Gegnern (dazu bestehen schon: 5 Spiele pro Paar und Tag, Abzug bei neuen Konten) |
| Tages-Challenge melden, ohne sie zu spielen | 150 Münzen, 5 Juwelen, Bronze-Kiste | einmal am Tag, nicht schlimmer als ein guter Spieler |
| Karriere melden, ohne zu spielen | Liga-Boni einmal (zusammen etwa 1.850 Münzen, 40 Juwelen, 4 Kisten) | einmalig, hingenommen |
| Endlos-Serie erfinden | Bestenliste „Endlos“ | **hingenommen:** lässt sich ohne Wiederholungs-Prüfung nicht absichern; entschieden, die Liste so zu lassen |
| Spielstand vor dem Konto übernehmen | höchstens 2.000 Münzen Wert, nur in den ersten 24 h | begrenzt |
| Kisten, Splitter (auch in Kopf-XP), Kauf, Pass doppelt auslösen | | durch Doppelt-Schutz und Sperren geschützt (getestet, auch gleichzeitig) |
| Kopf-Level mit Juwelen kaufen | bis +25 % Werte, zählt auch in Ranked | **hingenommen:** gebremst, weil Münzen nicht käuflich sind. Ein Kopf auf Level 10 kostet 13.500 Münzen |
