-- 0003_spreadsheet_batches.sql
-- Per-user persistence for the "From spreadsheet" tab. That tab holds exactly
-- one batch at a time (the parsed rows + matched images for the current
-- spreadsheet), so we store it as a single JSON blob per user rather than one
-- row per design. Image bytes already live in the `designs` Storage bucket;
-- the blob only holds the parsed metadata + image URLs.
--
-- Run this in the Supabase dashboard -> SQL Editor (paste + Run), or via the
-- Supabase CLI (`supabase db push`).

-- 1. Table ------------------------------------------------------------------
create table if not exists public.spreadsheet_batches (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

comment on table public.spreadsheet_batches is
  'Per-user saved state of the From-spreadsheet tab: { spreadsheetName, rows, images }.';

-- 2. Row Level Security -----------------------------------------------------
alter table public.spreadsheet_batches enable row level security;

drop policy if exists "spreadsheet_select_own" on public.spreadsheet_batches;
create policy "spreadsheet_select_own"
  on public.spreadsheet_batches for select
  using ((select auth.uid()) = user_id);

drop policy if exists "spreadsheet_insert_own" on public.spreadsheet_batches;
create policy "spreadsheet_insert_own"
  on public.spreadsheet_batches for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "spreadsheet_update_own" on public.spreadsheet_batches;
create policy "spreadsheet_update_own"
  on public.spreadsheet_batches for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "spreadsheet_delete_own" on public.spreadsheet_batches;
create policy "spreadsheet_delete_own"
  on public.spreadsheet_batches for delete
  using ((select auth.uid()) = user_id);
