-- =====================================================================================
-- Grundgerüst: zwei Schemas.
--   game  Daten. Von außen NICHT erreichbar (kein PostgREST, keine Rechte für anon/authenticated).
--   api   Die einzige öffentliche Schnittstelle: Funktionen. Jede prüft selbst, wer ruft.
-- So kann kein Client eine Tabelle direkt lesen oder schreiben, egal wie die Zeilen-Regeln stehen.
-- =====================================================================================

create schema if not exists game;
create schema if not exists api;

revoke all on schema game from public;
revoke all on schema api from public;
grant usage on schema api to anon, authenticated, service_role;
grant usage on schema game to service_role;

-- Neue Funktionen sind erst nach ausdrücklichem GRANT aufrufbar.
-- Achtung: "IN SCHEMA" kann das eingebaute PUBLIC-Recht nicht entziehen, nur die globale Form.
-- Deshalb zusätzlich am Ende jeder Migration: revoke ... from public (der Test 01_security prüft das).
alter default privileges revoke execute on functions from public;
alter default privileges in schema game revoke all on tables from public;

-- ---------- Einstellungen zum Nachjustieren ohne Migration (Belohnungen, Preise, Grenzen) ----------
create table if not exists game.config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table game.config enable row level security;

insert into game.config (key, value) values
  ('start_coins', '150'),
  ('start_items', '["head:kalle","head:yuki","head:bolt","arena:stadion","arena:strand","ball:klassik"]'),
  ('cpu_daily_cap', '600'),            -- volle Münzen aus Computer-Spielen pro Tag
  ('cpu_after_cap', '0.2'),            -- Anteil danach
  ('cpu_hard_cap', '1500'),            -- ab hier (gezählte Münzen) gibt es heute nichts mehr: Schutz vor Bots
  ('cpu_daily_matches', '80'),         -- höchstens so viele belohnte CPU-Spiele am Tag
  ('cpu_time_bank', '5400'),           -- Zeitkonto: so viele Sekunden Spielzeit dürfen auf einmal nachgemeldet werden (offline gespielt)
  ('online_daily_rewarded', '40'),     -- höchstens so viele belohnte Online-Spiele am Tag
  ('online_min_secs', '30'),           -- ein Online-Spiel dauert mindestens so lange (Meldung früher = ungültig)
  ('forfeit_after_secs', '180'),       -- meldet nur eine Seite, gilt ihr Ergebnis nach dieser Zeit
  ('ranked_pair_limit', '5'),          -- gleiches Paar öfter als so oft in 24 h: keine Wertungsänderung (Absprachen)
  ('ranked_provisional', '10'),        -- Sieg gegen ein Konto mit weniger Ranked-Spielen bringt nur anteilig Wertung (Zweitkonten)
  ('dispute_limit', '3'),              -- so viele strittige Spiele in 24 h: Ranked-Pause
  ('dispute_cooldown_hours', '12'),
  ('diff_mult', '[1, 1.3, 1.7, 2.4]'), -- Münz-Faktor je Schwierigkeit
  ('head_max_level', '10'),
  ('head_xp_per_level', '100'),        -- benötigte Kopf-XP: 100 * Level
  ('head_coins_per_level', '200'),     -- Münzen für Aufstieg: 200 * Level
  ('head_gems_per_10xp', '1'),         -- Juwelen, um fehlende Kopf-XP aufzufüllen
  ('online_coins', '{"win": 70, "loss": 25}'),
  ('elo_k', '32'),
  ('elo_start', '1000'),
  ('ranked_min_level', '5'),
  ('casual_min_level', '2'),
  ('import_coin_cap', '2000'),
  ('name_min', '3'),
  ('name_max', '16')
on conflict (key) do nothing;

-- Wert lesen (stabil innerhalb einer Anfrage, landet im Cache)
create or replace function game.cfg(k text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from game.config where key = k
$$;
create or replace function game.cfg_int(k text) returns integer
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::integer from game.config where key = k
$$;
create or replace function game.cfg_num(k text) returns numeric
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::numeric from game.config where key = k
$$;

-- ---------- Fehler mit festem Code (der Client übersetzt die Codes in Texte) ----------
create or replace function game.fail(code text, detail text default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = code, detail = coalesce(detail, '');
end $$;

-- ---------- Heute (UTC) ----------
-- Nie current_date benutzen: das hängt an der Zeitzone der Sitzung, und die kann ein Client über PostgREST
-- (Header "Prefer: timezone=...") selbst setzen. Damit ließen sich Tageslimits beliebig oft zurücksetzen.
create or replace function game.today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'UTC')::date $$;

-- ---------- Wer ruft? ----------
create or replace function game.me() returns uuid
language plpgsql stable set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then perform game.fail('not_authenticated'); end if;
  return u;
end $$;

-- Niemand außer ausdrücklich Berechtigten darf Funktionen ausführen
revoke execute on all functions in schema api, game from public;
