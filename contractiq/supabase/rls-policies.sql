-- ============================================================================
-- ContractIQ — Security Foundation additions
--
-- Incremental, paste-and-run addition to database.sql for the security
-- foundation stage. Adds the rate_limit_events table used by
-- lib/security/rateLimiter.ts and re-asserts RLS is enabled on every
-- application table (idempotent — safe to re-run).
--
-- database.sql already defines full per-table RLS policies; this file only
-- adds what was missing. Run it once in the Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: rate_limit_events
-- Backs lib/security/rateLimiter.ts — sliding-window rate limiting for
-- contract upload / processing / chat. Written only via the service-role
-- (admin) client, so it deliberately has no user-facing policies: a user
-- must never be able to read, insert, or delete their own rate-limit rows.
-- ----------------------------------------------------------------------------
create table if not exists rate_limit_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  action     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_events_lookup
  on rate_limit_events (user_id, action, created_at desc);

alter table rate_limit_events enable row level security;
-- No policies added intentionally — service role only, RLS default-denies all access.

-- ----------------------------------------------------------------------------
-- Defense in depth: re-assert RLS is enabled on every existing application
-- table, in case it was ever toggled off manually in the dashboard.
-- ----------------------------------------------------------------------------
alter table contracts          enable row level security;
alter table key_terms          enable row level security;
alter table custom_key_terms   enable row level security;
alter table chat_sessions      enable row level security;
alter table chat_messages      enable row level security;
alter table user_feedback      enable row level security;
alter table term_corrections   enable row level security;

-- ============================================================================
-- End of security-foundation additions
-- ============================================================================
