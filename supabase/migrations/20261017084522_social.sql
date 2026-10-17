begin;
create table public.friendships (
  low_id uuid not null references public.players(id) on delete cascade,
  high_id uuid not null references public.players(id) on delete cascade,
  requested_by uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','removed')),
  created_at timestamptz not null default now(),
  primary key(low_id,high_id),
  check(low_id < high_id), check(requested_by in (low_id,high_id))
);
create index friendships_high on public.friendships(high_id);
create table public.direct_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  sender_id uuid not null references public.players(id) on delete cascade,
  recipient_id uuid not null references public.players(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 1000 and body=btrim(body)),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(sender_id,request_id), check(sender_id <> recipient_id)
);
create index direct_messages_thread on public.direct_messages(least(sender_id,recipient_id),greatest(sender_id,recipient_id),id desc);
create index direct_messages_unread on public.direct_messages(recipient_id,sender_id) where read_at is null;
create index direct_messages_rate on public.direct_messages(sender_id,created_at desc);
alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;
revoke all on public.friendships,public.direct_messages from public,anon,authenticated,service_role;
grant select on public.friendships,public.direct_messages to authenticated;
create policy "Own friendships" on public.friendships for select to authenticated using ((select auth.uid()) in (low_id,high_id));
create policy "Own messages" on public.direct_messages for select to authenticated using ((select auth.uid()) in (sender_id,recipient_id));

create function private.social_user() returns uuid language plpgsql stable security definer set search_path='' as $$
declare me uuid := auth.uid();
begin
  if not exists(select 1 from public.players p join auth.users u on u.id=p.id where p.id=me and p.suspended_at is null and not coalesce(u.is_anonymous,false)) then
    raise exception 'Account unavailable' using errcode='42501';
  end if;
  return me;
end;
$$;
revoke all on function private.social_user() from public,anon,authenticated,service_role;

-- A null search returns contacts; searches only expose public names and icons.
create function public.social_players(p_query text default null,p_target uuid default null)
returns table(id uuid,name text,icon_id text,relationship text,unread bigint)
language plpgsql stable security definer set search_path='' as $$
declare me uuid := private.social_user();
begin
  if p_query is not null and char_length(btrim(p_query)) not between 2 and 32 then
    raise exception 'Search needs 2 to 32 characters' using errcode='22023';
  end if;
  return query select p.id,p.name,coalesce(pref.icon_id,'fox'),
    case when f.status='accepted' then 'friend' when f.requested_by=me then 'outgoing' when f.requested_by is not null then 'incoming' end,
    (select count(*) from public.direct_messages m where m.recipient_id=me and m.sender_id=p.id and m.read_at is null)
  from public.players p join auth.users u on u.id=p.id
  left join public.player_preferences pref on pref.player_id=p.id
  left join public.friendships f on f.low_id=least(me,p.id) and f.high_id=greatest(me,p.id) and f.status<>'removed'
  where p.id<>me and p.suspended_at is null and not coalesce(u.is_anonymous,false)
    and case when p_target is not null then p.id=p_target
      when p_query is not null then strpos(lower(p.name),lower(btrim(p_query)))>0
      else f.low_id is not null end
  order by p.name,p.id limit case when p_query is not null then 20 else 200 end;
end;
$$;

