begin;

-- Upgraded databases already removed static catalog constraints. Do not replay the old daily migration.
do $daily$ begin
  if to_regclass('public.daily_quest_rewards') is null then
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
  end if;
end; $daily$;

create or replace function private.sync_daily_quests_at(p_player uuid,p_now timestamptz) returns jsonb
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

create or replace function public.sync_daily_quests() returns jsonb
language sql security definer set search_path='' as $$ select private.sync_daily_quests_at(auth.uid(),now()); $$;
revoke all on function public.sync_daily_quests() from public,anon,authenticated,service_role;
grant execute on function public.sync_daily_quests() to authenticated;


-- Catalog rules supersede the fixed five-achievement legacy trigger and equipment guard.
drop trigger if exists award_achievement_king on public.achievement_unlocks;
drop trigger if exists require_achievement_king_equipment on public.player_preferences;

insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once)
values('icon','achievement-king',0,'achievement','{"id":"achievement-king","name":"Achievement King","nameKo":"업적왕","description":"Unlock five other achievements.","color":"#9c7540","imagePath":"profile-icons/achievement-king.svg","sortOrder":22}'::jsonb,'published',true)
on conflict(kind,item_id) do update set definition=excluded.definition,status=excluded.status,published_once=true,legacy=false,updated_at=now()
where private.cosmetic_catalog.legacy and private.cosmetic_catalog.revision=1;
update private.cosmetic_catalog set legacy=false where kind='icon' and item_id='achievement-king' and legacy;
insert into private.achievement_catalog(item_id,definition,status,published_once)
values('achievement-king','{"id":"achievement-king","name":"Achievement king","nameKo":"업적왕","description":"Unlock 5 other achievements.","descriptionKo":"다른 업적 5개 달성","metric":"achievements","target":5,"reward":{"kind":"icon","iconId":"achievement-king"},"sortOrder":18}'::jsonb,'published',true)
on conflict(item_id) do nothing;

create or replace function public.admin_save_achievement(p_item jsonb,p_expected_revision integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing private.achievement_catalog; saved private.achievement_catalog; item jsonb; reward jsonb; entry record;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('catalog'),0);
 if not private.catalog_valid_metadata(p_item) then raise exception 'Invalid achievement' using errcode='22023';end if;
 if p_expected_revision is null or p_expected_revision<0
 or exists(select 1 from jsonb_object_keys(p_item) k where k not in('id','name','nameKo','description','descriptionKo','status','sortOrder','metric','target','reward'))
 or coalesce(p_item->>'metric','') not in('attendance_streak','wins','highest_tile','rank_tier','solo_time','solo_tile','achievements')
 or jsonb_typeof(p_item->'target') is distinct from 'number' or jsonb_typeof(p_item->'reward') is distinct from 'object' then raise exception 'Invalid achievement' using errcode='22023';end if;
 if (p_item->>'target')::numeric not between 1 and 1000000000 or (p_item->>'target')::numeric<>trunc((p_item->>'target')::numeric)
 or (p_item->>'metric'='rank_tier' and (p_item->>'target')::numeric>6) then raise exception 'Invalid achievement target' using errcode='22023';end if;
 reward:=p_item->'reward';
 if coalesce(reward->>'kind','') not in('skin','icon','set')
 or exists(select 1 from jsonb_object_keys(reward) k where k not in('kind','skinId','iconId'))
 or ((reward->>'kind' in('skin','set'))<>(reward?'skinId')) or ((reward->>'kind' in('icon','set'))<>(reward?'iconId')) then raise exception 'Invalid achievement reward' using errcode='22023';end if;
 for entry in select * from(values('skin',reward->>'skinId'),('icon',reward->>'iconId')) x(kind,id) where id is not null loop
   if entry.id!~'^[a-z0-9][a-z0-9-]{0,63}$' or not exists(select 1 from private.cosmetic_catalog where kind=entry.kind and item_id=entry.id and acquisition='achievement' and (p_item->>'status'<>'published' or status='published')) then raise exception 'Invalid achievement reward' using errcode='22023';end if;
 end loop;
 if (reward?'skinId' and jsonb_typeof(reward->'skinId') is distinct from 'string') or (reward?'iconId' and jsonb_typeof(reward->'iconId') is distinct from 'string') then raise exception 'Invalid achievement reward' using errcode='22023';end if;
 select * into existing from private.achievement_catalog where item_id=p_item->>'id' for update;
 if coalesce(existing.revision,0)<>p_expected_revision then raise exception 'Catalog changed; reload before saving' using errcode='40001';end if;
 if existing.published_once and existing.definition->'reward' is distinct from reward then raise exception 'Published reward cannot change' using errcode='22023';end if;
 if existing.published_once and p_item->>'status'='draft' then raise exception 'Published achievements can be archived, not drafted' using errcode='22023';end if;
 item:=jsonb_build_object('description','','sortOrder',0)||p_item;
 insert into private.achievement_catalog(item_id,definition,status,published_once) values(item->>'id',item,item->>'status',item->>'status'='published')
 on conflict(item_id) do update set definition=excluded.definition,status=excluded.status,revision=private.achievement_catalog.revision+1,
 published_once=private.achievement_catalog.published_once or excluded.published_once,updated_at=now() returning * into saved;
 insert into private.catalog_audit(actor_id,kind,item_id,previous,current) values(auth.uid(),'achievement',saved.item_id,case when existing.item_id is not null then private.catalog_achievement_json(existing) end,private.catalog_achievement_json(saved));
 return private.catalog_achievement_json(saved);
