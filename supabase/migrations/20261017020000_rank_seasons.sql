begin;
create table public.rank_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(trim(name)) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid,
  transition_reason text,
  check(ends_at is null or ends_at > starts_at)
);
create unique index one_current_rank_season on public.rank_seasons ((true)) where ends_at is null;
alter table public.rank_seasons enable row level security;
revoke all on public.rank_seasons from public, anon, authenticated;
grant select(id,name,starts_at,ends_at) on public.rank_seasons to anon, authenticated;
grant select on public.rank_seasons to service_role;
create policy "Public seasons" on public.rank_seasons for select to anon,authenticated,service_role using(true);
insert into public.rank_seasons(name,starts_at) values('Season 1','1970-01-01T00:00:00Z');

create function private.rank_tier(p_rating integer) returns text
language sql immutable set search_path='' as $$
  select case when p_rating<1000 then 'Bronze' when p_rating<1200 then 'Silver' when p_rating<1400 then 'Gold'
    when p_rating<1600 then 'Platinum' when p_rating<1800 then 'Diamond' else 'Master' end;
$$;
revoke all on function private.rank_tier(integer) from public,anon,authenticated,service_role;
alter table public.player_ratings
  add column season_id uuid references public.rank_seasons(id),
  add column placement_games integer not null default 0 check(placement_games between 0 and 10),
  add column tier text check(tier in ('Bronze','Silver','Gold','Platinum','Diamond','Master')),
  add column peak_rating integer,
  add constraint rank_placement_consistent check((placement_games=10) = (tier is not null));
update public.player_ratings set season_id=(select id from public.rank_seasons where ends_at is null),
  placement_games=least(10,games_played), tier=case when games_played>=10 then private.rank_tier(rating) else null end;
-- Existing games are real season activity; provisional results do not establish a peak.
with recorded as (
  select p.player_id,p.rating_after,row_number() over(partition by p.player_id order by m.ended_at,m.id) as played
  from public.match_participants p join public.matches m on m.id=p.match_id where m.mode='ranked'
), peaks as (
  select player_id,max(rating_after) as rating from recorded where played>=10 group by player_id
)
update public.player_ratings r set peak_rating=greatest(r.rating,(select p.rating from peaks p where p.player_id=r.player_id))
  where r.placement_games=10;
alter table public.player_ratings alter column season_id set not null;
create index player_ratings_season on public.player_ratings(season_id);
create table public.season_ratings (like public.player_ratings including defaults including generated including constraints,
  primary key(season_id,player_id), foreign key(season_id) references public.rank_seasons(id),
  foreign key(player_id) references public.players(id) on delete cascade);
insert into public.season_ratings(player_id,display_name,rating,wins,losses,draws,highest_score,highest_tile,updated_at,season_id,placement_games,tier,peak_rating)
  select player_id,display_name,rating,wins,losses,draws,highest_score,highest_tile,updated_at,season_id,placement_games,tier,peak_rating from public.player_ratings;
create index season_standings on public.season_ratings(season_id,rating desc,games_played desc,player_id);
create index season_ratings_player on public.season_ratings(player_id);
alter table public.season_ratings enable row level security;
revoke all on public.season_ratings from public,anon,authenticated;
grant select on public.season_ratings to anon,authenticated,service_role;
create policy "Public season standings" on public.season_ratings for select to anon,authenticated,service_role using(true);
alter table public.matches add column season_id uuid references public.rank_seasons(id);
create index matches_season on public.matches(season_id);
update public.matches set season_id=(select id from public.rank_seasons where ends_at is null) where mode='ranked';
alter table public.match_participants add column tier_before text, add column tier_after text,
  add column placement_games integer;
-- Old results predate placements; retain their then-visible Elo tiers.
update public.match_participants set tier_before=private.rank_tier(rating_before),tier_after=private.rank_tier(rating_after)
  where rating_before is not null;

