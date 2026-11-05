-- =====================================================================================
-- Bausteine für alle Spiel-Funktionen: Buchen, Gegenstände geben, XP, Begrenzen, Doppelt-Schutz.
-- Alle laufen als Eigentümer (security definer) mit leerem search_path, damit niemand eigene
-- Objekte mit gleichem Namen unterschieben kann. Alles ist voll qualifiziert.
-- =====================================================================================

-- ---------- Münzen und Juwelen buchen (atomar, nie unter null) ----------
create or replace function game.book(p uuid, cur text, amount integer, why text, ref text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare bal bigint;
begin
  if amount = 0 then
    select case cur when 'coins' then coins else gems end into bal from game.wallets where player_id = p;
    return bal;
  end if;
  if cur = 'coins' then
    update game.wallets set coins = coins + amount, updated_at = now()
     where player_id = p and coins + amount >= 0 returning coins into bal;
  elsif cur = 'gems' then
    update game.wallets set gems = gems + amount, updated_at = now()
     where player_id = p and gems + amount >= 0 returning gems into bal;
  else
    perform game.fail('bad_currency');
  end if;
  if bal is null then perform game.fail('insufficient_funds', cur); end if;
  insert into game.ledger (player_id, currency, delta, balance_after, reason, ref) values (p, cur, amount, bal, why, ref);
  return bal;
end $$;

-- ---------- Gegenstand geben (Köpfe bekommen zusätzlich einen Level-Eintrag) ----------
create or replace function game.give_item(p uuid, item text, why text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  select kind into k from game.items where id = item;
  if k is null then perform game.fail('unknown_item', item); end if;
  insert into game.inventory (player_id, item_id, source) values (p, item, why) on conflict do nothing;
  if not found then return false; end if;
  if k = 'head' then insert into game.heads (player_id, head_id) values (p, item) on conflict do nothing; end if;
  return true;
end $$;

-- ---------- Konto-XP: Level-Aufstiege geben Münzen, alle 5 Level Juwelen ----------
create or replace function game.add_xp(p uuid, amount integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lvl integer; cur integer; ups integer[] := '{}';
begin
  if amount <= 0 then return '[]'::jsonb; end if;
  update game.players set xp = xp + amount where id = p returning level, xp into lvl, cur;
  while cur >= 120 + (lvl - 1) * 60 loop
    cur := cur - (120 + (lvl - 1) * 60); lvl := lvl + 1; ups := ups || lvl;
    perform game.book(p, 'coins', 50 + lvl * 10, 'level', lvl::text);
    if lvl % 5 = 0 then perform game.book(p, 'gems', 20, 'level', lvl::text); end if;
  end loop;
  if array_length(ups, 1) > 0 then update game.players set level = lvl, xp = cur where id = p; end if;
  return to_jsonb(ups);
end $$;

-- ---------- Begrenzen: höchstens n Aufrufe pro Fenster ----------
create or replace function game.limit_rate(p uuid, act text, max_hits integer, per interval) returns void
language plpgsql security definer set search_path = '' as $$
declare h integer;
begin
  insert into game.rate_limits as r (player_id, action, window_start, hits) values (p, act, now(), 1)
  on conflict (player_id, action) do update
     set hits = case when r.window_start < now() - per then 1 else r.hits + 1 end,
         window_start = case when r.window_start < now() - per then now() else r.window_start end
  returning hits into h;
  if h > max_hits then perform game.fail('rate_limited', act); end if;
end $$;

-- ---------- Doppelt-Schutz: Schlüssel belegen; wer zu spät kommt, bekommt das gespeicherte Ergebnis ----------
-- Gibt null zurück, wenn der Aufruf neu ist (dann ausführen), sonst das frühere Ergebnis.
create or replace function game.idem_begin(p uuid, k text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if k is null then return null; end if;
  if length(k) < 8 or length(k) > 64 then perform game.fail('bad_request_key'); end if;
  insert into game.requests (player_id, key) values (p, k) on conflict do nothing;
  if found then return null; end if;
  select result into r from game.requests where player_id = p and key = k;
  return coalesce(r, '{"pending":true}'::jsonb);
end $$;
create or replace function game.idem_end(p uuid, k text, r jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if k is not null then update game.requests set result = r where player_id = p and key = k; end if;
  return r;
end $$;

-- ---------- Aktuelle Saison ----------
create or replace function game.current_season() returns integer
language sql stable security definer set search_path = '' as $$
  select id from game.seasons where starts_at <= now() and ends_at > now() order by starts_at desc limit 1
$$;

-- ---------- Neuer Spieler: beim Anlegen eines Auth-Kontos (auch anonym) ----------
create or replace function game.setup_player(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare it text;
begin
  insert into game.players (id) values (p) on conflict do nothing;
  if not found then return; end if;
  insert into game.wallets (player_id) values (p) on conflict do nothing;
  perform game.book(p, 'coins', game.cfg_int('start_coins'), 'start');
  insert into game.progress (player_id) values (p) on conflict do nothing;
  for it in select jsonb_array_elements_text(game.cfg('start_items')) loop
    if exists (select 1 from game.items where id = it) then perform game.give_item(p, it, 'start'); end if;
  end loop;
end $$;
create or replace function game.on_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform game.setup_player(new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function game.on_new_user();

-- ---------- Gesamter Zustand des Spielers in EINER Antwort ----------
create or replace function game.state(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pl.id,
    'name', pl.name, 'title', pl.title, 'frame', pl.frame,
    'level', pl.level, 'xp', pl.xp, 'xpNext', 120 + (pl.level - 1) * 60,
    'prefs', pl.prefs,
    'guest', coalesce((select u.is_anonymous from auth.users u where u.id = pl.id), true),
    'coins', w.coins, 'gems', w.gems,
    'items', coalesce((select jsonb_agg(i.item_id order by i.item_id) from game.inventory i where i.player_id = pl.id), '[]'),
    'heads', coalesce((select jsonb_object_agg(h.head_id, jsonb_build_object('level', h.level, 'xp', h.xp, 'xpNext', game.cfg_int('head_xp_per_level') * h.level))
                         from game.heads h where h.player_id = pl.id), '{}'),
    'daily', jsonb_build_object('last', pr.daily_last, 'streak', pr.daily_streak),
    'challengeDone', pr.challenge_day = current_date,
    'tasks', case when pr.tasks_day = current_date then pr.tasks else '[]'::jsonb end,
    'career', pr.career, 'achievements', pr.achievements, 'stats', pr.stats,
    'cpuCoinsToday', case when pr.cap_day = current_date then pr.cap_cpu_coins else 0 end,
    'season', (select jsonb_build_object('id', s.id, 'endsAt', s.ends_at,
                 'pass', (select jsonb_build_object('points', pp.points, 'premium', pp.premium, 'free', pp.claimed_free, 'premiumClaimed', pp.claimed_premium)
                            from game.pass_progress pp where pp.player_id = pl.id and pp.season_id = s.id),
                 'rating', (select jsonb_build_object('mmr', r.mmr, 'games', r.games, 'wins', r.wins)
                              from game.ratings r where r.player_id = pl.id and r.season_id = s.id))
               from game.seasons s where s.id = game.current_season())
  )
  from game.players pl
  join game.wallets w on w.player_id = pl.id
  join game.progress pr on pr.player_id = pl.id
  where pl.id = p
$$;

-- Niemand außer ausdrücklich Berechtigten darf Funktionen ausführen
revoke execute on all functions in schema api, game from public;
