# Backend (Supabase)

Alles, was zählt (Münzen, Juwelen, Käufe, Level, Wertung), liegt auf dem Server. Das Backend ist komplett
Code in `supabase/`. Ein Projekt lässt sich damit jederzeit neu aufsetzen, auch nach einer Pause oder auf
einem anderen Anbieter mit Postgres.

```
supabase/
  migrations/   Schema, Server-Funktionen, Rechte, Wartung (wiederholbar, idempotent)
  catalog.sql   Köpfe, Bälle, Arenen, Preise, Produkte, Aufgaben (erzeugt: npm run catalog)
  seed.sql      nur lokal: eine laufende Saison
  functions/    Edge Functions: create-checkout, stripe-webhook
  tests/        Datenbank-Tests (Sicherheit, Wirtschaft, Online, Dienste, Gleichzeitigkeit, Sicherung)
  ops/          deploy.sh, backup.sh, restore.sh, new-season.sql
  local/        Test- und Entwicklungs-Datenbank ohne Docker, Lasttest
```

## Aufbau in einem Satz

Daten liegen im privaten Schema `game` (für Clients gesperrt, RLS an, keine Regeln). Clients rufen nur
Funktionen im Schema `api` auf, die prüfen, rechnen und buchen. Die öffentliche Schnittstelle (PostgREST)
zeigt nur `api`.

| Schutz | Wie |
|---|---|
| Direkter Tabellenzugriff | unmöglich: keine Rechte, RLS ohne Regeln, Schema nicht freigegeben |
| Funktionen | nur ausdrücklich freigegebene; `search_path = ''` gegen Umleitungen |
| Doppelte Buchungen | Anfrage-Schlüssel (gleiche Anfrage = gleiche Antwort), Webhook-Kennung eindeutig |
| Negativer Kontostand | atomare Buchung mit Bedingung, Prüfung in der Tabelle, Buchungsjournal (`ledger`) |
| Spam | Grenzen pro Spieler und Aktion (`rate_limits`) |
| Bot-Farmen gegen den Computer | Zeitkonto (gemeldete Spielzeit kann nicht schneller vergehen als echte, Vorrat 90 min für offline Gespieltes), 80 belohnte Spiele pro Tag, Münz-Tageslimit weich 360 / hart 900 |
| Sieg-Absprachen online | mehr als 5 Spiele desselben Paars in 24 h bringen weder Wertung noch Münzen; 40 belohnte Online-Spiele pro Tag; Siege gegen neue Konten zählen anteilig; viele Streitfälle = Ranked-Pause |
| Erfundene Ergebnisse | Statistik muss zum Ergebnis passen, Training bringt nichts; Online zählt nur, wenn beide Seiten dasselbe melden und das Spiel lange genug lief |
| Abhauen bei Rückstand | meldet nur eine Seite "Gegner weg", gewinnt sie nach 3 min (Wartung) |
| Bestenlisten | Endlos-Rekord entsteht auf dem Server aus den gemeldeten Siegen in Folge, der Client kann nichts eintragen |
| "Heute" | immer UTC (`game.today()`), unabhängig von der Zeitzone der Sitzung |
| Käufe | nur per signiertem Stripe-Webhook, Preis aus der Datenbank, nie vom Client |

## Gemessen (Lasttest, 100 000 Spieler, 2 vCPU, 16 Verbindungen)

`supabase/local/load-test.sh` füllt 100 000 Spieler, 3 Mio. Buchungen, 500 000 Spiele, 1 Mio. Freundschaften (1,1 GB).

| Aufruf | Anfragen/s | vorher |
|---|---|---|
| `api.me()` (Start) | ~1700 | |
| Spiel melden | ~910 | 760 |
| Bestenliste Top 50 | ~2500 | |
| Mein Rang | ~9300 | 65 |
| Warteschlange (beitreten + suchen) | ~2050 | 1040 |
| Wartung (alle 10 min, löscht dabei 500 alte Gäste) | 0,5 s | 216 s |

Einzelaufrufe: `me` 3,8 ms, Spiel melden 12 ms, Bestenliste Seite 1000 30 ms, Freunde 1,9 ms.

Zum Vergleich: 1000 gleichzeitige Spieler erzeugen grob 20 bis 50 Anfragen pro Sekunde.
Die kleinste Supabase-Instanz hat damit viel Luft.

## Neues Projekt aufsetzen (oder nach einer Pause neu)

Einmalig: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) und `psql` installieren.

