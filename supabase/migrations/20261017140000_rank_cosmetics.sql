begin;

-- Extend existing checks so separately shipped achievement and solo items remain valid.
do $$
declare item record; expression text;
begin
  for item in select * from (values
    ('achievement_unlocks','achievement_unlocks_achievement_id_check','achievement_id'),
    ('player_preferences','player_preferences_skin_id_check','skin_id'),
    ('player_preferences','player_preferences_icon_id_check','icon_id')
  ) constraints(table_name,constraint_name,column_name) loop
    select pg_get_expr(conbin,conrelid) into strict expression from pg_constraint
      where conrelid=format('public.%I',item.table_name)::regclass and conname=item.constraint_name and contype='c';
    execute format('alter table public.%I drop constraint %I, add constraint %I check ((%s) or %I in (''rank-bronze'',''rank-silver'',''rank-gold'',''rank-platinum'',''rank-diamond'',''rank-master''))',
      item.table_name,item.constraint_name,item.constraint_name,expression,item.column_name);
  end loop;
end;
$$;

create function private.highest_rank(p_player uuid) returns integer
language sql security definer set search_path='' as $$
  select coalesce(max(array_position(array['Bronze','Silver','Gold','Platinum','Diamond','Master'],private.rank_tier(peak_rating))),0)
    from public.season_ratings where player_id=p_player and placement_games=10 and peak_rating is not null;
$$;
revoke all on function private.highest_rank(uuid) from public,anon,authenticated,service_role;

create function private.award_rank_cosmetics(p_player uuid) returns void
language plpgsql security definer set search_path='' as $$
declare reached integer;
begin
  if not exists(select 1 from auth.users where id=p_player and not coalesce(is_anonymous,false)) then return; end if;
  reached:=private.highest_rank(p_player);
  insert into public.achievement_unlocks(player_id,achievement_id)
    select p_player,reward.id from (values
      ('rank-bronze',1),('rank-silver',2),('rank-gold',3),('rank-platinum',4),('rank-diamond',5),('rank-master',6)
    ) reward(id,tier) where reward.tier<=reached on conflict do nothing;
end;
$$;
revoke all on function private.award_rank_cosmetics(uuid) from public,anon,authenticated,service_role;

create function private.award_season_rank_cosmetics() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.award_rank_cosmetics(new.player_id);
  return new;
end;
$$;
revoke all on function private.award_season_rank_cosmetics() from public,anon,authenticated,service_role;
create trigger award_season_rank_cosmetics after insert or update of peak_rating,placement_games on public.season_ratings
  for each row when (new.placement_games=10 and new.peak_rating is not null)
  execute function private.award_season_rank_cosmetics();

do $$
declare player uuid;
begin
  for player in select distinct player_id from public.season_ratings where placement_games=10 and peak_rating is not null loop
    perform private.award_rank_cosmetics(player);
  end loop;
end;
$$;

create or replace function public.achievement_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare player uuid:=auth.uid(); day date:=(now() at time zone 'Asia/Seoul')::date; attendance public.player_attendance%rowtype;
begin
  if player is null or not exists(select 1 from auth.users where id=player and not coalesce(is_anonymous,false)) then
    raise exception 'Account required' using errcode='42501';
  end if;
  select * into attendance from public.player_attendance where player_id=player;
  return private.achievement_progress(player) || jsonb_build_object(
    'highestRank',private.highest_rank(player),
    'attendance',jsonb_build_object('streak',case when attendance.last_day>=day-1 then attendance.streak else 0 end,
      'bestStreak',coalesce(attendance.best_streak,0),'lastDay',attendance.last_day,'today',day,
      'checkedInToday',coalesce(attendance.last_day=day,false),'nextCheckInAt',(day+1)::timestamp at time zone 'Asia/Seoul'),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('achievementId',achievement_id,'unlockedAt',unlocked_at) order by achievement_id)
      from public.achievement_unlocks where player_id=player),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.achievement_state() from public,anon,authenticated,service_role;
grant execute on function public.achievement_state() to authenticated;

create function private.require_rank_cosmetic_equipment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- BEFORE INSERT precedes RLS WITH CHECK; ownership checks must not expose another account.
  if current_setting('role',true)='authenticated' and new.player_id is distinct from auth.uid() then
    raise exception 'row-level security violation' using errcode='42501';
  end if;
  if exists(select 1 from unnest(array[new.skin_id,new.icon_id]) item(id)
    where item.id in ('rank-bronze','rank-silver','rank-gold','rank-platinum','rank-diamond','rank-master') and
      not exists(select 1 from public.achievement_unlocks where player_id=new.player_id and achievement_id=item.id)) then
    raise exception 'Achievement required' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.require_rank_cosmetic_equipment() from public,anon,authenticated,service_role;
create trigger require_rank_cosmetic_equipment before insert or update of skin_id,icon_id on public.player_preferences
  for each row execute function private.require_rank_cosmetic_equipment();

commit;
