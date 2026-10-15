begin;
alter table public.player_preferences add column icon_id text not null default 'fox'
  check (icon_id in ('fox','owl','dragon','cat','rabbit','robot'));
grant update (icon_id) on public.player_preferences to authenticated, service_role;
commit;
