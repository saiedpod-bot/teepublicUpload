// Staging area for design PNGs, backed by Supabase Storage.
// Files live in the `designs` bucket at <sessionId>/<safeFilename>. The bucket
// must be PUBLIC so the returned URL is fetchable by the browser and extension.
// (Previously this wrote to local disk, which doesn't work on Vercel.)

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "designs";

export function safeSegment(s: string): string {
  // Strip path traversal characters; keep filenames roughly intact.
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function objectPath(sessionId: string, filename: string): string {
  return `${safeSegment(sessionId)}/${safeSegment(filename)}`;
}

export async function saveFile(
  sessionId: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ filename: string; url: string }> {
  const supabase = createAdminClient();
  const safe = safeSegment(filename);
  const path = objectPath(sessionId, filename);

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: contentType || "image/png",
    upsert: true,
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { filename: safe, url: data.publicUrl };
}

export async function readFile(sessionId: string, filename: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(objectPath(sessionId, filename));
  if (error || !data) {
    throw new Error(`Supabase Storage download failed: ${error?.message ?? "not found"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}
