-- =====================================================================================
-- Verbindungs-Check nach dem Paaren (js/app/matchmaking.js): Ist der Ping zwischen beiden zu schlecht, bricht der
-- Host das Spiel vor dem Anpfiff ab (api.match_abort). Beide suchen neu; dieselben zwei werden eine Weile nicht
-- mehr gepaart (game.mm_avoid). Gilt nur vor dem Anpfiff, sonst ließe sich so eine Niederlage verhindern.
-- =====================================================================================

create table if not exists game.mm_avoid (
  a uuid not null references game.players (id) on delete cascade,
  b uuid not null references game.players (id) on delete cascade,
  until timestamptz not null,
  primary key (a, b)
);
alter table game.mm_avoid enable row level security;
revoke all on game.mm_avoid from public, anon, authenticated;

-- Spiel vor dem Anpfiff abbrechen (schlechte Verbindung). Darf jeder der beiden, auch beide nacheinander.
create or replace function api.match_abort(match uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); mt game.matches;
begin
  perform game.limit_rate(p, 'match_abort', 6, interval '10 minutes');
  select * into mt from game.matches where id = match for update;
  if mt.id is null or p not in (mt.p1, mt.p2) then perform game.fail('unknown_match'); end if;
  if mt.status = 'void' then return jsonb_build_object('status', 'void'); end if;
  if mt.status <> 'open' or mt.report1 is not null or mt.report2 is not null then perform game.fail('too_late'); end if;
  if mt.created_at < now() - interval '90 seconds' then perform game.fail('too_late'); end if;
  update game.matches set status = 'void', settled_at = now() where id = match;
  delete from game.match_queue where match_id = match;
  delete from game.mm_avoid where until < now();
  insert into game.mm_avoid (a, b, until) values (least(mt.p1, mt.p2), greatest(mt.p1, mt.p2), now() + interval '15 minutes')
  on conflict (a, b) do update set until = excluded.until;
  return jsonb_build_object('status', 'void');
end $$;

-- Wie 20261105120400_api_online.sql, dazu: Paare mit schlechter Verbindung (game.mm_avoid) nicht erneut zusammenbringen
create or replace function game.avoids(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from game.mm_avoid av where av.a = least(x, y) and av.b = greatest(x, y) and av.until > now())
$$;

create or replace function api.queue_poll() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); me game.match_queue; other game.match_queue; up game.match_queue; down game.match_queue; waited numeric; win integer; m uuid; s integer;
  h1 game.heads; h2 game.heads;
begin
  select * into me from game.match_queue where player_id = p for update;
  if me.player_id is null then perform game.fail('not_queued'); end if;
  if me.match_id is not null then return game.match_info(me.match_id, p); end if;
  -- Bremse ohne eigene Schreibzugriffe: höchstens alle 0,5 s suchen (seen_at wird ohnehin aktualisiert)
  if me.seen_at > now() - interval '500 milliseconds' and me.seen_at > me.enqueued_at then
    return jsonb_build_object('matched', false, 'waited', round(extract(epoch from now() - me.enqueued_at)));
  end if;
  update game.match_queue set seen_at = now() where player_id = p;
  waited := extract(epoch from now() - me.enqueued_at);
  win := case when me.mode = 'ranked' then least(600, 100 + (waited * 25)::integer) else 1000000 end;
  if me.mode = 'casual' then
    -- Casual: wer am längsten wartet (Index auf Wartezeit)
    select * into other from game.match_queue q
     where q.mode = 'casual' and q.match_id is null and q.player_id <> p and q.seen_at > now() - interval '10 seconds'
       and not game.avoids(p, q.player_id)
     order by q.enqueued_at limit 1 for update skip locked;
  else
    -- Ranked: nächster Gegner darüber und darunter über den Wertungs-Index, der nähere gewinnt
    select * into up from game.match_queue q
     where q.mode = 'ranked' and q.match_id is null and q.player_id <> p and q.mmr >= me.mmr and q.mmr <= me.mmr + win
       and q.seen_at > now() - interval '10 seconds' and not game.avoids(p, q.player_id)
     order by q.mmr limit 1 for update skip locked;
    select * into down from game.match_queue q
     where q.mode = 'ranked' and q.match_id is null and q.player_id <> p and q.mmr < me.mmr and q.mmr >= me.mmr - win
       and q.seen_at > now() - interval '10 seconds' and not game.avoids(p, q.player_id)
     order by q.mmr desc limit 1 for update skip locked;
    other := case when up.player_id is null then down when down.player_id is null then up
                  when up.mmr - me.mmr <= me.mmr - down.mmr then up else down end;
  end if;
  if other.player_id is null then return jsonb_build_object('matched', false, 'waited', round(waited)); end if;
  s := case when me.mode = 'ranked' then game.current_season() end;
  select * into h1 from game.heads where player_id = other.player_id and head_id = other.head_id;
  select * into h2 from game.heads where player_id = p and head_id = me.head_id;
  -- Wer länger wartet, hostet (hat meist die stabilere Verbindung schon offen)
  insert into game.matches (mode, season_id, p1, p2, heads)
  values (me.mode, s, other.player_id, p,
          jsonb_build_object('p1', jsonb_build_object('head', h1.head_id, 'level', h1.level, 'cos', other.cos),
                             'p2', jsonb_build_object('head', h2.head_id, 'level', h2.level, 'cos', me.cos)))
  returning id into m;
  update game.match_queue set match_id = m where player_id in (p, other.player_id);
  -- Der Wartende erfährt es sofort über seinen Kanal (sonst bei seiner nächsten Abfrage)
  perform game.notify('user:' || other.player_id, 'matched', jsonb_build_object('match', m));
  return game.match_info(m, p);
end $$;

revoke all on function api.match_abort(uuid) from public, anon;
grant execute on function api.match_abort(uuid) to authenticated;
revoke all on function game.avoids(uuid, uuid) from public, anon, authenticated;
