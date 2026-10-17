-- Only the authoritative game server can read or write resumable boards.
create table public.solo_progress (
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
create policy "Server manages solo progress" on public.solo_progress for all to service_role using (true) with check (true);
create index solo_progress_player on public.solo_progress(player_id) where player_id is not null;
