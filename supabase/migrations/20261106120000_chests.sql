-- =====================================================================================
-- Kisten (docs/PROGRESSION.md): vergeben (Level-Up, später Aufgaben usw.), öffnen (Server würfelt),
-- Garantien, Splitter, Herstellen. Tabellen der Chancen kommen aus js/content/cosmetics.js über catalog.sql.
-- Gleiche Regeln wie js/core/chests.js (ohne Server würfelt das Spiel damit lokal).
-- Tabellen: 20261105120100_tables.sql; Vergeben und Zustand: 20261105120200_core.sql.
-- =====================================================================================

-- ---------- Würfeln und gutschreiben (nur über api.open_chest) ----------
create or replace function game.roll_chest(p uuid, ch game.chests) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d game.chest_defs; pr game.progress; pity jsonb; pe integer; pl integer; ph integer; plh integer;
  coins integer; cos_rar text; head_rar text; head_new boolean := false; x double precision; acc double precision := 0;
  k text; v double precision; it text; items jsonb := '[]'; sh integer := 0; dup jsonb; best integer := -1;
  cfg_p jsonb := game.cfg('chest_pity'); cfg_s jsonb := game.cfg('chest_shards'); cfg_x jsonb := game.cfg('head_dup_xp');
  hl integer; rank jsonb := '{"selten":1,"episch":2,"legend":3}';
begin
  select * into d from game.chest_defs where tier = ch.tier;
  select * into pr from game.progress where player_id = p for update;
  pity := coalesce(pr.pity, '{}');
  pe := coalesce((pity->>'epic')::integer, 0) + 1; pl := coalesce((pity->>'legend')::integer, 0) + 1;
  ph := coalesce((pity->>'head')::integer, 0) + 1; plh := coalesce((pity->>'legendHead')::integer, 0) + 1;
  coins := d.coins_min + floor(random() * (d.coins_max - d.coins_min + 1))::integer;

  -- Kosmetik
  if random() < d.cos_p then cos_rar := game.roll_rar(d.cos_rar); end if;
  if pl >= (cfg_p->>'legend')::integer then cos_rar := 'legend';
  elsif pe >= (cfg_p->>'epic')::integer and coalesce((rank->>cos_rar)::integer, 0) < 2 then cos_rar := 'episch'; end if;

  -- Kopf
  x := random();
  for k, v in select key, value::double precision from jsonb_each_text(d.head) order by case key when 'selten' then 1 when 'episch' then 2 else 3 end loop
    acc := acc + v;
    if x < acc then head_rar := k; exit; end if;
  end loop;
  if d.sure and head_rar is null then head_rar := game.roll_rar(d.head); end if;
  if ch.sure_head is not null and exists (select 1 from game.items i where i.kind = 'head' and i.rarity = ch.sure_head and i.active
                                           and not exists (select 1 from game.inventory v where v.player_id = p and v.item_id = i.id)) then
    head_rar := ch.sure_head; head_new := true;
  elsif plh >= (cfg_p->>'legendHead')::integer and exists (select 1 from game.items i where i.kind = 'head' and i.rarity = 'legend' and i.active
                                           and not exists (select 1 from game.inventory v where v.player_id = p and v.item_id = i.id)) then
    head_rar := 'legend'; head_new := true;
  elsif ph >= (cfg_p->>'head')::integer then
    select i.rarity into k from game.items i where i.kind = 'head' and i.rarity <> 'basis' and i.active
       and not exists (select 1 from game.inventory v where v.player_id = p and v.item_id = i.id)
     order by case i.rarity when 'selten' then 1 when 'episch' then 2 else 3 end limit 1;
    if k is not null then head_rar := k; head_new := true; end if;
  end if;

  if cos_rar is not null then
    select id into it from game.items where kind in ('hat', 'shoes', 'goalfx', 'emote', 'emoji') and rarity = cos_rar and active order by random() limit 1;
    if it is not null then
      if game.give_item(p, it, 'chest') then items := items || jsonb_build_object('id', it, 'rarity', cos_rar, 'dup', false);
      else
        sh := sh + (cfg_s->'dup'->>cos_rar)::integer;
        items := items || jsonb_build_object('id', it, 'rarity', cos_rar, 'dup', true, 'shards', (cfg_s->'dup'->>cos_rar)::integer);
      end if;
      best := greatest(best, (rank->>cos_rar)::integer);
    end if;
  end if;
  if head_rar is not null then
    select i.id into it from game.items i where i.kind = 'head' and i.rarity = head_rar and i.active
       and (not head_new or not exists (select 1 from game.inventory v where v.player_id = p and v.item_id = i.id))
     order by random() limit 1;
    if it is not null then
      if game.give_item(p, it, 'chest') then
        items := items || jsonb_build_object('id', it, 'rarity', head_rar, 'dup', false);
        ph := 0; if head_rar = 'legend' then plh := 0; end if;
      else
        select level into hl from game.heads where player_id = p and head_id = it;
        if coalesce(hl, 1) >= game.cfg_int('head_max_level') then
          sh := sh + (cfg_s->'dup'->>head_rar)::integer;
          items := items || jsonb_build_object('id', it, 'rarity', head_rar, 'dup', true, 'shards', (cfg_s->'dup'->>head_rar)::integer);
        else
          update game.heads set xp = xp + (cfg_x->>head_rar)::integer where player_id = p and head_id = it;
          items := items || jsonb_build_object('id', it, 'rarity', head_rar, 'dup', true, 'headXp', (cfg_x->>head_rar)::integer);
        end if;
      end if;
      best := greatest(best, (rank->>head_rar)::integer);
    end if;
  end if;
  if best >= 2 then pe := 0; end if;
  if best >= 3 then pl := 0; end if;

  if coins > 0 then perform game.book(p, 'coins', coins, 'chest', ch.id::text); end if;
  if d.gems > 0 then perform game.book(p, 'gems', d.gems, 'chest', ch.id::text); end if;
  if sh > 0 then update game.wallets w set shards = w.shards + sh where w.player_id = p; end if;
  update game.progress set pity = jsonb_build_object('epic', pe, 'legend', pl, 'head', ph, 'legendHead', plh) where player_id = p;
  return jsonb_build_object('tier', ch.tier, 'coins', coins, 'gems', d.gems, 'shards', sh, 'items', items);
