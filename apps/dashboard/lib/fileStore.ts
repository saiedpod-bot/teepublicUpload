// Server-side staging area for design PNGs.
// Files live under apps/dashboard/uploads/<sessionId>/<safeFilename>.
// Served back via /api/files/<sessionId>/<safeFilename>.

import { promises as fs } from "node:fs";
import path from "node:path";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export function uploadDirFor(sessionId: string) {
  return path.join(UPLOAD_ROOT, safeSegment(sessionId));
}

export function safeSegment(s: string): string {
  // Strip path traversal characters; keep filenames roughly intact.
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export async function saveFile(sessionId: string, filename: string, buffer: Buffer): Promise<string> {
  const dir = uploadDirFor(sessionId);
  await fs.mkdir(dir, { recursive: true });
  const safe = safeSegment(filename);
  const full = path.join(dir, safe);
  await fs.writeFile(full, buffer);
  return safe;
}

export async function readFile(sessionId: string, filename: string): Promise<Buffer> {
  const full = path.join(uploadDirFor(sessionId), safeSegment(filename));
  return fs.readFile(full);
}
