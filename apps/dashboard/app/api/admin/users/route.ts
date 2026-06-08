// Admin-only user management. Every handler verifies the caller is an admin
// (via their session) and then uses the service-role client to read/modify all
// users — service role bypasses RLS and can call the Auth admin API.
//
//   GET    /api/admin/users          -> list all profiles
//   PATCH  /api/admin/users { id, approved } -> approve / revoke a user
//   DELETE /api/admin/users { id }    -> delete a user (cascades the profile)

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const forbidden = () =>
  NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  const svc = createAdminClient();
  const { data, error } = await svc
    .from("profiles")
    .select("id, email, approved, is_admin, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, users: data });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  let body: { id?: unknown; approved?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const approved = body.approved === true;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing user id." }, { status: 400 });
  }
  // Don't let an admin revoke their own access and lock themselves out.
  if (id === admin.user!.id && !approved) {
    return NextResponse.json(
      { ok: false, error: "You can't revoke your own access." },
      { status: 400 },
    );
  }

  const svc = createAdminClient();
  const { error } = await svc.from("profiles").update({ approved }).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing user id." }, { status: 400 });
  }
  if (id === admin.user!.id) {
    return NextResponse.json(
      { ok: false, error: "You can't delete your own account." },
      { status: 400 },
    );
  }

  const svc = createAdminClient();
  // Deleting the auth user cascades to public.profiles (ON DELETE CASCADE).
  const { error } = await svc.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
