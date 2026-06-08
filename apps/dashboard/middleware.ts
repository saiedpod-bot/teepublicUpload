// Gate the whole dashboard behind a valid Supabase session and refresh tokens
// on every request. The actual logic lives in lib/supabase/middleware.ts.
//
// The matcher excludes /api (the auth endpoints set/clear cookies themselves),
// Next internals, and static assets.

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
  return await updateSession(req);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
