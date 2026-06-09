// Uploads a design image straight from the browser to Supabase Storage,
// bypassing the Next.js/Vercel API route (whose serverless body limit is
// ~4.5MB and was rejecting larger PNGs with HTTP 413). Direct-to-Supabase has
// no such limit and avoids the extra hop, so it's also faster.
//
// Requires a Storage RLS policy letting authenticated users insert into the
// `designs` bucket — see supabase/migrations/0004_designs_storage_policies.sql.

import { createClient } from "@/lib/supabase/client";

const BUCKET = "designs";

export function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export interface UploadedImage {
  filename: string;
  originalName: string;
  url: string;
  mime: string;
  size: number;
}

export async function uploadDesignImage(sessionId: string, file: File): Promise<UploadedImage> {
  const supabase = createClient();
  const safe = safeSegment(file.name);
  const path = `${safeSegment(sessionId)}/${safe}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    filename: safe,
    originalName: file.name,
    url: data.publicUrl,
    mime: file.type || "image/png",
    size: file.size,
  };
}
