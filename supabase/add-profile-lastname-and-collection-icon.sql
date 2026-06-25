-- Two columns the app now reads/writes:
--  • profiles.last_name — the Account screen edits First + Last name.
--  • collections.icon    — collections use a named Ionicon (e.g. 'folder-outline')
--                          instead of an emoji.
-- Run once in the Supabase SQL Editor.

alter table profiles
  add column if not exists last_name text;

alter table collections
  add column if not exists icon text default 'folder-outline';
