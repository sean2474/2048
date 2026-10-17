begin;
create or replace function public.social_players(p_query text default null,p_target uuid default null)
returns table(id uuid,name text,icon_id text,relationship text,unread bigint)
language plpgsql stable security definer set search_path='' as $$
declare me uuid := private.social_user();
begin
  if p_query is not null and char_length(btrim(p_query)) not between 1 and 32 then
    raise exception 'Search needs 1 to 32 characters' using errcode='22023';
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
commit;
