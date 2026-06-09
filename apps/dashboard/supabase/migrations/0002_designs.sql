-- 0002_designs.sql
-- Per-user persistence for AI-generated designs + listings, so a user's work
-- follows their account across browsers/devices (previously kept only in the
-- browser's memory/localStorage).
--
-- The image files themselves live in the `designs` Storage bucket; this table
-- stores the metadata/listing/config that points at them.
--
-- Run this in the Supabase dashboard -> SQL Editor (paste + Run), or via the
-- Supabase CLI (`supabase db push`).

-- 1. Table ------------------------------------------------------------------
create table if not exists public.designs (
  -- client-generated design id (nanoid). Unique per user, not globally, so the
  -- primary key is composite with user_id.
  id              text        not null,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  session_id      text,
  image_url       text        not null,
  server_filename text,
  original_name   text,
  mime            text,
  size            bigint,
  listing         jsonb,
  config          jsonb,
  status          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.designs is
  'Per-user AI-generated designs + listings. Image bytes live in the designs Storage bucket; image_url points at them.';

create index if not exists designs_user_updated_idx
  on public.designs (user_id, updated_at desc);

-- 2. Row Level Security -----------------------------------------------------
-- A user may read/write ONLY their own rows. auth.uid() comes from the
-- session, so the API routes (anon client + the user's cookie) are scoped
-- automatically — no service-role key needed.
alter table public.designs enable row level security;

drop policy if exists "designs_select_own" on public.designs;
create policy "designs_select_own"
  on public.designs for select
  using ((select auth.uid()) = user_id);

drop policy if exists "designs_insert_own" on public.designs;
create policy "designs_insert_own"
  on public.designs for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "designs_update_own" on public.designs;
create policy "designs_update_own"
  on public.designs for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "designs_delete_own" on public.designs;
create policy "designs_delete_own"
  on public.designs for delete
  using ((select auth.uid()) = user_id);