end;$$;

create or replace function private.catalog_metric(p_player uuid,p_metric text) returns bigint language plpgsql security definer set search_path='' as $$
begin
 return case p_metric when 'attendance_streak' then coalesce((select best_streak from public.player_attendance where player_id=p_player),0)
 when 'wins' then (private.achievement_progress(p_player)->>'wins')::bigint
 when 'highest_tile' then (private.achievement_progress(p_player)->>'highestTile')::bigint
 when 'rank_tier' then private.highest_rank(p_player)
 when 'solo_time' then coalesce((private.achievement_progress(p_player)->>'soloBestMs')::bigint,0)
 when 'solo_tile' then coalesce((private.achievement_progress(p_player)->>'soloHighestTile')::bigint,0) when 'achievements' then coalesce((private.achievement_progress(p_player)->>'achievementCount')::bigint,0) else 0 end;
end;$$;
create or replace function private.award_catalog_achievements(p_player uuid) returns void language plpgsql security definer set search_path='' as $$
declare progress jsonb; streak integer; reached integer;
begin
 if not exists(select 1 from auth.users where id=p_player and not coalesce(is_anonymous,false)) then return;end if;
 progress:=private.achievement_progress(p_player);reached:=private.highest_rank(p_player);
 select coalesce(best_streak,0) into streak from public.player_attendance where player_id=p_player;
 insert into public.achievement_unlocks(player_id,achievement_id)
 select p_player,item_id from private.achievement_catalog c where status='published'
 and not exists(select 1 from public.achievement_unlocks u where u.player_id=p_player and u.achievement_id=c.item_id) and
 case when definition->>'metric'='solo_time' then coalesce((progress->>'soloBestMs')::bigint,0)>0 and (progress->>'soloBestMs')::bigint<=(definition->>'target')::bigint
 else case definition->>'metric' when 'attendance_streak' then coalesce(streak,0) when 'wins' then (progress->>'wins')::bigint
 when 'highest_tile' then (progress->>'highestTile')::bigint when 'rank_tier' then reached when 'solo_tile' then coalesce((progress->>'soloHighestTile')::bigint,0) when 'achievements' then coalesce((progress->>'achievementCount')::bigint,0) else 0 end >=(definition->>'target')::bigint end
 on conflict do nothing;
end;$$;

create or replace function private.award_collection_achievements() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Collection rewards cannot count themselves or recursively unlock another collection reward.
  if exists(select 1 from private.achievement_catalog where item_id=new.achievement_id and definition->>'metric'='achievements') then return new; end if;
  if not exists(select 1 from auth.users where id=new.player_id and not coalesce(is_anonymous,false)) then return new; end if;
  perform id from public.players where id=new.player_id for no key update;
  insert into public.achievement_unlocks(player_id,achievement_id)
    select new.player_id,c.item_id from private.achievement_catalog c
    where c.status='published' and c.definition->>'metric'='achievements'
      and private.catalog_metric(new.player_id,'achievements') >= (c.definition->>'target')::bigint
    on conflict do nothing;
  return new;
end; $$;
revoke all on function private.award_collection_achievements() from public,anon,authenticated,service_role;
drop trigger if exists award_collection_achievements on public.achievement_unlocks;
create trigger award_collection_achievements after insert on public.achievement_unlocks for each row execute function private.award_collection_achievements();

-- Preserve all earned unlocks; only add missing collection rewards for existing eligible players.
insert into public.achievement_unlocks(player_id,achievement_id)
  select u.id,c.item_id from auth.users u cross join private.achievement_catalog c
  where not coalesce(u.is_anonymous,false) and c.status='published' and c.definition->>'metric'='achievements'
    and private.catalog_metric(u.id,'achievements') >= (c.definition->>'target')::bigint
  on conflict do nothing;

commit;
