-- Forward migration: game history, account statistics and Realtime publication.
-- Rollback is a new forward migration; do not drop these tables after games exist.
begin;
create table public.matches (
  id uuid primary key,
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  reason text not null check (reason in ('reached_2048', 'opponent_locked', 'surrender', 'opponent_disconnected', 'draw')),
  winner_slot smallint check (winner_slot in (1, 2)),
  ranked boolean not null default false,
  check ((reason = 'draw') = (winner_slot is null))
);
create table public.match_participants (
  match_id uuid not null references public.matches(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  player_id uuid references public.players(id) on delete set null,
  display_name text not null,
  score integer not null check (score between 0 and 1000000000),
  max_tile integer not null check (max_tile between 2 and 2048 and (max_tile & (max_tile - 1)) = 0),
  result text not null check (result in ('win', 'loss', 'draw')),
  primary key (match_id, slot)
);
create index match_participants_player_match on public.match_participants (player_id, match_id);
create index matches_recent on public.matches (ended_at desc, id);
create table public.player_stats (
  player_id uuid primary key references public.players(id) on delete cascade,
  display_name text not null,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  games_played integer generated always as (wins + losses + draws) stored,
  highest_score integer not null default 0 check (highest_score >= 0),
  highest_tile integer not null default 0 check (highest_tile >= 0),
  updated_at timestamptz not null default now()
);
create index player_stats_leaderboard on public.player_stats (wins desc, highest_score desc, player_id);

alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.player_stats enable row level security;
revoke all on public.matches, public.match_participants, public.player_stats from public, anon, authenticated;
grant select on public.matches, public.match_participants to authenticated;
grant select on public.player_stats to anon, authenticated;

-- This narrow helper avoids recursive RLS when displaying both sides of your match.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create function private.is_match_participant(target_match uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.match_participants where match_id = target_match and player_id = (select auth.uid()));
$$;
revoke all on function private.is_match_participant(uuid) from public, anon, authenticated;
grant execute on function private.is_match_participant(uuid) to authenticated;
create policy "Participants read their matches" on public.matches for select to authenticated
  using ((select private.is_match_participant(id)));
create policy "Participants read both results" on public.match_participants for select to authenticated
  using ((select private.is_match_participant(match_id)));
create policy "Public leaderboard" on public.player_stats for select to anon, authenticated using (true);

-- Only the game server can submit results. One call commits history and stats atomically.
-- Replaying the same match id is a no-op, including after an ambiguous network failure.
create function public.record_match(
  p_id uuid, p_started_at timestamptz, p_ended_at timestamptz,
  p_reason text, p_winner_slot smallint, p_participants jsonb
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
  is_ranked boolean;
begin
  if jsonb_typeof(p_participants) is distinct from 'array' or jsonb_array_length(p_participants) <> 2 then
    raise exception 'Exactly two participants required';
  end if;
  first_id := (p_participants -> 0 ->> 'userId')::uuid;
  second_id := (p_participants -> 1 ->> 'userId')::uuid;
  is_ranked := first_id is not null and second_id is not null and first_id <> second_id
    and exists (select 1 from auth.users where id = first_id and not coalesce(is_anonymous, false))
    and exists (select 1 from auth.users where id = second_id and not coalesce(is_anonymous, false));
  -- Serialize overlapping player updates in UUID order, regardless of match slots.
  if is_ranked then
    perform id from public.players where id in (first_id, second_id) order by id for update;
  end if;
  insert into public.matches (id, started_at, ended_at, reason, winner_slot, ranked)
    values (p_id, p_started_at, p_ended_at, p_reason, p_winner_slot, is_ranked)
    on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is null then return false; end if;
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
    insert into public.match_participants (match_id, slot, player_id, display_name, score, max_tile, result)
      values (p_id, slot_index, participant_id, participant_name, participant_score, participant_tile, participant_result);
    -- Guest games and self-matches appear in history but cannot inflate rankings.
    if is_ranked then
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
revoke all on function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb) from public, anon, authenticated;
grant execute on function public.record_match(uuid, timestamptz, timestamptz, text, smallint, jsonb) to service_role;

-- Enable Postgres Changes only for the two screens that consume them.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.player_stats, public.match_participants;
end;
$$;
commit;
