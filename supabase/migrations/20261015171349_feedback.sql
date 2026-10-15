begin;

create table public.feedback (
  id uuid primary key,
  reporter_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('bug', 'feedback')),
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  created_at timestamptz not null default now()
);
create index feedback_recent on public.feedback(created_at desc, id desc);
create index feedback_reporter on public.feedback(reporter_id);
alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated, service_role;
grant select on public.feedback to authenticated;
grant select, insert, delete on public.feedback to service_role;
create policy "Administrators read feedback" on public.feedback for select to authenticated
  using ((select public.is_game_admin()));
create policy "Server stores feedback" on public.feedback for insert to service_role with check (true);
create policy "Server reads feedback" on public.feedback for select to service_role using (true);
create policy "Server cleans up feedback" on public.feedback for delete to service_role using (true);

commit;
