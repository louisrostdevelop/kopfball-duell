-- =====================================================================================
-- Tabellen. Alle im Schema game, alle mit Row Level Security an und OHNE Regeln
-- (= für anon/authenticated gesperrt, falls je ein Recht versehentlich vergeben wird).
-- Geschrieben wird nur über die Funktionen in api (laufen als Eigentümer).
-- =====================================================================================

-- ---------- Katalog: was es gibt und was es kostet (wird aus js/content erzeugt, siehe supabase/catalog.sql) ----------
create table if not exists game.items (
  id text primary key,
  kind text not null check (kind in ('head', 'ball', 'arena', 'skin', 'celebration', 'emote', 'frame', 'title')),
  rarity text not null default 'basis' check (rarity in ('basis', 'selten', 'episch', 'legend')),
  price_coins integer check (price_coins >= 0),   -- null = nicht für Münzen
  price_gems integer check (price_gems >= 0),     -- null = nicht für Juwelen
  active boolean not null default true,
  meta jsonb not null default '{}'
);

-- Echtgeld-Produkte (Juwelen-Pakete, Pass, Starter-Paket)
create table if not exists game.products (
  id text primary key,
  gems integer not null default 0 check (gems >= 0),
  items text[] not null default '{}',
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'EUR',
  once_per_player boolean not null default false,
  active boolean not null default true
);

-- ---------- Spieler ----------
create table if not exists game.players (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  title text,
  frame text,
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp >= 0),
  prefs jsonb not null default '{}' check (octet_length(prefs::text) <= 8192),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
-- Namen eindeutig, ohne Rücksicht auf Groß/Klein
create unique index if not exists players_name_key on game.players (lower(name)) where name is not null;
-- Aufräumen inaktiver Gäste
create index if not exists players_last_seen on game.players (last_seen_at);

create table if not exists game.wallets (
  player_id uuid primary key references game.players (id) on delete cascade,
  coins bigint not null default 0 check (coins >= 0),
  gems bigint not null default 0 check (gems >= 0),
  updated_at timestamptz not null default now()
);

-- Jede Buchung, nur anhängen. Kontostand = Summe; wallets hält ihn für schnelles Lesen.
create table if not exists game.ledger (
  id bigint generated always as identity primary key,
  player_id uuid not null references game.players (id) on delete cascade,
  currency text not null check (currency in ('coins', 'gems')),
  delta integer not null check (delta <> 0),
  balance_after bigint not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_player on game.ledger (player_id, id desc);

create table if not exists game.inventory (
  player_id uuid not null references game.players (id) on delete cascade,
  item_id text not null references game.items (id),
  source text not null,
  acquired_at timestamptz not null default now(),
  primary key (player_id, item_id)
);
create index if not exists inventory_item on game.inventory (item_id);

create table if not exists game.heads (
  player_id uuid not null references game.players (id) on delete cascade,
  head_id text not null references game.items (id),
  level smallint not null default 1 check (level between 1 and 50),
  xp integer not null default 0 check (xp >= 0),
  games integer not null default 0,
  primary key (player_id, head_id)
);

-- Kleine Zustände pro Spieler. Heiße Felder als Spalten, selten genutzte als JSON.
create table if not exists game.progress (
  player_id uuid primary key references game.players (id) on delete cascade,
  daily_last date,
  daily_streak smallint not null default 0,
  cap_day date,
  cap_cpu_coins integer not null default 0,
  challenge_day date,
  tasks_day date,
  tasks jsonb not null default '[]',
  career jsonb not null default '{}',
  achievements jsonb not null default '{}',
  stats jsonb not null default '{"games":0,"wins":0,"goals":0,"headGoals":0,"pus":0,"stomps":0,"supers":0}',
  imported boolean not null default false
);

-- Gleiche Anfrage zweimal (Netz-Wiederholung) = nur einmal ausführen
create table if not exists game.requests (
  player_id uuid not null references game.players (id) on delete cascade,
  key text not null check (length(key) between 8 and 64),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (player_id, key)
);
create index if not exists requests_created on game.requests (created_at);

-- Anfragen pro Zeitfenster begrenzen
create table if not exists game.rate_limits (
  player_id uuid not null references game.players (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (player_id, action)
);

-- ---------- Saison, Pass, Wertung ----------
create table if not exists game.seasons (
  id integer primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  pass jsonb not null default '[]'   -- [{ "points": 100, "free": {...}, "premium": {...} }, ...]
);
create index if not exists seasons_time on game.seasons (starts_at, ends_at);

create table if not exists game.pass_progress (
  player_id uuid not null references game.players (id) on delete cascade,
  season_id integer not null references game.seasons (id),
  points integer not null default 0,
  premium boolean not null default false,
  claimed_free bigint not null default 0,      -- Bitmaske abgeholter Stufen
  claimed_premium bigint not null default 0,
  primary key (player_id, season_id)
);

create table if not exists game.ratings (
  player_id uuid not null references game.players (id) on delete cascade,
  season_id integer not null references game.seasons (id),
  mmr integer not null,
  games integer not null default 0,
  wins integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, season_id)
);
create index if not exists ratings_board on game.ratings (season_id, mmr desc, player_id);

-- ---------- Online: Warteschlange und Spiele ----------
create table if not exists game.matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('ranked', 'casual', 'friend')),
  season_id integer references game.seasons (id),
  p1 uuid not null references game.players (id) on delete cascade,   -- Host
  p2 uuid not null references game.players (id) on delete cascade,
  heads jsonb not null default '{}',     -- Kopf und Level beider Spieler zum Spielbeginn (vom Server)
  status text not null default 'open' check (status in ('open', 'settled', 'disputed', 'review', 'void')),
  report1 jsonb,
  report2 jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists matches_p1 on game.matches (p1, created_at desc);