create or replace function private.record_match_base(
  p_id uuid, p_started_at timestamptz, p_ended_at timestamptz,
  p_reason text, p_winner_slot smallint, p_participants jsonb, p_mode text default 'casual'
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  inserted_id uuid;
  participant jsonb;
  participant_id uuid;
  slot_index smallint := 0;
  participant_name text;
  participant_result text;
  participant_score integer;
  participant_tile integer;
  first_id uuid;
  second_id uuid;
  first_rating integer;
  second_rating integer;
  first_delta integer;
  before_rating integer;
  delta_rating integer;
  season public.rank_seasons%rowtype;
  current_season uuid;
  rank_row public.player_ratings%rowtype;
  season_row public.season_ratings%rowtype;
  old_tier text;
begin
  if p_mode is null or p_mode not in ('casual', 'ranked', 'friend') then
    raise exception 'Invalid match mode';
  end if;
  if jsonb_typeof(p_participants) is distinct from 'array' or jsonb_array_length(p_participants) <> 2 then
    raise exception 'Exactly two participants required';
  end if;
  first_id := (p_participants -> 0 ->> 'userId')::uuid;
  second_id := (p_participants -> 1 ->> 'userId')::uuid;
  if p_mode = 'ranked' then
    -- This lock also guards rollover, including results delivered from an old outbox.
    perform pg_advisory_xact_lock(2048, 17);
    if exists(select 1 from public.matches where id=p_id) then return false; end if;
    select * into season from public.rank_seasons where starts_at<=p_started_at and (ends_at is null or p_started_at<ends_at);
    if not found then raise exception 'No season for match start' using errcode='22023'; end if;
    select id into current_season from public.rank_seasons where ends_at is null;
    if first_id is null or second_id is null or first_id = second_id
      or not exists (select 1 from auth.users where id = first_id and not coalesce(is_anonymous, false))
      or not exists (select 1 from auth.users where id = second_id and not coalesce(is_anonymous, false)) then
      raise exception 'Ranked games require two distinct authenticated accounts';
    end if;
    -- Lock account rows even before first rating exists, in a consistent order.
    perform id from public.players where id in (first_id, second_id) order by id for update;
  end if;
  insert into public.matches (id, started_at, ended_at, reason, winner_slot, ranked, mode, season_id)
    values (p_id, p_started_at, p_ended_at, p_reason, p_winner_slot, p_mode = 'ranked', p_mode, season.id)
    on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is null then return false; end if;

  if p_mode = 'ranked' then
    select coalesce((select rating from public.player_ratings where player_id = first_id), 1200) into first_rating;
    select coalesce((select rating from public.player_ratings where player_id = second_id), 1200) into second_rating;
    first_delta := round(32 * (
      case when p_winner_slot is null then 0.5 when p_winner_slot = 1 then 1 else 0 end
      - 1 / (1 + power(10::numeric, (second_rating::numeric - first_rating) / 400))
    ));
  end if;
  for participant in select value from jsonb_array_elements(p_participants) loop
    slot_index := slot_index + 1;
    participant_id := (participant ->> 'userId')::uuid;
    participant_score := (participant ->> 'score')::integer;
    participant_tile := (participant ->> 'maxTile')::integer;
    participant_name := 'Guest';
    if participant_id is not null then
      select name into strict participant_name from public.players where id = participant_id;
    end if;
    participant_result := case when p_winner_slot is null then 'draw' when slot_index = p_winner_slot then 'win' else 'loss' end;
    before_rating := case when slot_index = 1 then first_rating else second_rating end;
    delta_rating := case when slot_index = 1 then first_delta else -first_delta end;
    insert into public.match_participants (match_id, slot, player_id, display_name, score, max_tile, result, rating_before, rating_after, rating_delta)
      values (p_id, slot_index, participant_id, participant_name, participant_score, participant_tile, participant_result,
        before_rating, before_rating + delta_rating, delta_rating);
    if p_mode = 'ranked' then
      select * into rank_row from public.player_ratings where player_id=participant_id;
      old_tier:=rank_row.tier;
      rank_row.placement_games:=least(10,coalesce(rank_row.placement_games,0)+1);
      rank_row.tier:=case when rank_row.placement_games=10 then private.rank_tier(before_rating+delta_rating) else null end;
      insert into public.season_ratings (season_id,player_id,display_name,rating,wins,losses,draws,highest_score,highest_tile,
        placement_games,tier,peak_rating)
      values(season.id,participant_id,participant_name,before_rating+delta_rating,(participant_result='win')::integer,
        (participant_result='loss')::integer,(participant_result='draw')::integer,participant_score,participant_tile,
        rank_row.placement_games,rank_row.tier,case when rank_row.tier is not null then before_rating+delta_rating else null end)
      on conflict(season_id,player_id) do update set display_name=excluded.display_name,rating=excluded.rating,
        wins=public.season_ratings.wins+excluded.wins,losses=public.season_ratings.losses+excluded.losses,draws=public.season_ratings.draws+excluded.draws,
        highest_score=greatest(public.season_ratings.highest_score,excluded.highest_score),highest_tile=greatest(public.season_ratings.highest_tile,excluded.highest_tile),
        placement_games=excluded.placement_games,tier=excluded.tier,
        peak_rating=greatest(public.season_ratings.peak_rating,excluded.peak_rating),updated_at=now()
      returning * into season_row;
      -- Lifetime Elo always advances; a late result cannot add activity to the current season.
      insert into public.player_ratings(player_id,display_name,rating,season_id,placement_games,tier)
        values(participant_id,participant_name,before_rating+delta_rating,current_season,rank_row.placement_games,rank_row.tier)
      on conflict(player_id) do update set display_name=excluded.display_name,rating=excluded.rating,
        placement_games=excluded.placement_games,tier=excluded.tier,updated_at=now();
      if season.id=current_season then
        update public.player_ratings set wins=season_row.wins,losses=season_row.losses,draws=season_row.draws,
          highest_score=season_row.highest_score,highest_tile=season_row.highest_tile,peak_rating=season_row.peak_rating
          where player_id=participant_id;
      end if;
      update public.match_participants set tier_before=old_tier,tier_after=rank_row.tier,placement_games=rank_row.placement_games
        where match_id=p_id and slot=slot_index;
      -- Keep existing lifetime statistics without converting them into Elo.
      insert into public.player_stats (player_id, display_name, wins, losses, draws, highest_score, highest_tile)
        values (participant_id, participant_name, (participant_result = 'win')::integer,
          (participant_result = 'loss')::integer, (participant_result = 'draw')::integer, participant_score, participant_tile)
      on conflict (player_id) do update set
        display_name = excluded.display_name,
        wins = public.player_stats.wins + excluded.wins,
        losses = public.player_stats.losses + excluded.losses,
        draws = public.player_stats.draws + excluded.draws,
        highest_score = greatest(public.player_stats.highest_score, excluded.highest_score),
        highest_tile = greatest(public.player_stats.highest_tile, excluded.highest_tile), updated_at = now();
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.record_match_base(uuid,timestamptz,timestamptz,text,smallint,jsonb,text) from public,anon,authenticated,service_role;
create function public.admin_rollover_season(p_expected_season uuid,p_name text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare current_season uuid; current_start timestamptz; next_season uuid; cutover timestamptz;
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_expected_season is null or p_name is null or char_length(trim(p_name)) not between 1 and 80
    or p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid season transition' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(2048,17);
  select id,starts_at into current_season,current_start from public.rank_seasons where ends_at is null for update;
  if current_season is distinct from p_expected_season then raise exception 'Season changed; refresh before retrying' using errcode='40001'; end if;
  -- Adjacent seasons must remain ordered even if the system clock stalls or goes backwards.
  cutover:=greatest(clock_timestamp(),current_start+interval '1 microsecond');
  update public.rank_seasons set ends_at=cutover where id=current_season;
  insert into public.rank_seasons(name,starts_at,created_by,transition_reason)
    values(trim(p_name),cutover,auth.uid(),trim(p_reason)) returning id into next_season;
  insert into public.season_ratings(season_id,player_id,display_name,rating,placement_games,tier)
    select next_season,player_id,display_name,rating,placement_games,tier from public.player_ratings;
  update public.player_ratings set season_id=next_season,wins=0,losses=0,draws=0,highest_score=0,highest_tile=0,
    peak_rating=null,updated_at=now();
  return next_season;
end;
$$;
revoke all on function public.admin_rollover_season(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_rollover_season(uuid,text,text) to authenticated;
create or replace function private.sync_player_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.player_ratings set display_name=new.name where player_id=new.id;
  update public.player_stats set display_name=new.name where player_id=new.id;
  update public.season_ratings set display_name=new.name where player_id=new.id
    and season_id=(select id from public.rank_seasons where ends_at is null);
  return new;
end;
$$;
create function public.admin_rank_seasons() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(s) order by starts_at desc),'[]'::jsonb) from public.rank_seasons s);
end;
$$;
revoke all on function public.admin_rank_seasons() from public,anon,authenticated;
grant execute on function public.admin_rank_seasons() to authenticated;
commit;
