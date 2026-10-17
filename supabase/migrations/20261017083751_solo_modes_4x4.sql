begin;
-- Keep the original 5×5 records; only 4×4 runs enter the current leaderboard.
alter table public.solo_records add column board_size smallint not null default 5 check (board_size in (4,5));
alter table public.solo_records drop constraint solo_records_pkey,
  add primary key(player_id,board_size);

alter table public.achievement_unlocks drop constraint achievement_unlocks_achievement_id_check;
-- Existing owners keep Golden Flash and the original unlock timestamp.
update public.achievement_unlocks set achievement_id='solo-6min' where achievement_id='solo-5min';
alter table public.achievement_unlocks add constraint achievement_unlocks_achievement_id_check check (achievement_id in (
  'checkin-7','checkin-30','wins-10','tile-2048-reward','solo-first','solo-10min','solo-6min','solo-4min','solo-2min',
  'endless-2048','endless-4096','endless-8192'
));

create table public.solo_endless_records (
  player_id uuid primary key references public.players(id) on delete cascade,
  run_id uuid not null unique,
  max_tile integer not null check (max_tile in (2048,4096,8192)),
  achieved_at timestamptz not null default now()
);
alter table public.solo_endless_records enable row level security;
revoke all on public.solo_endless_records from public,anon,authenticated,service_role;
grant select on public.solo_endless_records to authenticated;
create policy "Read own endless milestone" on public.solo_endless_records for select to authenticated using ((select auth.uid())=player_id);

