// POST { email, password } -> creates a Supabase account.
//
// If the project requires email confirmation, signUp returns a user but no
// session — we report needsConfirmation so the UI can tell the user to check
// their inbox. Otherwise Supabase sets the auth cookies and the user is in.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Send the confirmation link back to the origin the user signed up from,
    // so it works in dev (3030) and production without hardcoding a host.
    options: { emailRedirectTo: req.nextUrl.origin },
  });

  if (error) {
    const status = /registered|already/i.test(error.message) ? 409 : 400;
    const msg =
      status === 409
        ? "An account with that email already exists."
        : error.message || "Could not create account.";
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  // No session => email confirmation is enabled on the project.
  const needsConfirmation = !data.session;
  return NextResponse.json({
    ok: true,
    email: data.user?.email,
    needsConfirmation,
  });
}
