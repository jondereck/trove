-- Add viewed/unread tracking for saves (idempotent).
alter table public.saves
  add column if not exists is_viewed boolean not null default false;

-- Existing saves were already in the library — treat as viewed.
update public.saves set is_viewed = true where is_viewed = false;
