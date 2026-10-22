begin;

-- Apply AFTER the Space-capable web build is live in this environment.
alter table public.player_preferences alter column keybindings set default
  '{"up":"KeyW","down":"KeyS","left":"KeyA","right":"KeyD","ability":"Space"}'::jsonb;

-- Only replace the previous default; preserve customized movement/ability keys.
update public.player_preferences
set keybindings = jsonb_set(keybindings, '{ability}', '"Space"'::jsonb)
where keybindings ->> 'ability' = 'Digit1'
  and not (keybindings ? 'xblock' or keybindings ? 'hardblock')
  and not exists (
    select 1 from jsonb_each_text(keybindings) as binding(action, code)
    where code = 'Space'
  );

commit;
