begin;

-- Forward upgrade for databases that installed the catalog before solo/daily features.
-- Historical lower-numbered migrations are retained for fresh installs, never replayed here.
do $$ begin
  if to_regclass('private.achievement_catalog') is null then raise exception 'Apply the content catalog migration first'; end if;
end; $$;

create table if not exists public.solo_records (
  player_id uuid not null references public.players(id) on delete cascade,
  board_size smallint not null default 5 check (board_size in (4,5)),
  run_id uuid not null unique,
  elapsed_ms integer not null check (elapsed_ms > 0 and elapsed_ms < 3600000),
  moves integer not null check (moves > 0 and moves <= 100000),
  score integer not null check (score > 0),
  achieved_at timestamptz not null default now(),
  primary key(player_id,board_size)
);
alter table public.solo_records add column if not exists board_size smallint not null default 5 check (board_size in (4,5));
do $$ begin
  if (select count(*) from pg_constraint c, unnest(c.conkey) k where c.conrelid='public.solo_records'::regclass and c.contype='p')=1 then
    alter table public.solo_records drop constraint solo_records_pkey, add primary key(player_id,board_size);
  end if;
end; $$;
alter table public.solo_records enable row level security;
revoke all on public.solo_records from public,anon,authenticated,service_role;
grant select on public.solo_records to authenticated;
drop policy if exists "Read own solo record" on public.solo_records;
create policy "Read own solo record" on public.solo_records for select to authenticated using ((select auth.uid())=player_id);
create index if not exists solo_records_ranking on public.solo_records(elapsed_ms,moves,achieved_at,player_id);

create table if not exists public.solo_endless_records (
  player_id uuid primary key references public.players(id) on delete cascade,
  run_id uuid not null unique,
  max_tile integer not null check (max_tile in (2048,4096,8192)),
  achieved_at timestamptz not null default now()
);
alter table public.solo_endless_records enable row level security;
revoke all on public.solo_endless_records from public,anon,authenticated,service_role;
grant select on public.solo_endless_records to authenticated;
drop policy if exists "Read own endless milestone" on public.solo_endless_records;
create policy "Read own endless milestone" on public.solo_endless_records for select to authenticated using ((select auth.uid())=player_id);

create or replace function public.record_solo_endless(p_run uuid,p_player uuid,p_tile integer) returns void
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

create or replace function public.my_solo_rank() returns table(rank_position bigint,elapsed_ms integer,moves integer)
language sql stable security definer set search_path='' as $$
  select ranked.rank_position,ranked.elapsed_ms,ranked.moves from (
    select r.player_id,r.elapsed_ms,r.moves,row_number() over(order by r.elapsed_ms,r.moves,r.achieved_at,r.player_id) as rank_position
    from public.solo_records r join public.players p on p.id=r.player_id
    where r.board_size=4 and p.suspended_at is null
  ) ranked where ranked.player_id=(select auth.uid());
$$;
revoke all on function public.my_solo_rank() from public,anon,authenticated,service_role;
grant execute on function public.my_solo_rank() to authenticated;

create or replace function public.my_season_rank(p_season uuid) returns table(rank_position bigint,rating integer,games_played integer)
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


-- Only the authoritative game server can read or write resumable boards.
create table if not exists public.solo_progress (
  owner_key text primary key,
  player_id uuid references public.players(id) on delete cascade,
  checkpoint jsonb not null check (jsonb_typeof(checkpoint) = 'object' and octet_length(checkpoint::text) <= 16384),
  updated_at timestamptz not null default now(),
  check ((player_id is not null and owner_key = 'account:' || player_id::text)
    or (player_id is null and owner_key ~ '^guest:[a-f0-9]{64}$'))
);
alter table public.solo_progress enable row level security;
revoke all on public.solo_progress from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.solo_progress to service_role;
drop policy if exists "Server manages solo progress" on public.solo_progress;
create policy "Server manages solo progress" on public.solo_progress for all to service_role using (true) with check (true);
create index if not exists solo_progress_player on public.solo_progress(player_id) where player_id is not null;

-- Preserve extra progress fields supplied by existing modes and keep match counts uncapped.
create or replace function private.achievement_progress(p_player uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.achievement_progress_before_catalog(p_player)||jsonb_build_object(
    'wins',(select count(*) from public.match_participants p join public.matches m on m.id=p.match_id where p.player_id=p_player and p.result='win' and m.achievement_eligible),
    'soloBestMs',(select elapsed_ms from public.solo_records where player_id=p_player and board_size=4),
    'soloHighestTile',coalesce((select max_tile from public.solo_endless_records where player_id=p_player),0),
    'achievementCount',(select count(*) from public.achievement_unlocks u join private.achievement_catalog c on c.item_id=u.achievement_id where u.player_id=p_player and c.published_once and c.definition->>'metric'<>'achievements')
  );
$$;
revoke all on function private.achievement_progress(uuid) from public,anon,authenticated,service_role;

drop trigger if exists award_solo_catalog_achievements on public.solo_records;
create trigger award_solo_catalog_achievements after insert or update on public.solo_records for each row execute function private.award_solo_catalog_achievements();
drop trigger if exists award_endless_catalog_achievements on public.solo_endless_records;
create trigger award_endless_catalog_achievements after insert or update on public.solo_endless_records for each row execute function private.award_solo_catalog_achievements();

-- Only pristine seed drafts were waiting for the solo backend; preserve all administrator edits.
update private.cosmetic_catalog set status='published',published_once=true,updated_at=now()
where kind='skin' and item_id in ('copper-sprint','silver-current','golden-flash','storm-fox','chrono-dragon','jade-path','twilight-orbit','star-phoenix')
and status='draft' and not published_once and revision=1;
update private.achievement_catalog set status='published',published_once=true,updated_at=now()
where item_id in ('solo-first','solo-10min','solo-6min','solo-4min','solo-2min','endless-2048','endless-4096','endless-8192')
and status='draft' and not published_once and revision=1;

commit;
