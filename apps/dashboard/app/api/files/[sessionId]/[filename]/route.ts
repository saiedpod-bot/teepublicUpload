// GET a staged image back as binary. Used by the extension's service worker.

import { NextRequest } from "next/server";
import { readFile } from "@/lib/fileStore";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif:  "image/gif",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string; filename: string }> }) {
  const { sessionId, filename } = await params;
  try {
    const buffer = await readFile(sessionId, filename);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME[ext] ?? "application/octet-stream";
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
