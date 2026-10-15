begin;

create table public.player_wallets (
  player_id uuid primary key references public.players(id) on delete cascade,
  balance bigint not null default 0 check (balance between 0 and 9007199254740991),
  created_at timestamptz not null default now()
);
alter table public.player_wallets enable row level security;
revoke all on public.player_wallets from public, anon, authenticated, service_role;
grant select on public.player_wallets to authenticated, service_role;
create policy "Read own wallet" on public.player_wallets for select to authenticated
  using ((select auth.uid()) = player_id);

create function private.initialize_player_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.player_wallets (player_id) values (new.id) on conflict (player_id) do nothing;
  return new;
end;
$$;
revoke execute on function private.initialize_player_wallet() from public, anon, authenticated, service_role;
create trigger on_player_created_wallet after insert on public.players
  for each row execute function private.initialize_player_wallet();

insert into public.player_wallets (player_id) select id from public.players
on conflict (player_id) do nothing;

commit;
