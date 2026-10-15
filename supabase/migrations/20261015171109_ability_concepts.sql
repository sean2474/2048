begin;

-- Keep retired preview IDs readable by older clients; no saved preferences are deleted.
alter table public.player_preferences
  drop constraint player_preferences_ability_id_check,
  add constraint player_preferences_ability_id_check check (
    ability_id in (
      'shield','clear-x','break-hard','self-shuffle','opponent-shuffle',
      'delay-attack','peek-next','choose-next','convert-ticket','push-obstacle',
      'bomb-tile','frost-wave','purge','tile-swap','combo-chain'
    )
  );

commit;
