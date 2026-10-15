-- Admin access is explicit UUID membership; client-editable profile metadata has no authority.
begin;
create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_roles enable row level security;
revoke all on public.admin_roles from public, anon, authenticated;
grant select, insert, delete on public.admin_roles to service_role;

alter table public.players
  add column suspended_at timestamptz,
  add column suspension_reason text,
  add constraint consistent_suspension check (
    (suspended_at is null and suspension_reason is null)
    or (suspended_at is not null and suspension_reason is not null and char_length(suspension_reason) between 1 and 500)
  );
-- Existing name/username/image_path column grants remain narrow.
grant select on public.players to service_role;
create policy "Server reads account status" on public.players for select to service_role using (true);

create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('suspend', 'unsuspend')),
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);
create index admin_audit_player_recent on public.admin_audit(player_id, created_at desc, id);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;
-- No user-facing audit mutation API; the trusted service can clean up its test fixtures.
grant select, delete on public.admin_audit to service_role;

create function public.is_game_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles where user_id = (select auth.uid()));
$$;
revoke all on function public.is_game_admin() from public, anon, authenticated;
grant execute on function public.is_game_admin() to authenticated;

alter table public.match_participants add column telemetry jsonb;
-- Retain the established atomic Elo algorithm instead of duplicating it.
alter function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) set schema private;
alter function private.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) rename to record_match_base;
revoke all on function private.record_match_base(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) from public, anon, authenticated, service_role;

create function public.record_match(
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
        or telemetry - 'moves' - 'charged' - 'sent' - 'received' <> '{}'::jsonb then
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
revoke all on function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) to service_role;

create function private.admin_player_json(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'username', p.username, 'email', u.email, 'createdAt', p.created_at,
    'suspendedAt', p.suspended_at, 'suspensionReason', p.suspension_reason,
    'rating', coalesce(r.rating, 1200), 'gamesPlayed', coalesce(r.games_played, 0),
    'wins', coalesce(r.wins, 0), 'losses', coalesce(r.losses, 0), 'draws', coalesce(r.draws, 0),
    'isAdmin', exists(select 1 from public.admin_roles a where a.user_id = p.id)
  ) from public.players p join auth.users u on u.id = p.id
    left join public.player_ratings r on r.player_id = p.id where p.id = p_user_id;
$$;
revoke all on function private.admin_player_json(uuid) from public, anon, authenticated, service_role;

create function public.admin_players(p_query text default '', p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare response jsonb;
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_query is null or char_length(p_query) > 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid player search' using errcode = '22023';
  end if;
  with filtered as materialized (
    select p.id, p.created_at from public.players p join auth.users u on u.id = p.id
    where strpos(lower(p.name), lower(trim(p_query))) > 0
      or strpos(lower(coalesce(p.username, '')), lower(trim(p_query))) > 0
      or strpos(lower(coalesce(u.email, '')), lower(trim(p_query))) > 0
      or strpos(p.id::text, lower(trim(p_query))) > 0
  ), page as (
    select * from filtered order by created_at desc, id limit 50 offset p_offset
  ) select jsonb_build_object('total', (select count(*) from filtered),
    'players', coalesce((select jsonb_agg(private.admin_player_json(id) order by created_at desc, id) from page), '[]'::jsonb)) into response;
  return response;
end;
$$;
revoke all on function public.admin_players(text, integer) from public, anon, authenticated;
grant execute on function public.admin_players(text, integer) to authenticated;

create function public.admin_player(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare player jsonb; matches jsonb; audit jsonb;
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  player := private.admin_player_json(p_user_id);
  if player is null then raise exception 'Player not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'endedAt', m.ended_at, 'mode', m.mode, 'reason', m.reason,
    'durationSeconds', extract(epoch from m.ended_at - m.started_at),
    'score', m.score, 'maxTile', m.max_tile, 'result', m.result,
    'ratingBefore', m.rating_before, 'ratingAfter', m.rating_after, 'ratingDelta', m.rating_delta,
    'telemetry', m.telemetry
  ) order by m.ended_at desc, m.id), '[]'::jsonb) into matches from (
    select m.*, p.score, p.max_tile, p.result, p.rating_before, p.rating_after, p.rating_delta, p.telemetry
    from public.match_participants p join public.matches m on m.id = p.match_id where p.player_id = p_user_id
    order by m.ended_at desc, m.id limit 20
  ) m;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'createdAt', a.created_at, 'actorId', a.actor_id, 'action', a.action, 'reason', a.reason)
    order by a.created_at desc, a.id), '[]'::jsonb) into audit from (
    select * from public.admin_audit where player_id = p_user_id order by created_at desc, id limit 20
  ) a;
  return jsonb_build_object('player', player, 'matches', matches, 'audit', audit);
