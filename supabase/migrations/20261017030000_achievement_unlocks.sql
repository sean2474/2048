begin;

create table public.player_attendance (
  player_id uuid primary key references public.players(id) on delete cascade,
  last_day date not null,
  streak integer not null check (streak > 0),
  best_streak integer not null check (best_streak >= streak)
);
create table public.achievement_unlocks (
  player_id uuid not null references public.players(id) on delete cascade,
  achievement_id text not null check (achievement_id in ('checkin-7','checkin-30','wins-10','tile-2048-reward')),
  unlocked_at timestamptz not null default now(),
  primary key (player_id, achievement_id)
);
alter table public.player_attendance enable row level security;
alter table public.achievement_unlocks enable row level security;
revoke all on public.player_attendance, public.achievement_unlocks from public, anon, authenticated, service_role;
grant select on public.player_attendance, public.achievement_unlocks to authenticated;
create policy "Read own attendance" on public.player_attendance for select to authenticated using ((select auth.uid()) = player_id);
create policy "Read own achievement rewards" on public.achievement_unlocks for select to authenticated using ((select auth.uid()) = player_id);

-- Snapshot qualification so deleting an opponent cannot erase an earned milestone.
alter table public.matches add column achievement_eligible boolean not null default false;
update public.matches m set achievement_eligible = true
where m.mode='ranked' or (m.mode='casual' and exists (
  select 1 from public.match_participants a join public.match_participants b on b.match_id=a.match_id and b.slot=2
  join auth.users ua on ua.id=a.player_id join auth.users ub on ub.id=b.player_id
  where a.match_id=m.id and a.slot=1 and a.player_id<>b.player_id
    and not coalesce(ua.is_anonymous,false) and not coalesce(ub.is_anonymous,false)
));
create index match_participants_achievement_wins on public.match_participants(player_id,match_id) where result='win';
create index match_participants_achievement_tile on public.match_participants(player_id,max_tile desc,match_id);

create function private.achievement_progress(p_player uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'wins', (select count(*) from (
      select 1 from public.match_participants p join public.matches m on m.id=p.match_id
      where p.player_id=p_player and p.result='win' and m.achievement_eligible limit 10
    ) wins),
    'highestTile', coalesce((select p.max_tile from public.match_participants p join public.matches m on m.id=p.match_id
      where p.player_id=p_player and m.achievement_eligible order by p.max_tile desc limit 1),0)
  );
$$;
revoke all on function private.achievement_progress(uuid) from public,anon,authenticated,service_role;

create function private.award_match_achievements(p_player uuid) returns void
language plpgsql security definer set search_path='' as $$
declare progress jsonb;
begin
  progress:=private.achievement_progress(p_player);
  insert into public.achievement_unlocks(player_id,achievement_id)
    select p_player, milestone.id from (values
      ('wins-10',(progress->>'wins')::integer>=10),
      ('tile-2048-reward',(progress->>'highestTile')::integer>=2048)
    ) milestone(id,earned) where milestone.earned on conflict do nothing;
end;
$$;
revoke all on function private.award_match_achievements(uuid) from public,anon,authenticated,service_role;

do $$
declare player uuid;
begin
  for player in select distinct p.player_id from public.match_participants p join public.matches m on m.id=p.match_id
    where m.achievement_eligible and p.player_id is not null loop
    perform private.award_match_achievements(player);
  end loop;
end;
$$;

-- Preserve telemetry validation and the existing ranked result transaction.
alter function public.record_match(uuid,timestamptz,timestamptz,text,smallint,jsonb,text) set schema private;
alter function private.record_match(uuid,timestamptz,timestamptz,text,smallint,jsonb,text) rename to record_match_with_telemetry;
revoke all on function private.record_match_with_telemetry(uuid,timestamptz,timestamptz,text,smallint,jsonb,text) from public,anon,authenticated,service_role;
create function public.record_match(
  p_id uuid,p_started_at timestamptz,p_ended_at timestamptz,p_reason text,p_winner_slot smallint,p_participants jsonb,p_mode text default 'casual'
) returns boolean language plpgsql security definer set search_path='' as $$
declare first_id uuid; second_id uuid; eligible boolean;
begin
  first_id:=(p_participants->0->>'userId')::uuid;
  second_id:=(p_participants->1->>'userId')::uuid;
  eligible:=coalesce(p_mode in ('casual','ranked') and first_id is not null and second_id is not null and first_id<>second_id
    and exists(select 1 from auth.users where id=first_id and not coalesce(is_anonymous,false))
    and exists(select 1 from auth.users where id=second_id and not coalesce(is_anonymous,false)),false);
  -- Rank rollover always takes this lock before account locks.
  if p_mode='ranked' then perform pg_advisory_xact_lock(2048,17); end if;
  if eligible then
    perform id from public.players where id in (first_id,second_id) order by id for update;
  end if;
  if not private.record_match_with_telemetry(p_id,p_started_at,p_ended_at,p_reason,p_winner_slot,p_participants,p_mode) then return false; end if;
  if eligible then
    update public.matches set achievement_eligible=true where id=p_id;
    perform private.award_match_achievements(first_id);
    perform private.award_match_achievements(second_id);
  end if;
  return true;
