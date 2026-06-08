// POST { email, password } -> signs the user in via Supabase.
// Supabase sets the auth cookies on the response; we return { ok, email } or 401.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Same message for unknown email and wrong password — don't leak which.
    return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, email: data.user.email });
}
