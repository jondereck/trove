-- Entitlement + AI metering tables for the freemium tiers.
-- Run once in the Supabase SQL Editor.
--
-- Both tables are written only with the service-role key (rc-webhook and
-- ai-proxy Edge Functions). RLS is enabled with no policies, so the anon key
-- can neither read nor write them.

create table if not exists entitlements (
  app_user_id text primary key,
  tier text not null default 'free' check (tier in ('free', 'unlocked', 'cloud')),
  updated_at timestamptz not null default now()
);
alter table entitlements enable row level security;

create table if not exists ai_usage (
  app_user_id text not null,
  month text not null, -- 'YYYY-MM'
  count int not null default 0,
  primary key (app_user_id, month)
);
alter table ai_usage enable row level security;

-- Atomic per-month increment; returns the count after incrementing so the
-- caller can compare against the tier cap in one round trip.
create or replace function increment_ai_usage(p_app_user_id text, p_month text)
returns int
language sql
as $$
  insert into ai_usage (app_user_id, month, count)
  values (p_app_user_id, p_month, 1)
  on conflict (app_user_id, month)
  do update set count = ai_usage.count + 1
  returning count;
$$;
