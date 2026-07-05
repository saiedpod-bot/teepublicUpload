// Supabase client for the browser ("use client" components).
// Uses the public URL + anon key, which are safe to expose to the client.
// Falls back to a stub when env vars are missing (local dev without Supabase).

import { createBrowserClient } from "@supabase/ssr";
import { createStubClient } from "./stub";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return createStubClient();
  }

  return createBrowserClient(url, anonKey);
}