1. Projekt anlegen auf supabase.com (Region Frankfurt, `eu-central-1`). Datenbank-Passwort notieren.
2. Werte holen:
   - **Projekt-Ref**: steht in der URL `https://<ref>.supabase.co`
   - **Access Token**: supabase.com → Account → Access Tokens
   - **DB-URL**: Projekt → Connect → *Session pooler* (Port 5432), Passwort einsetzen
3. Ausführen:
   ```bash
   export SUPABASE_ACCESS_TOKEN=...  SUPABASE_DB_PASSWORD=...  SUPABASE_DB_URL='postgresql://postgres.<ref>:...@...:5432/postgres'
   bash supabase/ops/deploy.sh <ref>
   ```
   Das spielt Migrationen, Katalog und die erste Saison ein, überträgt die Einstellungen aus `config.toml`
   (`supabase config push`: freigegebenes Schema nur `api`, Gast-Anmeldung, Passwortregeln) und lädt die
   Edge Functions hoch. Das Skript lässt sich beliebig oft wiederholen.
4. Im Dashboard einstellen (das geht nicht per Code):
   - **Authentication → Sign In / Providers**: *Allow anonymous sign-ins* an, *Allow manual linking* an
   - **Authentication → Attack Protection**: Captcha an (Cloudflare Turnstile, kostenlos). Ohne Captcha kann
     jemand massenhaft Gast-Konten anlegen. Den Site-Key in `js/content/backend.js` unter `captchaSiteKey` eintragen.
   - **Authentication → URL Configuration**: Site URL `https://louisrostdevelop.github.io/kopfball-duell/`
   - **Realtime → Settings**: *Allow public access* aus (nur private Kanäle, die Regeln stehen in den Migrationen)
   - **Database → Extensions**: `pg_cron` an, dann `bash supabase/ops/deploy.sh <ref>` noch einmal ausführen. Erst
     danach läuft die Wartung alle 10 Minuten.
5. Client verbinden: in `js/content/backend.js` die Projekt-URL und den **anon**-Schlüssel eintragen
   (Project Settings → API). Der Schlüssel ist öffentlich gedacht: die Rechte prüft der Server.
6. Prüfen: `supabase db lint --linked` sollte keine Warnungen zeigen.

### Pause und Wiederherstellen

- **Free-Plan**: Projekte werden nach 7 Tagen ohne Aktivität pausiert. Im Dashboard mit *Restore* wieder
  anwerfen, die Daten bleiben erhalten. Ist das Projekt weg, mit den Schritten oben neu aufsetzen und die
  letzte Sicherung einspielen.
- **Pro-Plan** (ab 25 $/Monat): wird nie pausiert, tägliche Sicherungen inklusive. Sobald echtes Geld fließt,
  ist das die richtige Wahl.

## Sicherung

```bash
SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... bash supabase/ops/backup.sh backups/
```

Gesichert werden die Konten (`auth.users`, `auth.identities`) und alle Spielerdaten. Struktur und Katalog nicht,
die kommen aus dem Repo. Die Datei enthält E-Mail-Adressen, deshalb mit Passphrase verschlüsseln und nicht ins
Repo legen (`backups/` steht in `.gitignore`). `pg_dump` muss mindestens die Postgres-Version des Projekts haben.

Einspielen in ein frisches, leeres Projekt (nach `deploy.sh`):

```bash
SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... bash supabase/ops/restore.sh backups/kopfball-....sql.gz.gpg
```

Das läuft als eine Transaktion: entweder alles oder nichts. In ein Projekt, das schon Spieler hat, wird nicht
eingespielt. `supabase/tests/20_ops.sh` prüft Sicherung und Wiederherstellung bei jedem Testlauf.

## Karriere

Der Server führt die Karriere selbst (`game.progress.career`, Sterne pro Spiel). Jede Karriere-Meldung nennt das Spiel
(`stage`, z. B. `district.0`); der Server prüft, dass es freigeschaltet ist und die Schwierigkeit stimmt. Ein gesperrtes
Spiel wird wie ein normales Spiel belohnt, bringt aber keine Sterne. Ist eine Liga komplett, bucht er den Liga-Bonus
genau einmal (`career_paid`), auch wenn die Tagesgrenze erreicht ist. Ligen, Spiele und Bonus kommen aus
`js/content/career.js` über `supabase/catalog.sql`. Beim Import eines alten lokalen Spielstands werden Sterne übernommen,
schon komplette Ligen bringen dann keinen Bonus.

## Kisten

