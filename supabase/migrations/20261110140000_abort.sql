-- =====================================================================================
-- Abbruch vor dem eigenen Anpfiff: Der Gast prüft den Start des Hosts und bricht bei
-- ungültigen Bedingungen ab. Der Host hat den Anpfiff dann schon gemeldet; scheiterte der Abbruch daran (too_late), hinge
-- das Spiel beim Server. Deshalb zählt nur der eigene Anpfiff (p1_started_at/p2_started_at, 20261109120000):
-- wer selbst angepfiffen hat, kann nicht mehr abbrechen. Wer seinen Anpfiff nie meldet, kann damit ohnehin eine
-- einseitige Meldung (Ergebnis, „Gegner weg“) wertlos machen (melden beide dasselbe, wird trotzdem gewertet),
-- dazu kommt nichts Neues. Sonst wie 20261107120000_net_check.sql.
-- =====================================================================================

create or replace function api.match_abort(match uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); mt game.matches;
begin
  perform game.limit_rate(p, 'match_abort', 6, interval '10 minutes');
  select * into mt from game.matches where id = match for update;
  if mt.id is null or p not in (mt.p1, mt.p2) then perform game.fail('unknown_match'); end if;
  if mt.status = 'void' then return jsonb_build_object('status', 'void'); end if;
  if mt.status <> 'open' or mt.report1 is not null or mt.report2 is not null then perform game.fail('too_late'); end if;
  -- selbst angepfiffen (gemeldet) oder zu lange her (falls beide Meldungen fehlen): zu spät
  if (case when p = mt.p1 then mt.p1_started_at else mt.p2_started_at end) is not null
     or mt.created_at < now() - interval '60 seconds' then perform game.fail('too_late'); end if;
  update game.matches set status = 'void', settled_at = now() where id = match;
  delete from game.match_queue where match_id = match;
  delete from game.mm_avoid where until < now();
  insert into game.mm_avoid (a, b, until) values (least(mt.p1, mt.p2), greatest(mt.p1, mt.p2), now() + interval '15 minutes')
  on conflict (a, b) do update set until = excluded.until;
  return jsonb_build_object('status', 'void');
end $$;
