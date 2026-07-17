-- ============================================================================
-- ContractIQ — Database Schema
--
-- Complete, production-ready schema derived from:
--   docs/engineering/engineering-doc.md (§7 Database Design and Schema)
--   docs/engineering/implementation-specs.md (per-feature DB schema/tasks, blocks A-H)
--
-- Paste this entire file into the Supabase SQL Editor and run it once on a
-- fresh project. Idempotent — safe to re-run (IF NOT EXISTS / OR REPLACE /
-- DROP POLICY IF EXISTS throughout).
--
-- After running this file, two manual (non-SQL) steps remain in the Supabase
-- dashboard:
--   1. Authentication -> Providers -> enable Email/Password.
--   2. Confirm Realtime is enabled for the project (this file adds
--      chat_messages to the supabase_realtime publication below).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type contract_type_enum as enum ('NDA', 'MSA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_status_enum as enum ('uploaded', 'processing', 'complete', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_role_enum as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type feedback_rating_enum as enum ('up', 'down');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- Table: contracts
-- Engineering doc §7 · Spec: pdf-upload-extraction.md, key-term-extraction.md
-- ============================================================================
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_type contract_type_enum not null,
  file_path text,
  contract_text text not null,
  status contract_status_enum not null default 'uploaded',
  page_count int not null,
  token_count int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

create index if not exists idx_contracts_user_id on contracts (user_id);
create index if not exists idx_contracts_user_created on contracts (user_id, created_at desc);

drop trigger if exists trg_contracts_updated_at on contracts;
create trigger trg_contracts_updated_at
  before update on contracts
  for each row execute function set_updated_at();

alter table contracts enable row level security;

drop policy if exists "contracts_select_own" on contracts;
create policy "contracts_select_own" on contracts
  for select using (auth.uid() = user_id);

drop policy if exists "contracts_insert_own" on contracts;
create policy "contracts_insert_own" on contracts
  for insert with check (auth.uid() = user_id);

drop policy if exists "contracts_update_own" on contracts;
create policy "contracts_update_own" on contracts
  for update using (auth.uid() = user_id);

drop policy if exists "contracts_delete_own" on contracts;
create policy "contracts_delete_own" on contracts
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Table: key_terms
-- Engineering doc §7 · Spec: key-term-extraction.md, results-display.md
-- ============================================================================
create table if not exists key_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  term_name text not null,
  value text not null,
  original_value text not null,
  page_number int not null,
  confidence_score numeric(5,2) not null check (confidence_score >= 0 and confidence_score <= 100),
  source_sentence text,
  is_edited boolean not null default false,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_key_terms_contract_id on key_terms (contract_id);

alter table key_terms enable row level security;

drop policy if exists "key_terms_select_own" on key_terms;
create policy "key_terms_select_own" on key_terms
  for select using (
    exists (select 1 from contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "key_terms_insert_own" on key_terms;
create policy "key_terms_insert_own" on key_terms
  for insert with check (
    exists (select 1 from contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "key_terms_update_own" on key_terms;
create policy "key_terms_update_own" on key_terms
  for update using (
    exists (select 1 from contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "key_terms_delete_own" on key_terms;
create policy "key_terms_delete_own" on key_terms
  for delete using (
    exists (select 1 from contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

-- ============================================================================
-- Table: custom_key_terms
-- Engineering doc §7 · Spec: custom-term-addition.md
-- ============================================================================
create table if not exists custom_key_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  term_name text not null,
  value text,
  original_value text,
  page_number int,
  confidence_score numeric(5,2) check (confidence_score >= 0 and confidence_score <= 100),
  source_sentence text,
  is_edited boolean not null default false,
  is_manual boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_custom_key_terms_contract_id on custom_key_terms (contract_id);

alter table custom_key_terms enable row level security;

drop policy if exists "custom_key_terms_select_own" on custom_key_terms;
create policy "custom_key_terms_select_own" on custom_key_terms
  for select using (
    exists (select 1 from contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "custom_key_terms_insert_own" on custom_key_terms;
create policy "custom_key_terms_insert_own" on custom_key_terms
  for insert with check (
    exists (select 1 from contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "custom_key_terms_update_own" on custom_key_terms;
create policy "custom_key_terms_update_own" on custom_key_terms
  for update using (
    exists (select 1 from contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "custom_key_terms_delete_own" on custom_key_terms;
create policy "custom_key_terms_delete_own" on custom_key_terms
  for delete using (
    exists (select 1 from contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

-- ============================================================================
-- Table: chat_sessions
-- Engineering doc §7 · Spec: contract-chat.md
-- ============================================================================
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references contracts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_contract_id on chat_sessions (contract_id);

alter table chat_sessions enable row level security;

drop policy if exists "chat_sessions_select_own" on chat_sessions;
create policy "chat_sessions_select_own" on chat_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "chat_sessions_insert_own" on chat_sessions;
create policy "chat_sessions_insert_own" on chat_sessions
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Table: chat_messages
-- Engineering doc §7 · Spec: contract-chat.md
-- ============================================================================
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role chat_role_enum not null,
  content text not null,
  page_citation int,
  context_source text check (context_source in ('contract', 'history', 'both')),
  created_at timestamptz not null default now()
);

-- Idempotent for pre-existing installs created before context_source was added.
alter table chat_messages add column if not exists context_source text;

do $$ begin
  alter table chat_messages add constraint chat_messages_context_source_check
    check (context_source in ('contract', 'history', 'both'));
exception when duplicate_object then null; end $$;

create index if not exists idx_chat_messages_session_created on chat_messages (session_id, created_at);

alter table chat_messages enable row level security;

drop policy if exists "chat_messages_select_own" on chat_messages;
create policy "chat_messages_select_own" on chat_messages
  for select using (
    exists (select 1 from chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
  );

drop policy if exists "chat_messages_insert_own" on chat_messages;
create policy "chat_messages_insert_own" on chat_messages
  for insert with check (
    exists (select 1 from chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
  );

-- Enable Realtime on chat_messages so multiple open tabs/devices stay in sync
do $$ begin
  alter publication supabase_realtime add table chat_messages;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Table: user_feedback
-- Engineering doc §7 · Spec: feedback-collection.md
-- ============================================================================
create table if not exists user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  rating feedback_rating_enum not null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_feedback_contract_id on user_feedback (contract_id);

alter table user_feedback enable row level security;

drop policy if exists "user_feedback_select_own" on user_feedback;
create policy "user_feedback_select_own" on user_feedback
  for select using (auth.uid() = user_id);

drop policy if exists "user_feedback_insert_own" on user_feedback;
create policy "user_feedback_insert_own" on user_feedback
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Table: term_corrections (feedback / eval loop)
-- Engineering doc §7 · Spec: results-display.md
-- ============================================================================
create table if not exists term_corrections (
  id uuid primary key default gen_random_uuid(),
  key_term_id uuid references key_terms(id) on delete cascade,
  custom_key_term_id uuid references custom_key_terms(id) on delete cascade,
  original_value text not null,
  corrected_value text not null,
  corrected_at timestamptz not null default now(),
  constraint term_corrections_one_target check (
    (key_term_id is not null and custom_key_term_id is null) or
    (key_term_id is null and custom_key_term_id is not null)
  )
);

create index if not exists idx_term_corrections_key_term_id on term_corrections (key_term_id);
create index if not exists idx_term_corrections_custom_key_term_id on term_corrections (custom_key_term_id);

alter table term_corrections enable row level security;

drop policy if exists "term_corrections_select_own" on term_corrections;
create policy "term_corrections_select_own" on term_corrections
  for select using (
    exists (
      select 1 from key_terms kt join contracts c on c.id = kt.contract_id
      where kt.id = term_corrections.key_term_id and c.user_id = auth.uid()
    )
    or exists (
      select 1 from custom_key_terms ckt join contracts c on c.id = ckt.contract_id
      where ckt.id = term_corrections.custom_key_term_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "term_corrections_insert_own" on term_corrections;
create policy "term_corrections_insert_own" on term_corrections
  for insert with check (
    exists (
      select 1 from key_terms kt join contracts c on c.id = kt.contract_id
      where kt.id = term_corrections.key_term_id and c.user_id = auth.uid()
    )
    or exists (
      select 1 from custom_key_terms ckt join contracts c on c.id = ckt.contract_id
      where ckt.id = term_corrections.custom_key_term_id and c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Storage: contracts bucket
-- Engineering doc §7 · Spec: pdf-upload-extraction.md
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- Path convention: contracts/{user_id}/{contract_id}/{filename}.pdf
-- storage.foldername(name) splits the object path into an array of folder
-- segments — [1] is the {user_id} segment.

drop policy if exists "contracts_bucket_insert_own" on storage.objects;
create policy "contracts_bucket_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "contracts_bucket_select_own" on storage.objects;
create policy "contracts_bucket_select_own" on storage.objects
  for select using (
    bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "contracts_bucket_delete_own" on storage.objects;
create policy "contracts_bucket_delete_own" on storage.objects
  for delete using (
    bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- Table: rate_limit_events
-- Security foundation · Spec: supabase/rls-policies.sql
-- Backs lib/security/rateLimiter.ts. Written only via the service-role
-- (admin) client — no user-facing policies, RLS default-denies everything.
-- ============================================================================
create table if not exists rate_limit_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  action     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_events_lookup
  on rate_limit_events (user_id, action, created_at desc);

alter table rate_limit_events enable row level security;

-- ============================================================================
-- End of schema
-- ============================================================================
