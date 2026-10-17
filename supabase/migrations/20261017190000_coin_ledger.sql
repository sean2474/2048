begin;

-- Every wallet change is recorded once, in the same transaction as the balance update.
create table public.coin_transactions (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null check (reason in ('daily_quest','purchase','admin_grant','admin_deduct')),
  reference jsonb not null default '{}'::jsonb,
  actor_id uuid,
  note text check (note is null or char_length(note) between 1 and 500),
  created_at timestamptz not null default now()
);
create index coin_transactions_player_recent on public.coin_transactions(player_id, created_at desc, id desc);
alter table public.coin_transactions enable row level security;
revoke all on public.coin_transactions from public, anon, authenticated, service_role;
grant select on public.coin_transactions to authenticated;
create policy "Read own coin transactions" on public.coin_transactions for select to authenticated
  using ((select auth.uid()) = player_id);

-- Callers hold the wallet row lock; the wallet check constraint rejects negative balances.
create function private.apply_coin_change(p_player uuid, p_delta bigint, p_reason text, p_reference jsonb default '{}'::jsonb, p_actor uuid default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_balance bigint;
begin
  if p_player is null or p_delta is null or p_delta = 0 then raise exception 'Invalid coin change' using errcode = '22023'; end if;
  update public.player_wallets set balance = balance + p_delta where player_id = p_player returning balance into new_balance;
  if not found then raise exception 'Wallet unavailable' using errcode = '55000'; end if;
  insert into public.coin_transactions(player_id, delta, balance_after, reason, reference, actor_id, note)
    values (p_player, p_delta, new_balance, p_reason, coalesce(p_reference, '{}'::jsonb), p_actor, p_note);
  return new_balance;
end;
$$;
revoke all on function private.apply_coin_change(uuid, bigint, text, jsonb, uuid, text) from public, anon, authenticated, service_role;

create or replace function public.purchase_cosmetic(p_kind text, p_item_id text, p_expected_price integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare player uuid := auth.uid(); cost integer; coins bigint; source text;
begin
  if player is null or not exists(select 1 from auth.users where id = player and not coalesce(is_anonymous, false)) then raise exception 'Account required' using errcode = '42501'; end if;
  select price, acquisition into cost, source from private.cosmetic_catalog where kind = p_kind and item_id = p_item_id and status = 'published' and acquisition in ('free', 'coins') for share;
  if not found then raise exception 'Unknown item' using errcode = '22023'; end if;
  if cost = 0 then raise exception 'Item is included' using errcode = '22023'; end if;
  if p_expected_price is null or p_expected_price < 0 then raise exception 'Price confirmation required' using errcode = '22023'; end if;
  select balance into coins from public.player_wallets where player_id = player for update;
  if not found then raise exception 'Wallet unavailable' using errcode = '55000'; end if;
  if exists(select 1 from public.cosmetic_purchases where player_id = player and kind = p_kind and item_id = p_item_id) then return public.cosmetic_state() || jsonb_build_object('purchased', false); end if;
  if p_expected_price <> cost then raise exception 'Price changed. Review the updated price before buying.' using errcode = '22023'; end if;
  if coins < cost then raise exception 'Not enough coins' using errcode = '22023'; end if;
  perform private.apply_coin_change(player, -cost, 'purchase', jsonb_build_object('kind', p_kind, 'itemId', p_item_id));
  insert into public.cosmetic_purchases(player_id, kind, item_id, price_paid) values (player, p_kind, p_item_id, cost);
  return public.cosmetic_state() || jsonb_build_object('purchased', true);
end;
$$;

create or replace function private.sync_daily_quests_at(p_player uuid, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  day date := (p_now at time zone 'Asia/Seoul')::date;
  checked integer; played integer; won integer; credited integer; awarded_quests jsonb; balance bigint;
begin
  if p_now is null or p_player is null or not exists(
    select 1 from auth.users u join public.players p on p.id = u.id
    where u.id = p_player and not coalesce(u.is_anonymous, false) and p.suspended_at is null
  ) then raise exception 'Account required' using errcode = '42501'; end if;
  -- Share the purchase lock so concurrent syncs and spending cannot duplicate or lose coins.
  select w.balance into balance from public.player_wallets w where w.player_id = p_player for update;
  if not found then raise exception 'Wallet unavailable' using errcode = '55000'; end if;
  checked := case when exists(select 1 from public.player_attendance where player_id = p_player and last_day = day) then 1 else 0 end;
  select least(count(*), 3)::integer, least(count(*) filter (where p.result = 'win'), 1)::integer into played, won
    from public.match_participants p join public.matches m on m.id = p.match_id
    where p.player_id = p_player and m.achievement_eligible
      and m.ended_at >= (day::timestamp at time zone 'Asia/Seoul')
      and m.ended_at < ((day + 1)::timestamp at time zone 'Asia/Seoul') and m.ended_at <= p_now;
  with awarded as (
    insert into public.daily_quest_rewards(player_id, quest_day, quest_id, coins, rewarded_at)
      select p_player, day, q.id, q.coins, p_now from (values
        ('check-in', 20, checked >= 1), ('play-3', 60, played >= 3), ('win-1', 40, won >= 1)
      ) q(id, coins, complete) where q.complete on conflict do nothing returning quest_id, coins
  ) select coalesce(sum(coins), 0)::integer, coalesce(jsonb_agg(quest_id order by quest_id), '[]'::jsonb) into credited, awarded_quests from awarded;
  if credited > 0 then
    balance := private.apply_coin_change(p_player, credited, 'daily_quest', jsonb_build_object('day', day, 'quests', awarded_quests));
  end if;
  return jsonb_build_object('playerId', p_player, 'day', day, 'nextResetAt', (day + 1)::timestamp at time zone 'Asia/Seoul', 'balance', balance, 'awarded', credited,
    'quests', (select jsonb_agg(jsonb_build_object('id', q.id, 'progress', case when r.rewarded_at is not null then q.target else q.progress end, 'rewardedAt', r.rewarded_at) order by q.position)
      from (values ('check-in', checked, 1, 1), ('play-3', played, 3, 2), ('win-1', won, 1, 3)) q(id, progress, target, position)
      left join public.daily_quest_rewards r on r.player_id = p_player and r.quest_day = day and r.quest_id = q.id));
end;
$$;

-- Operators grant or deduct coins with a recorded reason; the ledger row is the audit entry.
create function public.admin_adjust_coins(p_user_id uuid, p_delta bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare coins bigint; new_balance bigint;
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_user_id is null or p_delta is null or p_delta = 0 or abs(p_delta) > 1000000 or p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid coin adjustment' using errcode = '22023';
  end if;
  if not exists(select 1 from auth.users where id = p_user_id and not coalesce(is_anonymous, false)) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  select balance into coins from public.player_wallets where player_id = p_user_id for update;
  if not found then raise exception 'Player not found' using errcode = 'P0002'; end if;
  if coins + p_delta < 0 then raise exception 'Not enough coins' using errcode = '22023'; end if;
  new_balance := private.apply_coin_change(p_user_id, p_delta, case when p_delta > 0 then 'admin_grant' else 'admin_deduct' end, '{}'::jsonb, (select auth.uid()), trim(p_reason));
  return jsonb_build_object('balance', new_balance);
end;
$$;
revoke all on function public.admin_adjust_coins(uuid, bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_adjust_coins(uuid, bigint, text) to authenticated;

create function public.admin_coin_history(p_user_id uuid, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_game_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_user_id is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid coin history request' using errcode = '22023'; end if;
  if not exists(select 1 from public.player_wallets where player_id = p_user_id) then raise exception 'Player not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'balance', (select balance from public.player_wallets where player_id = p_user_id),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'delta', t.delta, 'balanceAfter', t.balance_after, 'reason', t.reason, 'reference', t.reference,
      'actorId', t.actor_id, 'note', t.note, 'createdAt', t.created_at) order by t.created_at desc, t.id desc)
      from (select * from public.coin_transactions where player_id = p_user_id order by created_at desc, id desc limit p_limit) t), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_coin_history(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_coin_history(uuid, integer) to authenticated;

commit;
