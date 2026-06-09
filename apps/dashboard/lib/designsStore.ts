// Client + server shared shape for a persisted design, plus browser-side
// helpers that talk to /api/designs. Designs are stored per-user in Supabase
// so a user's work follows their account across browsers (see
// supabase/migrations/0002_designs.sql).

import type { GeneratedListing } from "@/lib/gemini";
import type { ColorProductConfigValue } from "@/components/ColorProductConfig";

export interface PersistedDesign {
  id: string;
  sessionId: string;
  imageUrl: string;
  serverFilename: string;
  originalName: string;
  mime: string;
  size: number;
  listing: GeneratedListing | null;
  config: ColorProductConfigValue;
  status: string;
}

export async function loadDesigns(): Promise<PersistedDesign[]> {
  const res = await fetch("/api/designs", { cache: "no-store" });
  const json = await res.json().catch(() => ({ ok: false }));
  if (!json.ok) throw new Error(json.error ?? `Failed to load designs (${res.status})`);
  return json.designs as PersistedDesign[];
}

export async function saveDesigns(designs: PersistedDesign[]): Promise<void> {
  if (designs.length === 0) return;
  const res = await fetch("/api/designs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ designs }),
  });
  const json = await res.json().catch(() => ({ ok: false }));
  if (!json.ok) throw new Error(json.error ?? `Failed to save designs (${res.status})`);
}

export async function deleteDesign(id: string): Promise<void> {
  const res = await fetch(`/api/designs?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  const json = await res.json().catch(() => ({ ok: false }));
  if (!json.ok) throw new Error(json.error ?? `Failed to delete design (${res.status})`);
}
