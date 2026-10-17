begin;
create table public.solo_records (
  player_id uuid primary key references public.players(id) on delete cascade,
  run_id uuid not null unique,
  elapsed_ms integer not null check (elapsed_ms > 0 and elapsed_ms < 3600000),
  moves integer not null check (moves > 0 and moves <= 100000),
  score integer not null check (score > 0),
  achieved_at timestamptz not null default now()
);
alter table public.solo_records enable row level security;
revoke all on public.solo_records from public, anon, authenticated, service_role;
grant select on public.solo_records to authenticated;
create policy "Read own solo record" on public.solo_records for select to authenticated using ((select auth.uid()) = player_id);
create index solo_records_ranking on public.solo_records(elapsed_ms, moves, achieved_at, player_id);

alter table public.achievement_unlocks drop constraint achievement_unlocks_achievement_id_check,
  add constraint achievement_unlocks_achievement_id_check check (achievement_id in ('checkin-7','checkin-30','wins-10','tile-2048-reward','solo-first','solo-10min','solo-5min'));

create function public.record_solo(p_run uuid, p_player uuid, p_elapsed integer, p_moves integer, p_score integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_run is null or p_player is null or p_elapsed is null or p_elapsed <= 0 or p_elapsed >= 3600000
    or p_moves is null or p_moves <= 0 or p_moves > 100000 or p_score is null or p_score <= 0 then
    raise exception 'Invalid solo record' using errcode='22023';
  end if;
  perform p.id from public.players p join auth.users u on u.id=p.id
    where p.id=p_player and p.suspended_at is null and not coalesce(u.is_anonymous,false) for update of p;
  if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
  insert into public.solo_records(player_id,run_id,elapsed_ms,moves,score)
    values(p_player,p_run,p_elapsed,p_moves,p_score)
    on conflict(player_id) do update set run_id=excluded.run_id,elapsed_ms=excluded.elapsed_ms,moves=excluded.moves,score=excluded.score,achieved_at=now()
    where (excluded.elapsed_ms,excluded.moves) < (public.solo_records.elapsed_ms,public.solo_records.moves);
  insert into public.achievement_unlocks(player_id,achievement_id)
    select p_player,reward.id from (values ('solo-first',true),('solo-10min',p_elapsed<=600000),('solo-5min',p_elapsed<=300000)) reward(id,earned)
    where reward.earned on conflict do nothing;
end;
$$;
revoke all on function public.record_solo(uuid,uuid,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.record_solo(uuid,uuid,integer,integer,integer) to service_role;

create function public.solo_leaderboard() returns table(player_id uuid,name text,elapsed_ms integer,moves integer)
language sql stable security definer set search_path='' as $$
  select r.player_id,p.name::text,r.elapsed_ms,r.moves from public.solo_records r
  join public.players p on p.id=r.player_id where p.suspended_at is null
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
    'soloBestMs', (select elapsed_ms from public.solo_records where player_id=p_player)
  );
$$;

alter table public.player_preferences drop constraint player_preferences_skin_id_check,
  add constraint player_preferences_skin_id_check check (skin_id in (
    'classic','slate','paper','confetti','gingham','meadow','tide','kitty','bunny','charcoal','espresso','pinstripe','weave',
    'runes','aurora','obsidian','astral','sentinel','runeknight','arcanist','dawn-oath','rune-sanctum','copper-sprint','silver-current','golden-flash'
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
    ('solo-first',new.skin_id='copper-sprint'),('solo-10min',new.skin_id='silver-current'),('solo-5min',new.skin_id='golden-flash')
  ) reward(id,equipped) where reward.equipped loop
    if not exists(select 1 from public.achievement_unlocks where player_id=new.player_id and achievement_id=required) then
      raise exception 'Achievement required: %',required using errcode='42501';
    end if;
  end loop;
  return new;
end;
$$;
commit;
