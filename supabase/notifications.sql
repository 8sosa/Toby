-- Toby notifications setup.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- (It only adds to the database; your existing data is untouched.)

-- Each phone or browser that turned on notifications.
create table if not exists public.push_subscriptions (
  endpoint     text        primary key,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  subscription jsonb       not null,
  time_zone    text        not null default 'UTC',
  updated_at   timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Read own subscriptions" on public.push_subscriptions;
create policy "Read own subscriptions" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Add own subscriptions" on public.push_subscriptions;
create policy "Add own subscriptions" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own subscriptions" on public.push_subscriptions;
create policy "Update own subscriptions" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Remove own subscriptions" on public.push_subscriptions;
create policy "Remove own subscriptions" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Remembers which notifications were already sent, so nothing arrives twice.
-- Only the server touches this table (no policies = no access from the app).
create table if not exists public.notify_log (
  user_id uuid        not null references auth.users (id) on delete cascade,
  ref     text        not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, ref)
);

alter table public.notify_log enable row level security;
