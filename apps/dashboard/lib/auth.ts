// Server-side helpers for reading the current user's profile and gating admins.
// Used by route handlers and server components (Node runtime).

import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string | null;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface SessionProfile {
  user: User | null;
  profile: Profile | null;
}

// Returns the signed-in user and their profile row (or nulls if signed out).
// Reads the user's own profile, which RLS permits.
export async function getSessionProfile(): Promise<SessionProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, approved, is_admin, created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { user, profile: profile ?? null };
}

// Returns the session+profile only if the caller is an admin, else null.
// Route handlers use this to 403 non-admins before touching the admin API.
export async function requireAdmin(): Promise<SessionProfile | null> {
  const sp = await getSessionProfile();
  if (!sp.user || !sp.profile?.is_admin) return null;
  return sp;
}
