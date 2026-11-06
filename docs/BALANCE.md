# Fortschritt geprüft: Simulation, Exploits, Bindungsdauer

Stand 06.11.2026. Werkzeug: `node tools/balance/progression.mjs [Tage] [Läufe] [aktuell|vorschlag]`.

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

## Ergebnis mit den heutigen Werten

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

## Vorschlag (Vorlage `vorschlag` in der Simulation)

| Stellschraube | heute | Vorschlag |
|---|---|---|
| Kopf-Preise im Shop | 400–1.500 | ×4 (1.600–6.000) |
| Münzen pro Spiel und Tagesdeckel | 40 Sieg / 12 / Tor 8, Deckel 600 | ×0,6 |
| Tagesbonus, Level-Up-Münzen, Münzen in Kisten | | ×0,5 |
| Chance auf Kosmetik in Kisten | 35 / 70 / 100 / 100 % | ×0,6 (21 / 42 / 60 / 60 %) |
| Kopf-XP pro Spiel | 30 Sieg / 15 | ×2 |
| Kopf-Level-Kosten | 200 × Level | 300 × Level |
| Juwelen für die Tages-Challenge | 15 | 5 |

| Meilenstein (Tag, Median) | gelegentlich | Stammspieler | Vielspieler | Bot |
|---|---|---|---|---|
| erster legendärer Kopf | 112 | 42 | 14 | 14 |
| alle 22 Köpfe | 217 | 63 | 28 | 21 |
| alle 38 Kisten-Kosmetik | 294 | 161 | 77 | 63 |
| erster Kopf auf Level 10 | – | 252 | 91 | 77 |
| Hälfte der Meisterschaft | 315 | 91 | 28 | 14 |
| alle Köpfe auf Level 10 | – | – | 224 | 189 |

Münzen des Stammspielers: 150 nach 3 Monaten, 600 nach 6, 14.000 nach einem Jahr. Es gibt also immer etwas, worauf
man spart. Köpfe kommen öfter aus Kisten (etwa 5 statt 2 bis 3). Neue Sachen pro Woche: 28 in Woche 1, 19 in Woche 13,
5 in Woche 27.

**Was der Vorschlag nicht löst:** Nach etwa einem halben Jahr wird es auch hier dünn. Länger halten nur **neue
Inhalte pro Saison**: zum Beispiel 1 bis 2 neue Köpfe, 4 bis 6 Kosmetik-Teile und eigene Pass-Rahmen je Saison statt
derselben Vorlage. Dazu bräuchte es einen Zweck für Splitter, etwa Rahmen und Titel herstellen oder Kopf-XP kaufen.

## Bindungsdauer, kurz

| | heute | mit Vorschlag | mit Vorschlag + neuen Inhalten je Saison |
|---|---|---|---|
| Stammspieler: Sammeln (Köpfe, Kosmetik) | 2 Wochen / 3 Monate | 2 Monate / 5 Monate | läuft mit |
| Stammspieler: spürbar Neues jede Woche | bis Monat 4–6 | bis Monat 6–7 | offen, solange Inhalte kommen |
| Stammspieler: Langzeitziele (Meisterschaft, Kopf-Level) | ab Monat 4 kaum noch Neues | über 1,5 Jahre | über 1,5 Jahre |
| Gelegenheitsspieler: Sammeln | 6 Wochen / 5 Monate | 7 Monate / 10 Monate | |

## Exploits

Geprüft gegen den Server (alles, was der Client meldet, gilt als frei erfunden):

| Weg | Wirkung | Stand |
|---|---|---|
| Spiele gegen den Computer erfinden (Bot) | höchstens 80 belohnte Spiele am Tag, Münzen gedeckelt (600 voll, danach 20 %, ab 1.500 nichts), Zeitkonto | **begrenzt:** der Bot ist nur 1,5- bis 2-mal so schnell wie ein Vielspieler |
| Schwierigkeit „Legende“ behaupten (×2,4 Münzen) | erreicht den Tagesdeckel schneller | begrenzt durch den Deckel |
| Statistik in unbelohnten Spielen hochzählen | alle Erfolgs-Stufen (Kisten, Medaillen-Rahmen) an einem Tag | **behoben:** Statistik zählt nur noch belohnte Spiele |
| Online-Absprache mit 50:0 nach 30 s | Meisterschaft „30 Tore“ und Tor-Aufgaben sofort | **behoben:** Tore müssen zur Dauer passen, gezählt werden höchstens 10 pro Spiel |
| Ranked mit Zweitkonten hochspielen | Legende-Kiste und Liga-Rahmen am Saisonende | **erschwert:** Saison-Belohnung erst ab 5 verschiedenen Gegnern (dazu bestehen schon: 5 Spiele pro Paar und Tag, Abzug bei neuen Konten) |
| Tages-Challenge melden, ohne sie zu spielen | 150 Münzen, Juwelen, Bronze-Kiste | einmal am Tag, nicht schlimmer als ein guter Spieler |
| Karriere melden, ohne zu spielen | Liga-Boni einmal (zusammen etwa 1.850 Münzen, 40 Juwelen, 4 Kisten) | einmalig, hingenommen |
| Endlos-Serie erfinden | Bestenliste „Endlos“ | **offen:** lässt sich ohne Wiederholungs-Prüfung nicht absichern. Empfehlung: als Spaß-Liste kennzeichnen oder nur Ranked als echte Liste zeigen |
| Spielstand vor dem Konto übernehmen | höchstens 2.000 Münzen Wert, nur in den ersten 24 h | begrenzt |
| Kisten, Splitter, Kauf, Pass doppelt auslösen | | durch Doppelt-Schutz und Sperren geschützt (getestet, auch gleichzeitig) |
| Kopf-Level mit Juwelen kaufen | bis +25 % Werte, zählt auch in Ranked | **Pay-to-win-Gefahr**, gebremst, weil Münzen nicht käuflich sind. Mit Vorschlag kostet ein Kopf auf Level 10 13.500 Münzen |
