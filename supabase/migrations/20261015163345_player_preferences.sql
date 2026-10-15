begin;

create function private.valid_player_keybindings(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) = 'object' then
    value ?& array['up','down','left','right','xblock','hardblock']
    and (select count(*) = 6 from jsonb_each(value))
    and (select count(distinct item) = 6 from jsonb_each(value) as entries(key,item))
    and not exists (
      select 1 from jsonb_each(value) as entries(key,item)
      where jsonb_typeof(item) <> 'string' or not ((item #>> '{}') ~ '^(Key[A-Z]|Digit[0-9])$')
    )
  else false end;
$$;
revoke execute on function private.valid_player_keybindings(jsonb) from public, anon;
grant execute on function private.valid_player_keybindings(jsonb) to authenticated, service_role;

create table public.player_preferences (
  player_id uuid primary key references public.players(id) on delete cascade,
  locale text not null default 'ko' check (locale in ('ko','en')),
  keybindings jsonb not null default '{"up":"KeyW","down":"KeyS","left":"KeyA","right":"KeyD","xblock":"Digit1","hardblock":"Digit2"}'::jsonb
    check (private.valid_player_keybindings(keybindings)),
  skin_id text not null default 'classic' check (skin_id in ('classic','slate','paper')),
  ability_id text check (ability_id in ('shield','clear-x','break-hard','self-shuffle','opponent-shuffle','delay-attack','peek-next','choose-next','convert-ticket','push-obstacle')),
  custom_shortcuts boolean not null default true
);
alter table public.player_preferences enable row level security;
revoke all on public.player_preferences from public, anon, authenticated, service_role;
grant select, insert on public.player_preferences to authenticated, service_role;
grant update (locale,keybindings,skin_id,ability_id,custom_shortcuts) on public.player_preferences to authenticated, service_role;
create policy "Read own preferences" on public.player_preferences for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "Create own preferences" on public.player_preferences for insert to authenticated
  with check ((select auth.uid()) = player_id);
create policy "Update own preferences" on public.player_preferences for update to authenticated
  using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);

commit;
