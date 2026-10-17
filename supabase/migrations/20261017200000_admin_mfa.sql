begin;

-- PostgREST exposes JWT claims as request.jwt.claims JSON; older runtimes and tests set request.jwt.claim.<name>.
create function private.jwt_claim(p_name text) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.' || p_name, true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> p_name
  );
$$;
revoke all on function private.jwt_claim(text) from public, anon, authenticated, service_role;

-- Administrator access requires a second factor: every admin RPC, RLS policy and the socket's
-- operations endpoint route through this check, so an aal1 session is never an administrator.
create or replace function public.is_game_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles where user_id = (select auth.uid()))
    and private.jwt_claim('aal') = 'aal2';
$$;

commit;
