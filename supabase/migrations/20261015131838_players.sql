-- Apply once to the new Supabase project using SQL Editor or Supabase CLI.
-- Stores account profiles only. Match results must be written by a trusted server.
begin;
create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or char_length(username) between 2 and 16),
  name text not null default 'Player' check (char_length(name) between 1 and 32),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.players enable row level security;
revoke all on public.players from anon, authenticated;
grant select on public.players to authenticated;
grant update (name, username, image_path) on public.players to authenticated;
create policy "Read own profile" on public.players for select to authenticated using ((select auth.uid()) = id);
create policy "Update own profile" on public.players for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.handle_new_player() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.players (id, name, image_path)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Player'), 32), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_player() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_player();

create function public.touch_player_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke execute on function public.touch_player_updated_at() from public, anon, authenticated;
create trigger players_updated_at before update on public.players for each row execute function public.touch_player_updated_at();

-- Backfill accounts created before this migration.
insert into public.players (id, name, image_path)
select id, left(coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), 'Player'), 32), raw_user_meta_data ->> 'avatar_url' from auth.users
on conflict (id) do nothing;
commit;
