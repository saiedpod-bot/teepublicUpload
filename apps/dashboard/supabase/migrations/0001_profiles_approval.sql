-- 0001_profiles_approval.sql
-- Admin-approval system for Supabase Auth.
--
-- Every auth user automatically gets a public.profiles row with approved=false.
-- The app blocks unapproved users (see middleware) until an admin flips
-- approved=true from the admin dashboard.
--
-- Run this in the Supabase dashboard -> SQL Editor (paste + Run), or via the
-- Supabase CLI (`supabase db push`).

-- 1. Profiles table ---------------------------------------------------------
create table if not exists public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  email      text,
  approved   boolean     not null default false,
  is_admin   boolean     not null default false,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user app metadata. approved gates app access; is_admin grants the admin dashboard.';

-- 2. Auto-create a profile when a new auth user signs up --------------------
-- security definer so the insert runs regardless of the caller''s RLS context.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if the user later changes their email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- 3. Backfill profiles for users who signed up before this migration --------
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 4. Row Level Security -----------------------------------------------------
alter table public.profiles enable row level security;

-- Users may read ONLY their own profile. There are deliberately NO insert /
-- update / delete policies for regular users, so those operations are denied
-- by default — a user can never approve themselves. Writes happen only via:
--   * the signup trigger above (security definer), and
--   * the admin API routes, which use the service-role key (bypasses RLS).
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
  on public.profiles
  for select
  using ((select auth.uid()) = id);

-- 5. Bootstrap your first admin --------------------------------------------
-- Sign up once with your own email, then edit the address below and run this
-- statement ONCE to make yourself an approved admin.
--
--   update public.profiles
--     set is_admin = true, approved = true
--     where email = 'atttfire@gmail.com';
