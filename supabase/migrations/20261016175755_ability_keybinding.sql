begin;

-- Keep six-key rows valid while older clients finish their sessions.
create or replace function private.valid_player_keybindings(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) = 'object' then
    value ?& array['up','down','left','right','xblock','hardblock']
    and (select count(*) = case when value ? 'ability' then 7 else 6 end
      and count(distinct item) = count(*) from jsonb_each(value) as entries(key,item))
    and not exists (
      select 1 from jsonb_each(value) as entries(key,item)
      where jsonb_typeof(item) <> 'string' or not ((item #>> '{}') ~ '^(Key[A-Z]|Digit[0-9])$')
    )
  else false end;
$$;
revoke execute on function private.valid_player_keybindings(jsonb) from public, anon;
grant execute on function private.valid_player_keybindings(jsonb) to authenticated, service_role;

alter table public.player_preferences alter column keybindings set default
  '{"up":"KeyW","down":"KeyS","left":"KeyA","right":"KeyD","xblock":"Digit1","hardblock":"Digit2","ability":"Digit3"}'::jsonb;

commit;