end;
$$;
revoke all on function public.admin_player(uuid) from public, anon, authenticated;
grant execute on function public.admin_player(uuid) to authenticated;

create function public.admin_set_suspension(p_user_id uuid, p_suspended boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare was_suspended boolean;
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_suspended is null or p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid suspension request' using errcode = '22023';
  end if;
  select suspended_at is not null into was_suspended from public.players where id = p_user_id for update;
  if not found then raise exception 'Player not found' using errcode = 'P0002'; end if;
  if p_user_id = (select auth.uid()) or exists(select 1 from public.admin_roles where user_id = p_user_id) then
    raise exception 'Administrators cannot be suspended' using errcode = '42501';
  end if;
  if was_suspended = p_suspended then return; end if;
  update public.players set suspended_at = case when p_suspended then now() else null end,
    suspension_reason = case when p_suspended then trim(p_reason) else null end where id = p_user_id;
  insert into public.admin_audit(player_id, actor_id, action, reason)
    values(p_user_id, (select auth.uid()), case when p_suspended then 'suspend' else 'unsuspend' end, trim(p_reason));
end;
$$;
revoke all on function public.admin_set_suspension(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_suspension(uuid, boolean, text) to authenticated;

create function public.admin_overview(p_days integer default 30, p_mode text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare response jsonb;
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 90 or p_mode is null or p_mode not in ('all', 'casual', 'ranked', 'friend') then
    raise exception 'Invalid overview filter' using errcode = '22023';
  end if;
  with games as materialized (
    select * from public.matches where ended_at >= now() - make_interval(days => p_days) and ended_at <= now()
      and (p_mode = 'all' or mode = p_mode)
  ), participants as materialized (
    select p.* from public.match_participants p join games g on g.id = p.match_id
  ), tier_counts as (
    select case when rating < 1000 then 'Bronze' when rating < 1200 then 'Silver' when rating < 1400 then 'Gold'
      when rating < 1600 then 'Platinum' when rating < 1800 then 'Diamond' else 'Master' end as tier, count(*) as players
    from public.player_ratings group by 1
  ) select jsonb_build_object(
    'periodDays', p_days,
    'totals', jsonb_build_object(
      'matches', (select count(*) from games), 'rankedMatches', (select count(*) from games where mode = 'ranked'),
      'players', (select count(distinct player_id) from participants),
      'avgDurationSeconds', (select avg(extract(epoch from ended_at - started_at)) from games),
      'avgScore', (select avg(score) from participants),
      'telemetryParticipants', (select count(*) from participants where telemetry is not null),
      'unmeasuredParticipants', (select count(*) from participants where telemetry is null),
      'avgMoves', (select avg((telemetry ->> 'moves')::numeric) from participants where telemetry is not null)
    ),
    'modes', (select coalesce(jsonb_agg(to_jsonb(c) order by mode), '[]'::jsonb) from (select mode, count(*) as matches from games group by mode) c),
    'reasons', (select coalesce(jsonb_agg(to_jsonb(c) order by reason), '[]'::jsonb) from (select reason, count(*) as matches from games group by reason) c),
    'daily', (select coalesce(jsonb_agg(to_jsonb(c) order by date), '[]'::jsonb) from (select (ended_at at time zone 'Asia/Seoul')::date as date, count(*) as matches from games group by 1) c),
    'tiers', (select coalesce(jsonb_agg(to_jsonb(c) order by array_position(array['Bronze','Silver','Gold','Platinum','Diamond','Master'], tier)), '[]'::jsonb) from tier_counts c),
    'attacks', (select jsonb_agg(jsonb_build_object(
      'type', b.kind,
      'charged', coalesce((select sum((telemetry -> 'charged' ->> b.kind)::bigint) from participants), 0),
      'sent', coalesce((select sum((telemetry -> 'sent' ->> b.kind)::bigint) from participants), 0),
      'received', coalesce((select sum((telemetry -> 'received' ->> b.kind)::bigint) from participants), 0),
      'participantsWhoSent', (select count(*) from participants where (telemetry -> 'sent' ->> b.kind)::bigint > 0),
      'winsWhenSent', (select count(*) from participants where (telemetry -> 'sent' ->> b.kind)::bigint > 0 and result = 'win')
    ) order by b.ordinal) from (values ('xblock',1), ('hardblock',2)) as b(kind,ordinal))
  ) into response;
  return response;
end;
$$;
revoke all on function public.admin_overview(integer, text) from public, anon, authenticated;
grant execute on function public.admin_overview(integer, text) to authenticated;
commit;
