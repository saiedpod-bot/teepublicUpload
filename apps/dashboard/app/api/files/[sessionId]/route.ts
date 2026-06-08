// POST a single image to the staging area.
// FormData: file=<File>
// Returns { ok: true, filename, url, size, mime }

import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/fileStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "missing file" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/png";
    const { filename, url } = await saveFile(sessionId, file.name, buffer, mime);
    return NextResponse.json({
      ok: true,
      filename,
      originalName: file.name,
      url,
      size: file.size,
      mime,
    });
  } catch (e) {
    // Always return JSON so the client doesn't choke on an empty error body.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "upload failed" },
      { status: 500 },
    );
  }
}
