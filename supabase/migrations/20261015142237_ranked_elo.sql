-- Historical inferred rankings stay intact; only explicitly ranked games earn Elo.
begin;
alter table public.matches add column mode text not null default 'legacy'
  check (mode in ('legacy', 'casual', 'ranked', 'friend'));
alter table public.matches alter column mode set default 'casual';
alter table public.match_participants
  add column rating_before integer,
  add column rating_after integer,
  add column rating_delta integer,
  add constraint consistent_rating_change check (
    (rating_before is null and rating_after is null and rating_delta is null)
    or (rating_before is not null and rating_after is not null and rating_delta is not null
      and rating_after = rating_before + rating_delta)
  );

create table public.player_ratings (
  player_id uuid primary key references public.players(id) on delete cascade,
  display_name text not null,
  rating integer not null default 1200,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  games_played integer generated always as (wins + losses + draws) stored,
  highest_score integer not null default 0 check (highest_score >= 0),
  highest_tile integer not null default 0 check (highest_tile >= 0),
  updated_at timestamptz not null default now()
);
create index player_ratings_leaderboard on public.player_ratings (rating desc, games_played desc, player_id);
alter table public.player_ratings enable row level security;
revoke all on public.player_ratings from public, anon, authenticated;
grant select on public.player_ratings to anon, authenticated, service_role;
create policy "Public Elo leaderboard" on public.player_ratings for select to anon, authenticated, service_role using (true);

-- The optional mode keeps old outbox deliveries safe: they become casual games.
drop function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb);
create function public.record_match(
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
    if first_id is null or second_id is null or first_id = second_id
      or not exists (select 1 from auth.users where id = first_id and not coalesce(is_anonymous, false))
      or not exists (select 1 from auth.users where id = second_id and not coalesce(is_anonymous, false)) then
      raise exception 'Ranked games require two distinct authenticated accounts';
    end if;
    -- Lock account rows even before first rating exists, in a consistent order.
    perform id from public.players where id in (first_id, second_id) order by id for update;
  end if;
  insert into public.matches (id, started_at, ended_at, reason, winner_slot, ranked, mode)
    values (p_id, p_started_at, p_ended_at, p_reason, p_winner_slot, p_mode = 'ranked', p_mode)
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
      insert into public.player_ratings (player_id, display_name, rating, wins, losses, draws, highest_score, highest_tile)
        values (participant_id, participant_name, before_rating + delta_rating, (participant_result = 'win')::integer,
          (participant_result = 'loss')::integer, (participant_result = 'draw')::integer, participant_score, participant_tile)
      on conflict (player_id) do update set
        display_name = excluded.display_name, rating = excluded.rating,
        wins = public.player_ratings.wins + excluded.wins,
        losses = public.player_ratings.losses + excluded.losses,
        draws = public.player_ratings.draws + excluded.draws,
        highest_score = greatest(public.player_ratings.highest_score, excluded.highest_score),
        highest_tile = greatest(public.player_ratings.highest_tile, excluded.highest_tile), updated_at = now();
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
revoke all on function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb, text) to service_role;
alter publication supabase_realtime add table public.player_ratings;
commit;