end $$;

-- ---------- Kiste öffnen (zweimal öffnen = gleiches Ergebnis) ----------
create or replace function api.open_chest(chest uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); ch game.chests; res jsonb;
begin
  perform game.limit_rate(p, 'open_chest', 60, interval '1 minute');
  select * into ch from game.chests where id = chest and player_id = p for update;
  if ch.id is null then perform game.fail('unknown_chest'); end if;
  if ch.opened_at is null then
    res := game.roll_chest(p, ch);
    update game.chests set opened_at = now(), result = res where id = ch.id;
  else
    res := ch.result;
  end if;
  return jsonb_build_object('result', res, 'state', game.state_brief(p));
end $$;

-- ---------- Kosmetik mit Splittern herstellen ----------
create or replace function api.craft_item(item text, request_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); prev jsonb; it game.items; cost integer; res jsonb;
begin
  prev := game.idem_begin(p, request_key); if prev is not null then return prev; end if;
  perform game.limit_rate(p, 'craft', 20, interval '1 minute');
  select * into it from game.items where id = item and active;
  if it.id is null or it.kind not in ('hat', 'shoes', 'goalfx', 'emote', 'emoji') then perform game.fail('not_craftable'); end if;
  if exists (select 1 from game.inventory where player_id = p and item_id = item) then perform game.fail('already_owned'); end if;
  cost := (game.cfg('chest_shards')->'craft'->>it.rarity)::integer;
  update game.wallets set shards = shards - cost where player_id = p and shards >= cost;
  if not found then perform game.fail('insufficient_funds', 'shards'); end if;
  perform game.give_item(p, item, 'craft');
  res := jsonb_build_object('item', item, 'shards', cost, 'state', game.state_brief(p));
  return game.idem_end(p, request_key, res);
end $$;

revoke execute on all functions in schema api, game from public;
grant execute on function api.open_chest(uuid), api.craft_item(text, text) to authenticated;
