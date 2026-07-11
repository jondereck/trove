-- Pin saves and collections to the top of Library / Collections lists.
-- Run once in the Supabase SQL Editor.

alter table saves
  add column if not exists is_pinned boolean not null default false;

alter table collections
  add column if not exists is_pinned boolean not null default false;
