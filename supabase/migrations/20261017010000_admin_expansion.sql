-- Read-only investigation tools. Existing history, moderation and Elo writes are unchanged.
begin;
create function private.admin_match_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'startedAt',m.started_at,'endedAt',m.ended_at,'mode',m.mode,'reason',m.reason,
 'durationSeconds',extract(epoch from m.ended_at-m.started_at),'participants',coalesce((select jsonb_agg(jsonb_build_object(
 'slot',p.slot,'playerId',p.player_id,'name',p.display_name,'score',p.score,'maxTile',p.max_tile,'result',p.result,
 'ratingBefore',p.rating_before,'ratingAfter',p.rating_after,'ratingDelta',p.rating_delta,'telemetry',p.telemetry) order by p.slot)
 from public.match_participants p where p.match_id=m.id),'[]'::jsonb)) from public.matches m where m.id=p_id;
$$;
revoke all on function private.admin_match_json(uuid) from public,anon,authenticated,service_role;
create function public.admin_match(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_id is null then raise exception 'Invalid match ID' using errcode='22023'; end if;
 result:=private.admin_match_json(p_id);
 if result is null then raise exception 'Match not found' using errcode='P0002'; end if;
 return result;
end; $$;
revoke all on function public.admin_match(uuid) from public,anon,authenticated;
grant execute on function public.admin_match(uuid) to authenticated;

create function public.admin_matches(
 p_from date default (now() at time zone 'Asia/Seoul')::date-6, p_to date default (now() at time zone 'Asia/Seoul')::date,
 p_mode text default 'all',p_reason text default 'all',p_player_id uuid default null,p_match_id uuid default null,
 p_before_time timestamptz default null,p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>89 or p_mode is null or p_mode not in ('all','casual','ranked','friend','legacy')
 or p_reason is null or p_reason not in ('all','reached_2048','opponent_locked','surrender','opponent_disconnected','draw')
 or (p_before_time is null)<>(p_before_id is null) then raise exception 'Invalid match filter' using errcode='22023'; end if;
 with candidates as materialized (
 select m.id,m.ended_at from public.matches m where
 ((p_match_id is not null and m.id=p_match_id) or (p_match_id is null and m.ended_at>=p_from::timestamp at time zone 'Asia/Seoul' and m.ended_at<(p_to+1)::timestamp at time zone 'Asia/Seoul'))
 and (p_mode='all' or m.mode=p_mode) and (p_reason='all' or m.reason=p_reason)
 and (p_player_id is null or exists(select 1 from public.match_participants p where p.match_id=m.id and p.player_id=p_player_id))
 and (p_before_time is null or (m.ended_at,m.id)<(p_before_time,p_before_id)) order by m.ended_at desc,m.id desc limit 51
 ), page as (select * from candidates order by ended_at desc,id desc limit 50)
 select jsonb_build_object('matches',coalesce((select jsonb_agg(private.admin_match_json(id) order by ended_at desc,id desc) from page),'[]'::jsonb),
 'hasMore',(select count(*)>50 from candidates),'nextCursor',(select jsonb_build_object('time',ended_at,'id',id) from page order by ended_at,id limit 1)) into result;
 return result;
end; $$;
revoke all on function public.admin_matches(date,date,text,text,uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.admin_matches(date,date,text,text,uuid,uuid,timestamptz,uuid) to authenticated;

create function public.admin_audit_entries(
 p_from date default (now() at time zone 'Asia/Seoul')::date-6,p_to date default (now() at time zone 'Asia/Seoul')::date,
 p_actor_id uuid default null,p_player_id uuid default null,p_action text default 'all',p_before_time timestamptz default null,p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>89 or p_action is null or p_action not in ('all','suspend','unsuspend')
 or (p_before_time is null)<>(p_before_id is null) then raise exception 'Invalid audit filter' using errcode='22023'; end if;
 with candidates as materialized (
 select a.* from public.admin_audit a where a.created_at>=p_from::timestamp at time zone 'Asia/Seoul' and a.created_at<(p_to+1)::timestamp at time zone 'Asia/Seoul'
 and (p_actor_id is null or a.actor_id=p_actor_id) and (p_player_id is null or a.player_id=p_player_id) and (p_action='all' or a.action=p_action)
 and (p_before_time is null or (a.created_at,a.id)<(p_before_time,p_before_id)) order by a.created_at desc,a.id desc limit 51
 ), page as (select * from candidates order by created_at desc,id desc limit 50)
 select jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object(
 'id',a.id,'createdAt',a.created_at,'actorId',a.actor_id,'playerId',a.player_id,'action',a.action,'reason',a.reason,
 'actorExists',exists(select 1 from public.players p where p.id=a.actor_id),'playerExists',exists(select 1 from public.players p where p.id=a.player_id)) order by a.created_at desc,a.id desc) from page a),'[]'::jsonb),
 'hasMore',(select count(*)>50 from candidates),'nextCursor',(select jsonb_build_object('time',created_at,'id',id) from page order by created_at,id limit 1)) into result;
 return result;
