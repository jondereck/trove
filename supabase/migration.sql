-- ============================================================
-- Trove — Complete Database Setup
-- Paste into Supabase SQL Editor and click Run.
-- Safe to re-run (fully idempotent).
--
-- Dashboard: https://supabase.com/dashboard/project/xullagcvhnenwpschjig/sql/new
-- ============================================================


-- 0. Extensions -----------------------------------------------

create extension if not exists pg_trgm;


-- 1. Tables ---------------------------------------------------

create table if not exists public.collections (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  emoji       text        not null default '📁',
  color       text        not null default '#c0613c',
  description text,
  created_at  timestamptz not null default now(),

  -- Prevents duplicate collection names per user
  -- (also makes upsertCollectionByName safe under concurrency)
  unique (user_id, name)
);

create table if not exists public.saves (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  url           text,
  title         text        not null,
  description   text,
  type          text        not null default 'link'
                            check (type in ('link', 'image', 'video', 'note')),
  content       text,
  image_url     text,
  collection_id uuid        references public.collections(id) on delete set null,
  tags          text[]      not null default '{}',
  is_inbox      boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- Stores the user's display name and avatar.
-- A row is auto-created for every new signup via the trigger below.
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  first_name  text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);


-- 2. Indexes --------------------------------------------------
-- Composite indexes match the exact WHERE + ORDER BY used in db.ts queries.

-- fetchLibrarySaves / fetchInboxSaves: WHERE user_id = ? AND is_inbox = ?
create index if not exists saves_user_inbox_idx
  on public.saves (user_id, is_inbox);

-- ORDER BY created_at DESC on all list queries
create index if not exists saves_user_created_idx
  on public.saves (user_id, created_at desc);

-- Join / filter by collection_id (fetchCollections count query)
create index if not exists saves_collection_id_idx
  on public.saves (collection_id);

-- fetchCollections: WHERE user_id = ?
create index if not exists collections_user_id_idx
  on public.collections (user_id);

-- searchSaves: ilike on title, description, content
-- Concatenates all three into one GIN index so a single scan covers all fields.
create index if not exists saves_search_idx
  on public.saves
  using gin (
    (
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(content, '')
    ) gin_trgm_ops
  );


-- 3. Row Level Security ---------------------------------------

alter table public.saves       enable row level security;
alter table public.collections enable row level security;
alter table public.profiles    enable row level security;

-- Drop before recreating so this script is re-runnable
drop policy if exists "own saves"       on public.saves;
drop policy if exists "own collections" on public.collections;
drop policy if exists "own profile"     on public.profiles;

-- using()      → guards SELECT, UPDATE, DELETE
-- with check() → guards INSERT (prevents writing rows for other users)
create policy "own saves" on public.saves
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own collections" on public.collections
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own profile" on public.profiles
  for all
  using      (auth.uid() = id)
  with check (auth.uid() = id);


-- 4. Auto-create profile on signup ----------------------------
-- When a user signs up, Supabase inserts into auth.users.
-- This trigger immediately creates their profiles row so the
-- app never needs to do it manually.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
