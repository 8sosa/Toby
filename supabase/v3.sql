-- Toby update 3: people, meetings, projects, bills, savings, health, shared lists and Siri.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Your existing data is untouched.

-- 1. Allow the new sections (people, meetings, projects, bills, savings, health) in user_data.
alter table public.user_data drop constraint if exists user_data_key_check;
alter table public.user_data add constraint user_data_key_check check (key ~ '^[a-z_]{1,32}$');

-- 2. Lists (shopping, reading, watch...). One row per list, one row per item,
--    so you and family can tick items at the same time without overwriting each other.
create table if not exists public.lists (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 60),
  position    int         not null default 0,
  share_token text        unique,
  created_at  timestamptz not null default now()
);
create table if not exists public.list_items (
  id         uuid        primary key default gen_random_uuid(),
  list_id    uuid        not null references public.lists (id) on delete cascade,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  text       text        not null check (char_length(text) between 1 and 300),
  done       boolean     not null default false,
  added_by   text,
  created_at timestamptz not null default now()
);
create index if not exists list_items_list on public.list_items (list_id);

alter table public.lists enable row level security;
alter table public.list_items enable row level security;

drop policy if exists "Own lists" on public.lists;
create policy "Own lists" on public.lists
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Own list items" on public.list_items;
create policy "Own list items" on public.list_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );

-- 3. Inbox: things you add with Siri or the Share Sheet wait here until Toby opens.
create table if not exists public.inbox (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null,
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);
alter table public.inbox enable row level security;
drop policy if exists "Read own inbox" on public.inbox;
create policy "Read own inbox" on public.inbox
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Clear own inbox" on public.inbox;
create policy "Clear own inbox" on public.inbox
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 4. Keys for Siri / Shortcuts. Only a fingerprint (hash) of each key is stored.
create table if not exists public.api_tokens (
  token_hash text        primary key,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  label      text        not null default 'Shortcuts',
  created_at timestamptz not null default now(),
  last_used  timestamptz
);
alter table public.api_tokens enable row level security;
drop policy if exists "Own keys" on public.api_tokens;
create policy "Own keys" on public.api_tokens
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 5. Live updates for lists and the inbox.
do $$
begin
  begin alter publication supabase_realtime add table public.lists;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.list_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.inbox;      exception when duplicate_object then null; end;
end $$;
