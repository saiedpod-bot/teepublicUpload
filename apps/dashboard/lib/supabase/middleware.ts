// Session refresh + route gating for the Edge middleware.
//
// On every matched request we:
//   1. Refresh the Supabase session and write any rotated auth cookies.
//   2. Gate access:
//        - signed out          -> /login (with ?next=)
//        - signed in, pending  -> /pending  (approved=false)
//        - signed in, approved -> full app
//        - /admin/*            -> admins only
//
// IMPORTANT: use supabase.auth.getUser() (not getSession()) in middleware — it
// revalidates the token with Supabase instead of trusting the cookie.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LOGIN_PATH = "/login";
const PENDING_PATH = "/pending";
const ADMIN_PREFIX = "/admin";
const HOME_PATH = "/";

export async function updateSession(request: NextRequest) {
  // Bypass Supabase if env vars are missing (local dev without Supabase)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Redirect helper that carries any refreshed auth cookies along.
  const redirectTo = (pathname: string, withNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    if (withNext) {
      url.searchParams.set(
        "next",
        request.nextUrl.pathname + request.nextUrl.search,
      );
    }
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname === LOGIN_PATH;
  const isPending = pathname === PENDING_PATH;
  const isAdminArea =
    pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);

  // --- Signed out -----------------------------------------------------------
  if (!user) {
    if (isLogin) return supabaseResponse;
    return redirectTo(LOGIN_PATH, true);
  }

  // --- Signed in: load approval + role (RLS allows reading own row) ---------
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("approved, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  console.log("===> USER ID:", user.id);
  console.log("===> USER EMAIL:", user.email);
  console.log("===> PROFILE:", profile);
  console.log("===> ERROR:", error);

  const approved = profile?.approved === true;
  const isAdmin = profile?.is_admin === true;
  const allowed = approved || isAdmin; // admins are implicitly allowed

  // Signed-in users never stay on the login page.
  if (isLogin) {
    return redirectTo(allowed ? HOME_PATH : PENDING_PATH);
  }

  // Admin area is admins-only.
  if (isAdminArea) {
    if (isAdmin) return supabaseResponse;
    return redirectTo(allowed ? HOME_PATH : PENDING_PATH);
  }

  // The pending page is only for users who aren't allowed yet.
  if (isPending) {
    return allowed ? redirectTo(HOME_PATH) : supabaseResponse;
  }

  // Every other protected route requires approval.
  if (!allowed) return redirectTo(PENDING_PATH);

  return supabaseResponse;
}
