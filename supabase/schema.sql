-- Chief of Staff database setup.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

-- One row per section of the app (tasks, habits, journal, money, notes, settings) per person.
create table if not exists public.user_data (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null check (key in ('tasks', 'habits', 'journal', 'money', 'notes', 'settings')),
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Row-level security: each signed-in person can only ever see and change their own rows.
alter table public.user_data enable row level security;

drop policy if exists "Read own data" on public.user_data;
create policy "Read own data" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Insert own data" on public.user_data;
create policy "Insert own data" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own data" on public.user_data;
create policy "Update own data" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own data" on public.user_data;
create policy "Delete own data" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Live updates: lets an open app on one device see changes made on another right away.
do $$
begin
  alter publication supabase_realtime add table public.user_data;
exception when duplicate_object then null;
end $$;
