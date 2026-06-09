// Client helpers for persisting the "From spreadsheet" tab's batch per user
// (see supabase/migrations/0003_spreadsheet_batches.sql). The tab holds one
// batch at a time, so it's stored as a single JSON blob.

import type { ParsedRow } from "@/lib/parser";
import type { MatchedImage } from "@/lib/queue";

export interface SpreadsheetBatch {
  spreadsheetName: string;
  rows: ParsedRow[];
  images: MatchedImage[];
}

export async function loadSpreadsheet(): Promise<SpreadsheetBatch | null> {
  const res = await fetch("/api/spreadsheet", { cache: "no-store" });
  const json = await res.json().catch(() => ({ ok: false }));
  if (!json.ok) throw new Error(json.error ?? `Failed to load spreadsheet (${res.status})`);
  return (json.batch as SpreadsheetBatch | null) ?? null;
}

export async function saveSpreadsheet(batch: SpreadsheetBatch): Promise<void> {
  const res = await fetch("/api/spreadsheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch }),
  });
  const json = await res.json().catch(() => ({ ok: false }));
  if (!json.ok) throw new Error(json.error ?? `Failed to save spreadsheet (${res.status})`);
}
