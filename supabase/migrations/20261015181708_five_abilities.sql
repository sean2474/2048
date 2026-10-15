begin;

-- Preserve previous selections for older clients; null still means the default ability.
alter table public.player_preferences
  drop constraint player_preferences_ability_id_check,
  add constraint player_preferences_ability_id_check check (
    ability_id in (
      'shield','clear-x','break-hard','self-shuffle','opponent-shuffle',
      'delay-attack','peek-next','choose-next','convert-ticket','push-obstacle',
      'bomb-tile','frost-wave','purge','tile-swap','combo-chain',
      'spawn-pause','anchor-tile','swap-32'
    )
  );

commit;