Kisten vergibt nur der Server (`game.grant_chest`, jede Quelle mit eigener Kennung, doppelt vergeben = nichts), zurzeit
bei jedem Level-Up (`game.add_xp`), für alle Tagesaufgaben (`game.progress_tasks`), die gewonnene Tages-Challenge, alle 5 Wochenaufgaben (`game.progress_weekly`), jede Erfolgs-Stufe (`game.grant_achievements`), jede Karriere-Liga, die Meisterschaft der Köpfe (`game.progress_mastery`, Stufe 3 und 5), Pass-Stufen mit `{"chest": ...}` und nach jedem Saisonende in der Wartung (Ranked-Kiste nach Liga, ab 5 Spielen). Geöffnet wird mit `api.open_chest`: der Server würfelt (`game.roll_chest`, Chancen
aus `game.chest_defs`, Garantie-Zähler in `progress.pity`), bucht Münzen und Juwelen, gibt Gegenstände, macht aus
doppelter Kosmetik Splitter (`wallets.shards`) und aus doppelten Köpfen Kopf-XP. Zweimal öffnen gibt das gespeicherte
Ergebnis. `api.craft_item` stellt Kosmetik aus Splittern her. Kisten gibt es nie gegen Geld oder Juwelen
(docs/PROGRESSION.md). Chancen und Garantien kommen aus `js/content/cosmetics.js` über `supabase/catalog.sql`.

## Offline spielen

Nach dem ersten Besuch startet das Spiel ohne Netz (Service Worker). Gegen den Computer, zu zweit und Training gehen
offline; Casual, Ranked, Mit Freunden, Shop und Bestenlisten brauchen Netz.

Mit Server-Konto warten offline gespielte Spiele im Browser (bis zu 60) und gehen der Reihe nach raus, sobald wieder
Netz da ist (beim Start, beim Wiederverbinden, wenn der Tab wieder sichtbar wird; bei zu vielen auf einmal alle 30 s
weiter). Das Zeitkonto erlaubt 90 Minuten nachgereichte Spielzeit, das Limit sind 20 Meldungen pro Minute. Was der
Server nicht wertet, meldet das Spiel ("2 offline gespielte Spiele wurden nicht gewertet"). Mit Münzen kaufen geht offline
nicht, damit nichts später zurückgedreht werden muss.

## Konto löschen

Spieler löschen ihr Konto selbst (Einstellungen → Konto → *Konto und Daten löschen*, Server: `api.delete_account('DELETE')`).
Gelöscht werden das Konto und alle Spielerdaten. Käufe bleiben 10 Jahre (Aufbewahrungspflicht), aber ohne
Verbindung zum Spieler. Die Löschung wird in `game.erasures` vermerkt; `restore.sh` löscht diese Konten nach dem
Einspielen einer älteren Sicherung wieder.

## Sicherheits-Review (November 2026)

Ein Review mit Lasttest hat folgende Lücken gefunden. Jede behobene hat einen Test in `supabase/tests/05_review.sql`
(oder `10_concurrency.sh`), der vorher gescheitert wäre.

| Fund | Stand |
|---|---|
| C1 Tagesbonus und Tageslimits per Zeitzone der Sitzung zurücksetzbar | behoben (`game.today()`, UTC) |
| H1 CPU-Spiele beliebig schnell meldbar, Training gab Belohnungen, Statistik ungeprüft | behoben (Zeitkonto, Tagesgrenze, Statistik-Prüfung) |
| H2 Import alter Spielstände unbegrenzt wiederholbar | behoben (nur 24 h nach Kontoanlage, Münzen + Gegenstände gemeinsam gedeckelt) |
| H3 Online-Absprachen brachten weiter Münzen | behoben (Paar-Grenze und Tagesgrenze sperren auch Belohnungen, Mindestdauer) |
| H4 Wer bei Rückstand abhaut, verliert nie | behoben (einseitige Meldung wird nach 3 min gewertet) |
| H5 Rückbuchung ließ ausgegebene Juwelen, Pass und Gegenstände | behoben (Juwelen-Schuld, Pass und Gegenstände entzogen, Konto markiert) |
| M1–M3 Ränge falsch auf späteren Seiten, bei Gleichstand und nach Löschungen | behoben |
| M4 Bestenlisten frei vom Client beschreibbar | behoben (Endlos nur aus Server-Daten) |
| M5 Doppelter Pass-Kauf in zwei Tabs | behoben (Zeilensperre) |
| Einmal-Paket (Starter) über zwei gleichzeitige Webhooks doppelt | behoben (Käufe pro Spieler nacheinander) |
| M8 Projekt-Einstellungen nur von Hand | behoben (`config push` in `deploy.sh`) |
| M9 Kein Konto-Löschen (DSGVO) | behoben |
| Stripe: Betrag/Währung, Teil-Erstattungen, Idempotenz, CORS | behoben |
| M6 Siege mit Zweitkonten verschieben | behoben: Sieg gegen ein Konto mit weniger als 10 Ranked-Spielen bringt nur anteilig Punkte (der Verlierer verliert voll), dazu die Paar-Grenze |
| M7 `ledger` und Anfrage-Tabellen wachsen unbegrenzt | offen: ab ~10 Mio. Zeilen nach Monat partitionieren |
| Strafe für häufige Streitfälle | behoben: 3 strittige Spiele in 24 h = 12 h keine Ranked-Suche (Casual geht) |
| Erfolge, deren Fakten der Client meldet | teilweise: nur Plausibilität |
| Sicherung enthält alle Spalten von `auth.users` (auch Einmal-Token) | offen, bewusst: eine Spaltenauswahl lässt sich ohne echtes Projekt nicht gegen das Supabase-Schema testen. Sicherung ist verschlüsselt |

