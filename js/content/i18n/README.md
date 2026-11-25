# Neue Sprache hinzufügen

1. `en.js` nach `<code>.js` kopieren (zweistelliger Code wie `es`, `pt`; `de.js` ist die Bedeutungsreferenz).
2. Nur die Werte übersetzen. Schlüssel, Reihenfolge, Platzhalter `{…}`, HTML wie `<b>` und `// i18n-ok` bleiben.
   Funktions-Werte (`p => …`) bleiben Funktionen, nur die Mehrzahl-Logik passt sich der Sprache an.
3. In `../i18n.js` importieren und in `LANGS` und `LANG_NAMES` (Name in der eigenen Sprache) eintragen.
   Der Sprachwähler in den Einstellungen und die Gerätesprache (`detectLang`, erste zwei Buchstaben) folgen daraus.
4. `node tools/sw-files.mjs` (Offline-Dateiliste in `sw.js`), dann `npm test`:
   `tests/sim/i18n.test.mjs` prüft, dass jede Sprache dieselben Schlüssel und Platzhalter wie Deutsch hat.
5. Layout mit `?lang=<code>` durchklicken (Handy hochkant 390 px, Handy quer, Desktop); zu lange Texte kürzen.

Wortwahl: Spielart nur beschreibend („fútbol de cabezones“, „futebol de cabeça“), nie fremde Spielnamen.
Eigennamen (Köpfe, Arenen, Memes) wie im Englischen, außer ein Wortspiel trägt übersetzt besser.
Die Bezahlseite kennt nur `de` und `en`; andere Sprachen bekommen dort Englisch (`js/app/account.js`).