end; $$;
revoke all on function public.admin_audit_entries(date,date,uuid,uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.admin_audit_entries(date,date,uuid,uuid,text,timestamptz,uuid) to authenticated;

create function public.admin_players_filtered(p_query text default '',p_offset integer default 0,p_status text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_query is null or char_length(p_query)>100 or p_offset is null or p_offset<0 or p_status is null or p_status not in ('all','active','suspended','admin') then raise exception 'Invalid player search' using errcode='22023'; end if;
 with filtered as materialized (
 select p.id,p.created_at from public.players p join auth.users u on u.id=p.id where
 (strpos(lower(p.name),lower(trim(p_query)))>0 or strpos(lower(coalesce(p.username,'')),lower(trim(p_query)))>0 or strpos(lower(coalesce(u.email,'')),lower(trim(p_query)))>0 or strpos(p.id::text,lower(trim(p_query)))>0)
 and (p_status='all' or (p_status='active' and p.suspended_at is null) or (p_status='suspended' and p.suspended_at is not null) or (p_status='admin' and exists(select 1 from public.admin_roles a where a.user_id=p.id)))
 ), page as (select * from filtered order by created_at desc,id limit 50 offset p_offset)
 select jsonb_build_object('total',(select count(*) from filtered),'players',coalesce((select jsonb_agg(private.admin_player_json(id) order by created_at desc,id) from page),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function public.admin_players_filtered(text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_players_filtered(text,integer,text) to authenticated;

-- Preserve the established aggregates and expose their exact moving interval.
alter function public.admin_overview(integer,text) set schema private;
alter function private.admin_overview(integer,text) rename to admin_overview_base;
revoke all on function private.admin_overview_base(integer,text) from public,anon,authenticated,service_role;
create function public.admin_overview(p_days integer default 30,p_mode text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; days jsonb; tiers jsonb;
begin
 result:=private.admin_overview_base(p_days,p_mode);
 select jsonb_agg(jsonb_build_object('date',d::date,'matches',coalesce((select (v->>'matches')::bigint from jsonb_array_elements(result->'daily')v where v->>'date'=d::date::text),0)) order by d) into days
 from generate_series((now()-make_interval(days=>p_days)) at time zone 'Asia/Seoul',now() at time zone 'Asia/Seoul',interval '1 day')d;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='player_ratings' and column_name='tier') then
   select coalesce(jsonb_agg(to_jsonb(c) order by c.tier),'[]'::jsonb) into tiers from (
     select coalesce(to_jsonb(r)->>'tier','Placement') as tier,count(*) as players from public.player_ratings r group by 1
   ) c;
   result:=result||jsonb_build_object('tiers',tiers);
 end if;
 return result||jsonb_build_object('periodStart',now()-make_interval(days=>p_days),'periodEnd',now(),'daily',days);
end; $$;
revoke all on function public.admin_overview(integer,text) from public,anon,authenticated;
grant execute on function public.admin_overview(integer,text) to authenticated;

-- Read new rank projection fields when the following season migration is present.
create or replace function private.admin_player_json(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'username', p.username, 'email', u.email, 'createdAt', p.created_at,
    'suspendedAt', p.suspended_at, 'suspensionReason', p.suspension_reason,
    'rating', coalesce(r.rating, 1200), 'gamesPlayed', coalesce(r.games_played, 0),
    'wins', coalesce(r.wins, 0), 'losses', coalesce(r.losses, 0), 'draws', coalesce(r.draws, 0),
    'isAdmin', exists(select 1 from public.admin_roles a where a.user_id = p.id)
  ) || jsonb_build_object('tier',to_jsonb(r)->'tier',
    'placementGames',coalesce(to_jsonb(r)->'placement_games','0'::jsonb),'peakRating',to_jsonb(r)->'peak_rating')
  from public.players p join auth.users u on u.id = p.id
    left join public.player_ratings r on r.player_id = p.id where p.id = p_user_id;
$$;
commit;
