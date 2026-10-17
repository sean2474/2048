begin;

alter table public.achievement_unlocks drop constraint achievement_unlocks_achievement_id_check,
  add constraint achievement_unlocks_achievement_id_check check (achievement_id in (
    'checkin-7','checkin-30','wins-10','tile-2048-reward','solo-first','solo-10min','solo-6min','solo-4min','solo-2min',
    'endless-2048','endless-4096','endless-8192','achievement-king',
    'rank-bronze','rank-silver','rank-gold','rank-platinum','rank-diamond','rank-master'
  ));
alter table public.player_preferences drop constraint player_preferences_icon_id_check,
  add constraint player_preferences_icon_id_check check (icon_id in (
    'fox','owl','dragon','cat','rabbit','robot','attendance-king','victory-vanguard','achievement-king',
    'rank-bronze','rank-silver','rank-gold','rank-platinum','rank-diamond','rank-master'
  ));

create function private.award_achievement_king() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.achievement_id='achievement-king' then return new; end if;
  -- Serialize milestones without blocking foreign-key key-share locks on this player.
  perform p.id from public.players p join auth.users u on u.id=p.id
    where p.id=new.player_id and not coalesce(u.is_anonymous,false) for no key update of p;
  if found and (select count(*) from public.achievement_unlocks where player_id=new.player_id and achievement_id<>'achievement-king')>=5 then
    insert into public.achievement_unlocks(player_id,achievement_id) values(new.player_id,'achievement-king') on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.award_achievement_king() from public,anon,authenticated,service_role;
create trigger award_achievement_king after insert on public.achievement_unlocks
  for each row execute function private.award_achievement_king();

create function private.require_achievement_king_equipment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true)='authenticated' and new.player_id is distinct from auth.uid() then
    raise exception 'row-level security violation' using errcode='42501';
  end if;
  if new.icon_id='achievement-king' and not exists(
    select 1 from public.achievement_unlocks where player_id=new.player_id and achievement_id='achievement-king'
  ) then raise exception 'Achievement required: achievement-king' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.require_achievement_king_equipment() from public,anon,authenticated,service_role;
create trigger require_achievement_king_equipment before insert or update of icon_id on public.player_preferences
  for each row execute function private.require_achievement_king_equipment();

create table public.daily_quest_rewards (
  player_id uuid not null references public.players(id) on delete cascade,
  quest_day date not null,
  quest_id text not null check (quest_id in ('check-in','play-3','win-1')),
  coins integer not null check ((quest_id='check-in' and coins=20) or (quest_id='play-3' and coins=60) or (quest_id='win-1' and coins=40)),
  rewarded_at timestamptz not null default now(),
  primary key(player_id,quest_day,quest_id)
);
alter table public.daily_quest_rewards enable row level security;
revoke all on public.daily_quest_rewards from public,anon,authenticated,service_role;
grant select on public.daily_quest_rewards to authenticated;
create policy "Read own daily quest rewards" on public.daily_quest_rewards for select to authenticated using ((select auth.uid())=player_id);

-- Private clock parameter makes the KST boundary testable; public callers cannot set dates or progress.
create function private.sync_daily_quests_at(p_player uuid,p_now timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  day date:=(p_now at time zone 'Asia/Seoul')::date;
  checked integer; played integer; won integer; credited integer; balance bigint;
begin
  if p_now is null or p_player is null or not exists(
    select 1 from auth.users u join public.players p on p.id=u.id
    where u.id=p_player and not coalesce(u.is_anonymous,false) and p.suspended_at is null
  ) then raise exception 'Account required' using errcode='42501'; end if;
  -- Share the purchase lock so concurrent syncs and spending cannot duplicate or lose coins.
  select w.balance into balance from public.player_wallets w where w.player_id=p_player for update;
  if not found then raise exception 'Wallet unavailable' using errcode='55000'; end if;
  checked:=case when exists(select 1 from public.player_attendance where player_id=p_player and last_day=day) then 1 else 0 end;
  select least(count(*),3)::integer,least(count(*) filter(where p.result='win'),1)::integer into played,won
    from public.match_participants p join public.matches m on m.id=p.match_id
    where p.player_id=p_player and m.achievement_eligible
      and m.ended_at >= (day::timestamp at time zone 'Asia/Seoul')
      and m.ended_at < ((day+1)::timestamp at time zone 'Asia/Seoul') and m.ended_at <= p_now;
  with awarded as (
    insert into public.daily_quest_rewards(player_id,quest_day,quest_id,coins,rewarded_at)
      select p_player,day,q.id,q.coins,p_now from (values
        ('check-in',20,checked>=1),('play-3',60,played>=3),('win-1',40,won>=1)
      ) q(id,coins,complete) where q.complete on conflict do nothing returning coins
  ) select coalesce(sum(coins),0)::integer into credited from awarded;
  if credited>0 then
    update public.player_wallets w set balance=w.balance+credited where w.player_id=p_player returning w.balance into balance;
  end if;
  return jsonb_build_object('playerId',p_player,'day',day,'nextResetAt',(day+1)::timestamp at time zone 'Asia/Seoul','balance',balance,'awarded',credited,
    'quests',(select jsonb_agg(jsonb_build_object('id',q.id,'progress',case when r.rewarded_at is not null then q.target else q.progress end,'rewardedAt',r.rewarded_at) order by q.position)
      from (values ('check-in',checked,1,1),('play-3',played,3,2),('win-1',won,1,3)) q(id,progress,target,position)
      left join public.daily_quest_rewards r on r.player_id=p_player and r.quest_day=day and r.quest_id=q.id));
end;
$$;
revoke all on function private.sync_daily_quests_at(uuid,timestamptz) from public,anon,authenticated,service_role;

create function public.sync_daily_quests() returns jsonb
language sql security definer set search_path='' as $$ select private.sync_daily_quests_at(auth.uid(),now()); $$;
revoke all on function public.sync_daily_quests() from public,anon,authenticated,service_role;
grant execute on function public.sync_daily_quests() to authenticated;

commit;