create index if not exists matches_p2 on game.matches (p2, created_at desc);
create index if not exists matches_open on game.matches (created_at) where status in ('open', 'disputed', 'review');

create table if not exists game.match_queue (
  player_id uuid primary key references game.players (id) on delete cascade,
  mode text not null check (mode in ('ranked', 'casual')),
  mmr integer not null,
  head_id text not null,
  enqueued_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  match_id uuid references game.matches (id) on delete set null
);
create index if not exists match_queue_find on game.match_queue (mode, mmr) where match_id is null;
create index if not exists match_queue_wait on game.match_queue (mode, enqueued_at) where match_id is null;

-- ---------- Bestenlisten und Freunde ----------
create table if not exists game.scores (
  board text not null check (board in ('endless', 'daily')),
  period text not null,                -- 'all' oder ein Tag 'YYYY-MM-DD'
  player_id uuid not null references game.players (id) on delete cascade,
  score integer not null check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (board, period, player_id)
);
create index if not exists scores_board on game.scores (board, period, score desc, updated_at);
create index if not exists scores_player on game.scores (player_id);                  -- Löschen von Spielern
create index if not exists scores_period on game.scores (period) where period <> 'all';  -- Aufräumen alter Tage

-- Wie viele Einträge haben welchen Wert? Macht "Mein Rang" unabhängig von der Größe der Liste:
-- Rang = Summe der Einträge mit höherem Wert (wenige hundert Zeilen statt Millionen zu zählen).
create table if not exists game.score_counts (
  board text not null,
  period text not null,
  score integer not null,
  n integer not null check (n >= 0),
  primary key (board, period, score)
);

create table if not exists game.friends (
  player_id uuid not null references game.players (id) on delete cascade,
  friend_id uuid not null references game.players (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (player_id, friend_id),
  check (player_id <> friend_id)
);
create index if not exists friends_reverse on game.friends (friend_id);

-- ---------- Käufe mit echtem Geld ----------
create table if not exists game.purchases (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references game.players (id) on delete restrict,
  provider text not null,
  provider_ref text not null,
  product_id text not null references game.products (id),
  amount_cents integer not null,
  currency text not null,
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index if not exists purchases_player on game.purchases (player_id, created_at desc);

-- ---------- Tagesaufgaben und Erfolge (Definitionen) ----------
create table if not exists game.task_defs (
  id text primary key,
  goals integer[] not null,
  reward integer not null,
  active boolean not null default true
);
create table if not exists game.achievement_defs (
  id text primary key,
  reward integer not null,
  stat text,
  goal integer
);

-- Wörter, die in Namen nicht vorkommen dürfen
create table if not exists game.banned_words (word text primary key);

-- ---------- Performance ----------
-- Oft geänderte Zeilen: Platz auf der Seite lassen, damit Updates ohne Index-Umbau gehen (HOT-Updates)
alter table game.wallets set (fillfactor = 80);
alter table game.progress set (fillfactor = 70);
alter table game.heads set (fillfactor = 80);
alter table game.players set (fillfactor = 90);
alter table game.pass_progress set (fillfactor = 80);
alter table game.ratings set (fillfactor = 80);
alter table game.rate_limits set (fillfactor = 70);
alter table game.match_queue set (fillfactor = 70);
alter table game.score_counts set (fillfactor = 80);
-- Ledger wächst am schnellsten: winziger Zeit-Index für Auswertungen und Archivierung
create index if not exists ledger_time on game.ledger using brin (created_at);

-- Row Level Security überall an, ohne Regeln: direkter Zugriff ist gesperrt
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'game' loop
    execute format('alter table game.%I enable row level security', t.tablename);
    execute format('revoke all on game.%I from public, anon, authenticated', t.tablename);
    execute format('grant select on game.%I to service_role', t.tablename);
  end loop;
end $$;
