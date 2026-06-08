// POST a single image to the staging area.
// FormData: file=<File>
// Returns { ok: true, filename, url, size, mime }

import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/fileStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing file" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await saveFile(sessionId, file.name, buffer);
  const origin = req.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    filename: stored,
    originalName: file.name,
    url: `${origin}/api/files/${sessionId}/${stored}`,
    size: file.size,
    mime: file.type || "image/png",
  });
}
