-- Public 'media' bucket for image/video saves picked from the gallery,
-- plus RLS policies. Run once in the Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Users may upload only into their own folder (path = "<uid>/<file>").
drop policy if exists "media upload own" on storage.objects;
create policy "media upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Public bucket: anyone can read the files.
drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select
  using (bucket_id = 'media');

-- Users may delete only their own files.
drop policy if exists "media delete own" on storage.objects;
create policy "media delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