## Saisons

Eine Saison dauert 28 Tage. Die nächste anlegen (im SQL-Editor oder per `psql`):

```bash
psql "$SUPABASE_DB_URL" -f supabase/ops/new-season.sql
```

Sie beginnt, wenn die letzte endet. Man kann also mehrere im Voraus anlegen. Pass-Stufen und Belohnungen stehen
in der Datei.

## Zahlungen (Stripe)

1. Stripe-Konto, dann in `supabase/.env.production` (nicht ins Repo):
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   SITE_URL=https://louisrostdevelop.github.io/kopfball-duell/
   ALLOWED_ORIGINS=https://louisrostdevelop.github.io
   ```
   Hochladen: `supabase secrets set --env-file supabase/.env.production` (macht auch `deploy.sh`).
2. In Stripe einen Webhook auf `https://<ref>.supabase.co/functions/v1/stripe-webhook` anlegen, mit den Ereignissen
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded` und
   `charge.dispute.created`.
3. Ablauf:
   - Der Client ruft `create-checkout` auf. Die Funktion prüft Konto und Produkt, den Preis liest sie aus der Datenbank.
   - Der Spieler bezahlt bei Stripe.
   - Stripe meldet die Zahlung an `stripe-webhook`. Erst dann bucht `api.grant_purchase`.
   - Kann ein Kauf nicht gebucht werden (z. B. das Starterpaket doppelt in zwei Tabs), erstattet die Funktion
     ihn sofort.
   - Bei Erstattung oder Rückbuchung werden die Juwelen zurückgeholt, soweit sie noch da sind.
4. Testen mit Testschlüsseln (`sk_test_...`) und `stripe listen --forward-to <url>`.

Preise und Produkte stehen in `tools/gen-catalog.mjs` und landen über `npm run catalog` in `catalog.sql`.

## Lokal entwickeln (ohne Docker)

```bash
npm run test:db                 # alle Datenbank-Tests auf einem eigenen Postgres
node tools/dev-backend.mjs      # lokale Datenbank + Supabase-Ersatz auf :54321
npm run serve                   # Spiel auf :8765
# Spiel mit Server: http://localhost:8765/?backend=http://localhost:54321
```

`tools/dev-backend.mjs` bildet die Supabase-Adressen nach (Gast-Anmeldung, Token, `/rest/v1/rpc`) und ruft die
echten Funktionen mit den echten Rechten auf. Die Token sind nicht signiert, das Ganze ist also nur für die
Entwicklung. Mit Docker geht auch der echte Stack: `supabase start`. Die CI testet beides.

Lasttest: `bash supabase/local/load-test.sh 100000 20 16` (Spieler, Sekunden, Verbindungen).

## Wenn es groß wird

| Wann | Was |
|---|---|
| Echtes Geld | Pro-Plan (keine Pause, tägliche Sicherungen, Point-in-Time-Recovery dazubuchbar) |
| > 2 000 gleichzeitig | größere Instanz (Compute Add-on). Die Funktionen sind auf kurze Sperren ausgelegt |
| > 10 Mio. Buchungen | `ledger` nach Monat partitionieren. Der BRIN-Index auf `created_at` ist schon da |
| Online-Betrug | Prüfdienst: Eingaben aus dem Storage-Bucket `match-logs` nachsimulieren (`js/core` läuft in Deno) |
| Bestenlisten sehr groß | sind sie schon: Rang über die Zähltabelle `score_counts`, unabhängig von der Größe |
