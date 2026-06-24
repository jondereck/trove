-- Adds the is_favorite flag used by the Library "Favorites" filter chip
-- and the star toggle on the save detail screen.
-- Run once in the Supabase SQL Editor.

alter table saves
  add column if not exists is_favorite boolean not null default false;
