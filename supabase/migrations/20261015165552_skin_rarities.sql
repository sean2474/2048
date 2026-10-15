begin;

alter table public.player_preferences
  drop constraint player_preferences_skin_id_check,
  add constraint player_preferences_skin_id_check check (
    skin_id in ('classic','slate','paper','confetti','gingham','meadow','tide','kitty','bunny')
  );

commit;
