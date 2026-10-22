begin;

-- Existing six/seven-key rows upgrade on read and save as five-key settings.
create or replace function private.valid_player_keybindings(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) = 'object' then
    (select count(distinct item) = count(*) and (
      (count(*) = 5 and value ?& array['up','down','left','right','ability'])
      or (count(*) = case when value ? 'ability' then 7 else 6 end
        and value ?& array['up','down','left','right','xblock','hardblock'])
    ) from jsonb_each(value) as entries(key,item))
    and not exists (
      select 1 from jsonb_each(value) as entries(key,item)
      where jsonb_typeof(item) <> 'string' or not ((item #>> '{}') ~ '^(Key[A-Z]|Digit[0-9]|Space)$')
    )
  else false end;
$$;
revoke execute on function private.valid_player_keybindings(jsonb) from public, anon;
grant execute on function private.valid_player_keybindings(jsonb) to authenticated, service_role;

-- Expand validation before deploying the web client; do not rewrite active preferences yet.
commit;
