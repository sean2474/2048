begin;

-- Telemetry may now name the special ability a player entered with and how often it fired.
-- Older records without these keys stay valid and are reported as unmeasured for abilities.
create or replace function private.record_match_with_telemetry(
  p_id uuid, p_started_at timestamptz, p_ended_at timestamptz,
  p_reason text, p_winner_slot smallint, p_participants jsonb, p_mode text default 'casual'
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  participant jsonb;
  telemetry jsonb;
  counter jsonb;
  section text;
  block_type text;
  slot_index smallint := 0;
begin
  if jsonb_typeof(p_participants) is distinct from 'array' or jsonb_array_length(p_participants) <> 2 then
    raise exception 'Exactly two participants required';
  end if;
  for participant in select value from jsonb_array_elements(p_participants) loop
    telemetry := nullif(participant -> 'telemetry', 'null'::jsonb);
    if telemetry is not null then
      if jsonb_typeof(telemetry) is distinct from 'object'
        or telemetry - 'moves' - 'charged' - 'sent' - 'received' - 'ability' - 'abilityUses' <> '{}'::jsonb then
        raise exception 'Invalid match telemetry' using errcode = '22023';
      end if;
      counter := telemetry -> 'moves';
      if jsonb_typeof(counter) is distinct from 'number' then raise exception 'Invalid match telemetry' using errcode = '22023'; end if;
      if counter::numeric < 0 or counter::numeric > 1000000000 or counter::numeric <> trunc(counter::numeric) then raise exception 'Invalid match telemetry' using errcode = '22023'; end if;
      foreach section in array array['charged', 'sent', 'received'] loop
        if jsonb_typeof(telemetry -> section) is distinct from 'object'
          or (telemetry -> section) - 'xblock' - 'hardblock' <> '{}'::jsonb then
          raise exception 'Invalid match telemetry' using errcode = '22023';
        end if;
        foreach block_type in array array['xblock', 'hardblock'] loop
          counter := telemetry -> section -> block_type;
          if jsonb_typeof(counter) is distinct from 'number' then raise exception 'Invalid match telemetry' using errcode = '22023'; end if;
          if counter::numeric < 0 or counter::numeric > 1000000000 or counter::numeric <> trunc(counter::numeric) then raise exception 'Invalid match telemetry' using errcode = '22023'; end if;
        end loop;
      end loop;
      if telemetry ? 'ability' and (jsonb_typeof(telemetry -> 'ability') is distinct from 'string' or (telemetry ->> 'ability') !~ '^[a-z0-9-]{1,32}$') then
        raise exception 'Invalid match telemetry' using errcode = '22023';
      end if;
      if telemetry ? 'abilityUses' then
        counter := telemetry -> 'abilityUses';
        if jsonb_typeof(counter) is distinct from 'number' then raise exception 'Invalid match telemetry' using errcode = '22023'; end if;
        if counter::numeric < 0 or counter::numeric > 1000000000 or counter::numeric <> trunc(counter::numeric) then raise exception 'Invalid match telemetry' using errcode = '22023'; end if;
      end if;
    end if;
  end loop;
  if not private.record_match_base(p_id, p_started_at, p_ended_at, p_reason, p_winner_slot, p_participants, p_mode) then return false; end if;
  for participant in select value from jsonb_array_elements(p_participants) loop
    slot_index := slot_index + 1;
    update public.match_participants set telemetry = nullif(participant -> 'telemetry', 'null'::jsonb)
      where match_id = p_id and slot = slot_index;
  end loop;
  return true;
end;
$$;
revoke all on function private.record_match_with_telemetry(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) from public, anon, authenticated, service_role;

-- Measured results grouped by the ability the player entered with. Same period and mode filter as the overview.
create function private.admin_ability_stats(p_days integer, p_mode text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('ability', c.ability, 'participants', c.participants, 'wins', c.wins, 'uses', c.uses) order by c.ability), '[]'::jsonb)
  from (
    select p.telemetry ->> 'ability' as ability, count(*) as participants,
      count(*) filter (where p.result = 'win') as wins,
      coalesce(sum((p.telemetry ->> 'abilityUses')::bigint), 0) as uses
    from public.match_participants p join public.matches g on g.id = p.match_id
    where g.ended_at >= now() - make_interval(days => p_days) and g.ended_at <= now()
      and (p_mode = 'all' or g.mode = p_mode) and p.telemetry ? 'ability'
    group by 1
  ) c;
$$;
revoke all on function private.admin_ability_stats(integer, text) from public, anon, authenticated, service_role;

create or replace function public.admin_overview(p_days integer default 30, p_mode text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; days jsonb; tiers jsonb;
begin
 result := private.admin_overview_base(p_days, p_mode);
 select jsonb_agg(jsonb_build_object('date', d::date, 'matches', coalesce((select (v ->> 'matches')::bigint from jsonb_array_elements(result -> 'daily') v where v ->> 'date' = d::date::text), 0)) order by d) into days
 from generate_series((now() - make_interval(days => p_days)) at time zone 'Asia/Seoul', now() at time zone 'Asia/Seoul', interval '1 day') d;
 if exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ratings' and column_name = 'tier') then
   select coalesce(jsonb_agg(to_jsonb(c) order by c.tier), '[]'::jsonb) into tiers from (
     select coalesce(to_jsonb(r) ->> 'tier', 'Placement') as tier, count(*) as players from public.player_ratings r group by 1
   ) c;
   result := result || jsonb_build_object('tiers', tiers);
 end if;
 return result || jsonb_build_object('periodStart', now() - make_interval(days => p_days), 'periodEnd', now(), 'daily', days,
   'abilities', private.admin_ability_stats(p_days, p_mode));
end; $$;

commit;
