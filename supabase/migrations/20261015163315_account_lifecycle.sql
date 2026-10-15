begin;

-- Names in standings follow the profile; completed match names remain snapshots.
create function private.sync_player_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.player_ratings set display_name = new.name where player_id = new.id;
  update public.player_stats set display_name = new.name where player_id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_player_name() from public, anon, authenticated, service_role;
create trigger sync_player_name after update of name on public.players
for each row when (old.name is distinct from new.name) execute function private.sync_player_name();

-- Retain opponents' results while removing the deleted player's display name.
create function private.anonymize_deleted_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.match_participants set display_name = 'Deleted player' where player_id = old.id;
  return old;
end;
$$;
revoke all on function private.anonymize_deleted_player() from public, anon, authenticated, service_role;
create trigger anonymize_deleted_player before delete on public.players
for each row execute function private.anonymize_deleted_player();

commit;
