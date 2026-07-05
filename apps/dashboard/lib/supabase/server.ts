// Supabase client for the Node runtime (route handlers + server components).
// Reads/writes the auth cookies through Next's cookie store so sessions persist.
// Env: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.local).
// When env vars are missing, returns a stub client (local dev without Supabase).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createStubClient } from "./stub";

export async function createClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return createStubClient();
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
          }
        },
      },
    },
  );
}
