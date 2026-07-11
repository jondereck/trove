-- Optional custom cover for a collection card.
-- When null, the app falls back to the 3 most recent save thumbnails.
-- Run once in the Supabase SQL Editor.

alter table collections
  add column if not exists cover_image_url text;
