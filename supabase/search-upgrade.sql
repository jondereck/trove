-- ============================================================
-- Trove — Search upgrade (ranked keyword search)
-- Paste into Supabase SQL Editor and click Run.
-- Safe to re-run (fully idempotent).
--
-- Adds a ranked search_saves(terms) function used by
-- lib/cloudDb.ts searchSaves. Every term must match at least
-- one field (AND across terms, OR across fields). Results are
-- scored: title 4, tags 3, description/content 2, url 1 per
-- matching term, ties broken by newest first.
-- ============================================================


-- 1. Tags trigram index ---------------------------------------
-- Enables fast partial tag matching via ilike on the joined
-- tag list (e.g. "des" finds tag "design"). Expression must be
-- immutable, hence the wrapper.

create or replace function public.tags_to_text(tags text[])
returns text
language sql
immutable
as $$
  select coalesce(array_to_string(tags, ' '), '')
$$;

create index if not exists saves_tags_search_idx
  on public.saves
  using gin (public.tags_to_text(tags) gin_trgm_ops);


-- 2. Ranked search function -----------------------------------
-- SECURITY INVOKER (default): RLS on public.saves still applies,
-- so callers only ever see their own rows.

create or replace function public.search_saves(terms text[])
returns setof public.saves
language sql
stable
as $$
  select s.*
  from public.saves s
  where (
    select bool_and(
      s.title ilike '%' || t || '%'
      or coalesce(s.description, '') ilike '%' || t || '%'
      or coalesce(s.content, '') ilike '%' || t || '%'
      or coalesce(s.url, '') ilike '%' || t || '%'
      or public.tags_to_text(s.tags) ilike '%' || t || '%'
      or exists (
        select 1 from unnest(s.tags) tag
        where tag ilike '%' || t || '%'
      )
    )
    from unnest(terms) as t
  )
  order by
    (
      select sum(
        case when s.title ilike '%' || t || '%' then 4 else 0 end
        + case when public.tags_to_text(s.tags) ilike '%' || t || '%' then 3 else 0 end
        + case when coalesce(s.description, '') ilike '%' || t || '%' then 2 else 0 end
        + case when coalesce(s.content, '') ilike '%' || t || '%' then 2 else 0 end
        + case when coalesce(s.url, '') ilike '%' || t || '%' then 1 else 0 end
      )
      from unnest(terms) as t
    ) desc,
    s.created_at desc
  limit 50
$$;
