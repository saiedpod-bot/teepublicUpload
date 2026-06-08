// GET -> { ok: true, email, approved, isAdmin } when signed in, else 401.
// Used by the header (AuthStatus) to show who's logged in and reveal the
// admin link.

import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    email: user.email,
    approved: profile?.approved === true,
    isAdmin: profile?.is_admin === true,
  });
}
