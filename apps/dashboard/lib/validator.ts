import type { ValidationIssue } from "@teepublic/shared";
import type { ParsedRow } from "./parser";
import { stemName } from "./parser";

const TITLE_MAX = 50;
const TAG_MIN = 3;
const TAG_MAX = 50;

export interface ValidationResult {
  issues: ValidationIssue[];
  validRows: ParsedRow[];
}

// `imageStems` is the set of available image stems (lowercased, no extension).
export function validateRows(rows: ParsedRow[], imageStems: Set<string>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const validRows: ParsedRow[] = [];

  for (const row of rows) {
    const m = row.metadata;
    const before = issues.length;
    const stem = stemName(m.filename);

    if (!m.filename)            push(row.rowNumber, "filename",    "error",   "missing filename");
    else if (!imageStems.has(stem)) push(row.rowNumber, "filename", "error", `no image matches "${m.filename}"`);
    else if (seen.has(stem))    push(row.rowNumber, "filename",    "warning", `duplicate filename "${m.filename}"`);

    if (!m.title)               push(row.rowNumber, "title",       "error",   "missing title");
    else if (m.title.length > TITLE_MAX) push(row.rowNumber, "title", "warning", `title is ${m.title.length} chars (max ${TITLE_MAX} recommended)`);

    if (!m.description)         push(row.rowNumber, "description", "warning", "missing description");

    if (m.tags.length < TAG_MIN) push(row.rowNumber, "tags",       "warning", `only ${m.tags.length} tags (recommend ${TAG_MIN}+)`);
    else if (m.tags.length > TAG_MAX) push(row.rowNumber, "tags",  "warning", `${m.tags.length} tags exceeds recommended ${TAG_MAX}`);

    seen.add(stem);
    if (issues.slice(before).every((i) => i.level !== "error")) validRows.push(row);
  }

  return { issues, validRows };

  function push(row: number, field: string, level: "error" | "warning", message: string) {
    issues.push({ row, field, level, message });
  }
}