end;
$$;
revoke all on function public.record_match(uuid,timestamptz,timestamptz,text,smallint,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_match(uuid,timestamptz,timestamptz,text,smallint,jsonb,text) to service_role;

create function public.achievement_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare player uuid:=auth.uid(); day date:=(now() at time zone 'Asia/Seoul')::date; attendance public.player_attendance%rowtype;
begin
  if player is null or not exists(select 1 from auth.users where id=player and not coalesce(is_anonymous,false)) then
    raise exception 'Account required' using errcode='42501';
  end if;
  select * into attendance from public.player_attendance where player_id=player;
  return private.achievement_progress(player) || jsonb_build_object(
    'attendance',jsonb_build_object('streak',case when attendance.last_day>=day-1 then attendance.streak else 0 end,
      'bestStreak',coalesce(attendance.best_streak,0),'lastDay',attendance.last_day,'today',day,
      'checkedInToday',coalesce(attendance.last_day=day,false),'nextCheckInAt',(day+1)::timestamp at time zone 'Asia/Seoul'),
    'unlocks',coalesce((select jsonb_agg(jsonb_build_object('achievementId',achievement_id,'unlockedAt',unlocked_at) order by achievement_id)
      from public.achievement_unlocks where player_id=player),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.achievement_state() from public,anon,authenticated,service_role;
grant execute on function public.achievement_state() to authenticated;

-- The clock-in helper is private so tests can cover midnight without accepting client dates.
create function private.check_in_at(p_player uuid,p_now timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare day date:=(p_now at time zone 'Asia/Seoul')::date; current_streak integer;
begin
  if p_player is null or p_now is null or not exists(select 1 from auth.users where id=p_player and not coalesce(is_anonymous,false)) then
    raise exception 'Account required' using errcode='42501';
  end if;
  insert into public.player_attendance(player_id,last_day,streak,best_streak) values(p_player,day,1,1)
    on conflict(player_id) do update set
      last_day=greatest(public.player_attendance.last_day,excluded.last_day),
      streak=case when public.player_attendance.last_day>=day then public.player_attendance.streak
        when public.player_attendance.last_day=day-1 then public.player_attendance.streak+1 else 1 end,
      best_streak=greatest(public.player_attendance.best_streak,
        case when public.player_attendance.last_day=day-1 then public.player_attendance.streak+1 else 1 end)
    returning streak into current_streak;
  insert into public.achievement_unlocks(player_id,achievement_id,unlocked_at)
    select p_player,milestone.id,p_now from (values ('checkin-7',current_streak>=7),('checkin-30',current_streak>=30)) milestone(id,earned)
    where milestone.earned on conflict do nothing;
end;
$$;
revoke all on function private.check_in_at(uuid,timestamptz) from public,anon,authenticated,service_role;
create function public.check_in() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.check_in_at(auth.uid(),now());
  return public.achievement_state();
end;
$$;
revoke all on function public.check_in() from public,anon,authenticated,service_role;
grant execute on function public.check_in() to authenticated;

alter table public.player_preferences drop constraint player_preferences_skin_id_check,
  add constraint player_preferences_skin_id_check check (skin_id in (
    'classic','slate','paper','confetti','gingham','meadow','tide','kitty','bunny','charcoal','espresso','pinstripe','weave',
    'runes','aurora','obsidian','astral','sentinel','runeknight','arcanist','dawn-oath','rune-sanctum'
  ));
alter table public.player_preferences drop constraint player_preferences_icon_id_check,
  add constraint player_preferences_icon_id_check check (icon_id in ('fox','owl','dragon','cat','rabbit','robot','attendance-king','victory-vanguard'));
create function private.require_achievement_equipment() returns trigger
language plpgsql security definer set search_path='' as $$
declare required text;
begin
  -- BEFORE INSERT runs before RLS WITH CHECK; do not reveal another player's unlocks.
  if current_setting('role',true)='authenticated' and new.player_id is distinct from auth.uid() then
    raise exception 'row-level security violation' using errcode='42501';
  end if;
  for required in select reward.id from (values
    ('checkin-7',new.skin_id='dawn-oath'),('checkin-30',new.icon_id='attendance-king'),
    ('wins-10',new.icon_id='victory-vanguard'),('tile-2048-reward',new.skin_id='rune-sanctum')
  ) reward(id,equipped) where reward.equipped loop
    if not exists(select 1 from public.achievement_unlocks where player_id=new.player_id and achievement_id=required) then
      raise exception 'Achievement required: %',required using errcode='42501';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.require_achievement_equipment() from public,anon,authenticated,service_role;
create trigger require_achievement_equipment before insert or update of skin_id,icon_id on public.player_preferences
  for each row execute function private.require_achievement_equipment();

commit;
