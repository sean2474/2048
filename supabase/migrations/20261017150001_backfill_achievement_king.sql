-- Forward-only reward backfill: preserve earned unlocks if the feature is disabled later.
insert into public.achievement_unlocks(player_id,achievement_id)
  select a.player_id,'achievement-king' from public.achievement_unlocks a
  join auth.users u on u.id=a.player_id and not coalesce(u.is_anonymous,false)
  where a.achievement_id<>'achievement-king' group by a.player_id having count(*)>=5
  on conflict do nothing;
