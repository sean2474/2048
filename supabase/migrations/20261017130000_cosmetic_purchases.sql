begin;

create table private.cosmetic_catalog (
  kind text not null check (kind in ('skin','icon')),
  item_id text not null,
  price integer not null check (price >= 0),
  primary key (kind,item_id)
);
revoke all on private.cosmetic_catalog from public,anon,authenticated,service_role;
insert into private.cosmetic_catalog(kind,item_id,price) values
  ('skin','classic',0),('skin','slate',0),('skin','paper',0),('skin','charcoal',0),('skin','espresso',0),
  ('skin','confetti',300),('skin','gingham',300),('skin','pinstripe',300),('skin','weave',300),('skin','runes',300),
  ('skin','meadow',600),('skin','tide',600),('skin','aurora',600),('skin','obsidian',600),('skin','astral',600),
  ('skin','kitty',1200),('skin','bunny',1200),('skin','sentinel',1200),('skin','runeknight',1200),('skin','arcanist',1200),
  ('icon','fox',0),('icon','owl',150),('icon','dragon',150),('icon','cat',150),('icon','rabbit',150),('icon','robot',150);

create table public.cosmetic_purchases (
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null,
  item_id text not null,
  price_paid integer not null check (price_paid > 0),
  purchased_at timestamptz not null default now(),
  primary key (player_id,kind,item_id),
  foreign key (kind,item_id) references private.cosmetic_catalog(kind,item_id)
);
alter table public.cosmetic_purchases enable row level security;
revoke all on public.cosmetic_purchases from public,anon,authenticated,service_role;
grant select on public.cosmetic_purchases to authenticated,service_role;
create policy "Read own cosmetic purchases" on public.cosmetic_purchases for select to authenticated
  using ((select auth.uid())=player_id);

create function public.cosmetic_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare player uuid:=auth.uid();
begin
  if player is null or not exists(select 1 from auth.users where id=player and not coalesce(is_anonymous,false)) then
    raise exception 'Account required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'balance',coalesce((select balance from public.player_wallets where player_id=player),0),
    'purchases',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'item_id',item_id) order by kind,item_id)
      from public.cosmetic_purchases where player_id=player),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.cosmetic_state() from public,anon,authenticated,service_role;
grant execute on function public.cosmetic_state() to authenticated;

create function public.purchase_cosmetic(p_kind text,p_item_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare player uuid:=auth.uid(); cost integer; coins bigint;
begin
  if player is null or not exists(select 1 from auth.users where id=player and not coalesce(is_anonymous,false)) then
    raise exception 'Account required' using errcode='42501';
  end if;
  select price into cost from private.cosmetic_catalog where kind=p_kind and item_id=p_item_id;
  if not found then
    raise exception 'Unknown item' using errcode='22023';
  end if;
  if cost=0 then
    raise exception 'Item is included' using errcode='22023';
  end if;
  -- One wallet lock serializes all purchases by the same player, including duplicate retries.
  select balance into coins from public.player_wallets where player_id=player for update;
  if not found then
    raise exception 'Wallet unavailable' using errcode='55000';
  end if;
  if exists(select 1 from public.cosmetic_purchases where player_id=player and kind=p_kind and item_id=p_item_id) then
    return public.cosmetic_state() || jsonb_build_object('purchased',false);
  end if;
  if coins<cost then
    raise exception 'Not enough coins' using errcode='22023';
  end if;
  update public.player_wallets set balance=balance-cost where player_id=player;
  insert into public.cosmetic_purchases(player_id,kind,item_id,price_paid) values(player,p_kind,p_item_id,cost);
  return public.cosmetic_state() || jsonb_build_object('purchased',true);
end;
$$;
revoke all on function public.purchase_cosmetic(text,text) from public,anon,authenticated,service_role;
grant execute on function public.purchase_cosmetic(text,text) to authenticated;

-- Previously free previews do not grant paid ownership; keep language, controls and earned rewards.
update public.player_preferences p set
  skin_id=case when exists(select 1 from private.cosmetic_catalog c where c.kind='skin' and c.item_id=p.skin_id and c.price>0)
    then 'classic' else p.skin_id end,
  icon_id=case when exists(select 1 from private.cosmetic_catalog c where c.kind='icon' and c.item_id=p.icon_id and c.price>0)
    then 'fox' else p.icon_id end
where exists(select 1 from private.cosmetic_catalog c where c.price>0 and
  ((c.kind='skin' and c.item_id=p.skin_id) or (c.kind='icon' and c.item_id=p.icon_id)));

create function private.require_cosmetic_equipment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true)='authenticated' and new.player_id is distinct from auth.uid() then
    raise exception 'row-level security violation' using errcode='42501';
  end if;
  if exists(select 1 from private.cosmetic_catalog c where c.price>0 and
    ((c.kind='skin' and c.item_id=new.skin_id) or (c.kind='icon' and c.item_id=new.icon_id)) and
    not exists(select 1 from public.cosmetic_purchases p where p.player_id=new.player_id and p.kind=c.kind and p.item_id=c.item_id)) then
    raise exception 'Purchase required' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.require_cosmetic_equipment() from public,anon,authenticated,service_role;
create trigger require_cosmetic_equipment before insert or update of skin_id,icon_id on public.player_preferences
  for each row execute function private.require_cosmetic_equipment();

commit;
