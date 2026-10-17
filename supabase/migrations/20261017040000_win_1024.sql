begin;

-- Legacy results and pending outbox entries retain their original reason and tile.
alter table public.matches drop constraint matches_reason_check,
  add constraint matches_reason_check check (reason in ('reached_1024','reached_2048','opponent_locked','surrender','opponent_disconnected','draw'));

create or replace function public.admin_matches(
 p_from date default (now() at time zone 'Asia/Seoul')::date-6, p_to date default (now() at time zone 'Asia/Seoul')::date,
 p_mode text default 'all',p_reason text default 'all',p_player_id uuid default null,p_match_id uuid default null,
 p_before_time timestamptz default null,p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>89 or p_mode is null or p_mode not in ('all','casual','ranked','friend','legacy')
 or p_reason is null or p_reason not in ('all','reached_1024','reached_2048','opponent_locked','surrender','opponent_disconnected','draw')
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

create or replace function private.award_match_achievements(p_player uuid) returns void
language plpgsql security definer set search_path='' as $$
declare progress jsonb;
begin
  progress:=private.achievement_progress(p_player);
  insert into public.achievement_unlocks(player_id,achievement_id)
    select p_player, milestone.id from (values
      ('wins-10',(progress->>'wins')::integer>=10),
      ('tile-2048-reward',(progress->>'highestTile')::integer>=1024)
    ) milestone(id,earned) where milestone.earned on conflict do nothing;
end;
$$;
revoke all on function private.award_match_achievements(uuid) from public,anon,authenticated,service_role;

-- Keep the reward ID and original unlock dates for already earned equipment.
insert into public.achievement_unlocks(player_id,achievement_id)
select distinct p.player_id,'tile-2048-reward'
from public.match_participants p join public.matches m on m.id=p.match_id
where m.achievement_eligible and p.player_id is not null and p.max_tile>=1024
on conflict do nothing;

commit;
