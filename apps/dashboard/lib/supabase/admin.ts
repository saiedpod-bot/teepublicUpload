// Service-role Supabase client. SERVER-ONLY — uses the secret service-role key,
// which bypasses Row Level Security and can call the Auth admin API.
//
// NEVER import this into a "use client" component, and never expose
// SUPABASE_SERVICE_ROLE_KEY to the browser (no NEXT_PUBLIC_ prefix).

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