create function public.record_solo_endless(p_run uuid,p_player uuid,p_tile integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_run is null or p_player is null or p_tile is null or p_tile not in (2048,4096,8192) then
    raise exception 'Invalid endless milestone' using errcode='22023';
  end if;
  perform p.id from public.players p join auth.users u on u.id=p.id
    where p.id=p_player and p.suspended_at is null and not coalesce(u.is_anonymous,false) for update of p;
  if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
  insert into public.solo_endless_records(player_id,run_id,max_tile) values(p_player,p_run,p_tile)
    on conflict(player_id) do update set run_id=excluded.run_id,max_tile=excluded.max_tile,achieved_at=now()
    where excluded.max_tile>public.solo_endless_records.max_tile;
  insert into public.achievement_unlocks(player_id,achievement_id)
    select p_player,reward.id from (values ('endless-2048',p_tile>=2048),('endless-4096',p_tile>=4096),('endless-8192',p_tile>=8192)) reward(id,earned)
    where reward.earned on conflict do nothing;
end;
$$;
revoke all on function public.record_solo_endless(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.record_solo_endless(uuid,uuid,integer) to service_role;

create or replace function public.record_solo(p_run uuid, p_player uuid, p_elapsed integer, p_moves integer, p_score integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_run is null or p_player is null or p_elapsed is null or p_elapsed <= 0 or p_elapsed >= 3600000
    or p_moves is null or p_moves <= 0 or p_moves > 100000 or p_score is null or p_score <= 0 then
    raise exception 'Invalid solo record' using errcode='22023';
  end if;
  perform p.id from public.players p join auth.users u on u.id=p.id
    where p.id=p_player and p.suspended_at is null and not coalesce(u.is_anonymous,false) for update of p;
  if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
  insert into public.solo_records(player_id,board_size,run_id,elapsed_ms,moves,score)
    values(p_player,4,p_run,p_elapsed,p_moves,p_score)
    on conflict(player_id,board_size) do update set run_id=excluded.run_id,elapsed_ms=excluded.elapsed_ms,moves=excluded.moves,score=excluded.score,achieved_at=now()
    where (excluded.elapsed_ms,excluded.moves) < (public.solo_records.elapsed_ms,public.solo_records.moves);
  insert into public.achievement_unlocks(player_id,achievement_id)
    select p_player,reward.id from (values ('solo-first',true),('solo-10min',p_elapsed<=600000),('solo-6min',p_elapsed<=360000),('solo-4min',p_elapsed<=240000),('solo-2min',p_elapsed<=120000)) reward(id,earned)
    where reward.earned on conflict do nothing;
end;
$$;
revoke all on function public.record_solo(uuid,uuid,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.record_solo(uuid,uuid,integer,integer,integer) to service_role;

create or replace function public.solo_leaderboard() returns table(player_id uuid,name text,elapsed_ms integer,moves integer)
language sql stable security definer set search_path='' as $$
  select r.player_id,p.name::text,r.elapsed_ms,r.moves from public.solo_records r
  join public.players p on p.id=r.player_id where p.suspended_at is null and r.board_size=4
  order by r.elapsed_ms,r.moves,r.achieved_at,r.player_id limit 50;
$$;
revoke all on function public.solo_leaderboard() from public,anon,authenticated,service_role;
grant execute on function public.solo_leaderboard() to anon,authenticated;

create or replace function private.achievement_progress(p_player uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'wins', (select count(*) from (
      select 1 from public.match_participants p join public.matches m on m.id=p.match_id
      where p.player_id=p_player and p.result='win' and m.achievement_eligible limit 10
    ) wins),
    'highestTile', coalesce((select p.max_tile from public.match_participants p join public.matches m on m.id=p.match_id
      where p.player_id=p_player and m.achievement_eligible order by p.max_tile desc limit 1),0),
    'soloBestMs', (select elapsed_ms from public.solo_records where player_id=p_player and board_size=4),
    'soloHighestTile', coalesce((select max_tile from public.solo_endless_records where player_id=p_player),0)
  );
$$;

alter table public.player_preferences drop constraint player_preferences_skin_id_check,
  add constraint player_preferences_skin_id_check check (skin_id in (
    'classic','slate','paper','confetti','gingham','meadow','tide','kitty','bunny','charcoal','espresso','pinstripe','weave',
    'runes','aurora','obsidian','astral','sentinel','runeknight','arcanist','dawn-oath','rune-sanctum','copper-sprint','silver-current','golden-flash','storm-fox','chrono-dragon','jade-path','twilight-orbit','star-phoenix'
  ));
create or replace function private.require_achievement_equipment() returns trigger
language plpgsql security definer set search_path='' as $$
declare required text;
begin
  if current_setting('role',true)='authenticated' and new.player_id is distinct from auth.uid() then
    raise exception 'row-level security violation' using errcode='42501';
  end if;
  for required in select reward.id from (values
    ('checkin-7',new.skin_id='dawn-oath'),('checkin-30',new.icon_id='attendance-king'),
    ('wins-10',new.icon_id='victory-vanguard'),('tile-2048-reward',new.skin_id='rune-sanctum'),
    ('solo-first',new.skin_id='copper-sprint'),('solo-10min',new.skin_id='silver-current'),('solo-6min',new.skin_id='golden-flash'),('solo-4min',new.skin_id='storm-fox'),('solo-2min',new.skin_id='chrono-dragon'),
    ('endless-2048',new.skin_id='jade-path'),('endless-4096',new.skin_id='twilight-orbit'),('endless-8192',new.skin_id='star-phoenix')
  ) reward(id,equipped) where reward.equipped loop
    if not exists(select 1 from public.achievement_unlocks where player_id=new.player_id and achievement_id=required) then
      raise exception 'Achievement required: %',required using errcode='42501';
    end if;
  end loop;
  return new;
end;
$$;

create function public.my_solo_rank() returns table(rank_position bigint,elapsed_ms integer,moves integer)
language sql stable security definer set search_path='' as $$
  select ranked.rank_position,ranked.elapsed_ms,ranked.moves from (
    select r.player_id,r.elapsed_ms,r.moves,row_number() over(order by r.elapsed_ms,r.moves,r.achieved_at,r.player_id) as rank_position
    from public.solo_records r join public.players p on p.id=r.player_id
    where r.board_size=4 and p.suspended_at is null
  ) ranked where ranked.player_id=(select auth.uid());
$$;
revoke all on function public.my_solo_rank() from public,anon,authenticated,service_role;
grant execute on function public.my_solo_rank() to authenticated;

create function public.my_season_rank(p_season uuid) returns table(rank_position bigint,rating integer,games_played integer)
language sql stable set search_path='' as $$
  select ranked.rank_position,ranked.rating,ranked.games_played from (
    select r.player_id,r.rating,r.games_played,row_number() over(order by r.rating desc,r.games_played desc,r.player_id) as rank_position
    from (
      select r.player_id,r.rating,r.games_played from public.player_ratings r join public.rank_seasons s on s.id=r.season_id
      where s.id=p_season and s.ends_at is null
      union all
      select r.player_id,r.rating,r.games_played from public.season_ratings r join public.rank_seasons s on s.id=r.season_id
      where s.id=p_season and s.ends_at is not null
    ) r where r.games_played>=10
  ) ranked where ranked.player_id=(select auth.uid());
$$;
revoke all on function public.my_season_rank(uuid) from public,anon,authenticated,service_role;
grant execute on function public.my_season_rank(uuid) to authenticated;

commit;
