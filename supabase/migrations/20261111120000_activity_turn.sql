-- =====================================================================================
-- Aktivität genauer, Relay-Zugangsdaten begrenzt.
-- „Im Spiel“ zählt nur noch Spiele, die beide Seiten angepfiffen haben (p1_started_at/p2_started_at) und für die noch
-- keiner ein Ergebnis gemeldet hat; gescheiterte Verbindungsversuche, die nie begonnen haben, zählen nicht.
-- „Aktiv“ heißt „außer mir online“: der Aufrufer zählt nicht mit, die Anzeige nennt also nur andere Spieler.
-- api.turn_allowed begrenzt, wie oft ein Spieler Relay-Zugangsdaten holen darf (Funktion turn): jede Anfrage kostet
-- bei Cloudflare, und die Zugangsdaten lassen sich weitergeben. Sonst wie 20261108120000_activity.sql.
-- =====================================================================================

create or replace function api.activity() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p uuid := game.me();   -- nur angemeldete Clients (auch Gäste)
begin
  return jsonb_build_object(
    'active',  (select count(*) from game.players where last_seen_at > now() - interval '15 minutes' and id <> p),
    'casual',  (select count(*) from game.match_queue where mode = 'casual' and match_id is null and seen_at > now() - interval '10 seconds'),
    'ranked',  (select count(*) from game.match_queue where mode = 'ranked' and match_id is null and seen_at > now() - interval '10 seconds'),
    -- 10 Minuten: deckt ein Spiel mit Golden Goal und Wiederholungen ab; hängengebliebene fallen danach heraus
    'playing', 2 * (select count(*) from game.matches where status = 'open' and mode in ('casual', 'ranked')
                      and p1_started_at is not null and p2_started_at is not null
                      and report1 is null and report2 is null
                      and greatest(p1_started_at, p2_started_at) > now() - interval '10 minutes'));
end $$;

revoke all on function api.activity() from public, anon;
grant execute on function api.activity() to authenticated;

-- Wirft rate_limited, wenn ein Spieler zu oft Relay-Zugangsdaten holt. Der Client holt sie beim Start und danach
-- nur, wenn die alten zur Hälfte abgelaufen sind; die Grenze lässt dazu reichlich Luft (Neuladen, mehrere Tabs).
create or replace function api.turn_allowed() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  perform game.limit_rate(p, 'turn', 20, interval '1 hour');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function api.turn_allowed() from public, anon;
grant execute on function api.turn_allowed() to authenticated;