create function public.friend_action(p_target uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid := private.social_user(); current_friend public.friendships%rowtype;
begin
  if p_target is null or p_target=me or p_action is null or p_action not in ('request','accept','remove') then
    raise exception 'Invalid friend action' using errcode='22023';
  end if;
  -- All friendship and send operations lock the same pair in a stable order.
  perform id from public.players where id in (me,p_target) order by id for update;
  if p_action<>'remove' and not exists(select 1 from public.players p join auth.users u on u.id=p.id where p.id=p_target and p.suspended_at is null and not coalesce(u.is_anonymous,false)) then
    raise exception 'Player unavailable' using errcode='42501';
  end if;
  select * into current_friend from public.friendships where low_id=least(me,p_target) and high_id=greatest(me,p_target);
  if p_action='remove' then
    update public.friendships set status='removed' where low_id=least(me,p_target) and high_id=greatest(me,p_target);
  elsif p_action='accept' then
    if current_friend.requested_by is distinct from p_target or current_friend.status='removed' then raise exception 'No incoming request' using errcode='42501'; end if;
    update public.friendships set status='accepted' where low_id=least(me,p_target) and high_id=greatest(me,p_target);
  elsif current_friend.low_id is null or current_friend.status='removed' then
    if (select count(*) from public.friendships where requested_by=me and status='pending')>=20
      or (select count(*) from public.friendships where me in (low_id,high_id) and status<>'removed')>=100
      or (select count(*) from public.friendships where p_target in (low_id,high_id) and status<>'removed')>=100 then
      raise exception 'Friend limit reached' using errcode='54000';
    end if;
    insert into public.friendships(low_id,high_id,requested_by) values(least(me,p_target),greatest(me,p_target),me)
      on conflict(low_id,high_id) do update set requested_by=me,status='pending',created_at=now();
  end if;
end;
$$;

create function public.send_direct_message(p_target uuid,p_body text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid := private.social_user();
begin
  if p_target is null or p_target=me or p_request is null or p_body is null or char_length(btrim(p_body)) not between 1 and 1000 then
    raise exception 'Invalid message' using errcode='22023';
  end if;
  perform id from public.players where id in (me,p_target) order by id for update;
  if not exists(select 1 from public.friendships where low_id=least(me,p_target) and high_id=greatest(me,p_target) and status='accepted')
    or not exists(select 1 from public.players where id=p_target and suspended_at is null) then
    raise exception 'Friends only' using errcode='42501';
  end if;
  if exists(select 1 from public.direct_messages where sender_id=me and request_id=p_request) then return; end if;
  if (select count(*) from public.direct_messages where sender_id=me and created_at>now()-interval '1 minute')>=30 then
    raise exception 'Message rate limit' using errcode='54000';
  end if;
  insert into public.direct_messages(request_id,sender_id,recipient_id,body) values(p_request,me,p_target,btrim(p_body));
end;
$$;

create function public.social_messages(p_target uuid,p_before bigint default null)
returns table(id bigint,sender_id uuid,body text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare me uuid := private.social_user();
begin
  update public.direct_messages m set read_at=now() where m.sender_id=p_target and m.recipient_id=me and m.read_at is null;
  return query select m.id,m.sender_id,m.body,m.created_at from public.direct_messages m
    where least(m.sender_id,m.recipient_id)=least(me,p_target) and greatest(m.sender_id,m.recipient_id)=greatest(me,p_target)
      and (p_before is null or m.id<p_before)
    order by m.id desc limit 50;
end;
$$;

create function public.can_spectate(p_viewer uuid,p_target uuid,p_ranked boolean) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.players p join auth.users u on u.id=p.id where p.id=p_viewer and p.suspended_at is null and not coalesce(u.is_anonymous,false))
    and exists(select 1 from public.players p where p.id=p_target and p.suspended_at is null)
    and (exists(select 1 from public.friendships where low_id=least(p_viewer,p_target) and high_id=greatest(p_viewer,p_target) and status='accepted')
      or (p_ranked and p_target in (select r.player_id from public.player_ratings r join public.rank_seasons s on s.id=r.season_id
        where s.ends_at is null and r.games_played>=10 order by r.rating desc,r.games_played desc,r.player_id limit 50)));
$$;
revoke all on function public.social_players(text,uuid),public.friend_action(uuid,text),public.send_direct_message(uuid,text,uuid),public.social_messages(uuid,bigint),public.can_spectate(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.social_players(text,uuid),public.friend_action(uuid,text),public.send_direct_message(uuid,text,uuid),public.social_messages(uuid,bigint) to authenticated;
grant execute on function public.can_spectate(uuid,uuid,boolean) to service_role;
alter publication supabase_realtime add table public.friendships,public.direct_messages;
commit;
