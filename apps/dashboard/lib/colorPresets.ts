// Color presets for the AI-generation flow. Given a preset (Light / Dark / All)
// pick one default catalog color per product. The user can override each
// product individually afterwards.
//
// "Light"  → first catalog entry tagged family="light" (falls back to first option).
// "Dark"   → first catalog entry tagged family="dark"  (falls back to first option).
// "All"    → "" — let the user pick per product. We still pre-fill the dropdown
//           with the first option so the queue ships valid values.

import { TEEPUBLIC_CATALOG, SLUG_TO_PRODUCT_LABEL, FAMILY_MEMBERS, resolveColor, type TPColor, type ColorFamily } from "@teepublic/shared";

export type ColorPreset = "light" | "dark" | "all";

// One-click "set every product to X" swatches. Each color is run through
// resolveColor per product, so a product that doesn't carry the exact label
// (e.g. Hoodie has no plain "White") falls back to the closest family member.
export interface BasicColor {
  /** Display name + the label fed to resolveColor (matches catalog labels). */
  name: string;
  /** Hex used to paint the swatch circle in the UI. */
  hex: string;
  /** Tailwind text color for the contrast checkmark when selected. */
  checkOn: "light" | "dark";
}

export const BASIC_COLORS: BasicColor[] = [
  { name: "Black",       hex: "#0a0a0a", checkOn: "light" },
  { name: "White",       hex: "#ffffff", checkOn: "dark"  },
  { name: "Red",         hex: "#dc2626", checkOn: "light" },
  { name: "Royal Blue",  hex: "#2563eb", checkOn: "light" },
  { name: "Kelly Green", hex: "#16a34a", checkOn: "light" },
  { name: "Yellow",      hex: "#facc15", checkOn: "dark"  },
  { name: "Pink",        hex: "#ec4899", checkOn: "light" },
  { name: "Purple",      hex: "#9333ea", checkOn: "light" },
];

// Inverse of SLUG_TO_PRODUCT_LABEL — handy in the UI.
export const PRODUCT_LABEL_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_TO_PRODUCT_LABEL).map(([slug, label]) => [label, slug])
);

export function productSlugs(): string[] {
  return Object.keys(SLUG_TO_PRODUCT_LABEL);
}

export function paletteFor(productLabel: string): TPColor[] {
  return TEEPUBLIC_CATALOG[productLabel] ?? [];
}

function pickByFamily(palette: TPColor[], family: "light" | "dark"): TPColor | undefined {
  return palette.find((c) => c.family === family);
}

/** Apply a preset across all products. Returns a slug → label map. */
export function applyPreset(preset: ColorPreset): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, label] of Object.entries(SLUG_TO_PRODUCT_LABEL)) {
    const palette = paletteFor(label);
    if (palette.length === 0) continue;
    if (preset === "light")      out[slug] = pickByFamily(palette, "light")?.label ?? palette[0].label;
    else if (preset === "dark")  out[slug] = pickByFamily(palette, "dark")?.label  ?? palette[0].label;
    else                          out[slug] = palette[0].label;
  }
  return out;
}

/** Sensible default — every product enabled. The user can toggle off. */
export function allEnabledProducts(): string[] {
  return Object.values(SLUG_TO_PRODUCT_LABEL);
}

/** Apply a single requested color to every product, resolved per product's
 *  catalog. Improves on shared/resolveColor by preferring SOLID color labels
 *  (no "/") over combos — e.g. "White" on Hats lands on "Heather" instead of
 *  "Navy/White". Falls through to the shared resolver only for non-apparel
 *  multi-color combos. */
export function applyBasicColor(requested: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, label] of Object.entries(SLUG_TO_PRODUCT_LABEL)) {
    const palette = paletteFor(label);
    if (palette.length === 0) continue;
    out[slug] = pickSolidPreferred(requested, palette);
  }
  return out;
}

/** Per-slug version of applyBasicColor — resolves each cell from the
 *  spreadsheet's colors sheet using the same solid-preferring matcher the
 *  Basic Colors row uses. So `hats_color = "white"` lands on "Heather",
 *  `bags_color = "white"` on "Light Grey", matching the AI-generate page's
 *  White-circle output instead of the shared resolver's combo picks. */
export function resolvePerProductColors(
  requested: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, value] of Object.entries(requested)) {
    if (!value) continue;
    const label = SLUG_TO_PRODUCT_LABEL[slug];
    if (!label) { out[slug] = value; continue; }
    const palette = paletteFor(label);
    if (palette.length === 0) { out[slug] = value; continue; }
    out[slug] = pickSolidPreferred(value, palette);
  }
  return out;
}

/** Pick the best label, preferring solids over combos. */
function pickSolidPreferred(requested: string, palette: TPColor[]): string {
  const r = requested.toLowerCase().trim();
  const solids = palette.filter((c) => !c.label.includes("/"));
  const combos = palette.filter((c) =>  c.label.includes("/"));

  // 1. Exact (solid first, then combo).
  const exactSolid = solids.find((c) => c.label.toLowerCase() === r);
  if (exactSolid) return exactSolid.label;
  const exactCombo = combos.find((c) => c.label.toLowerCase() === r);
  if (exactCombo) return exactCombo.label;

  // 2. Solid label that *starts with* the requested word (whole-token match).
  const startsSolid = solids.find((c) => c.label.toLowerCase().startsWith(r));
  if (startsSolid) return startsSolid.label;

  // 3. Solid family match — e.g. requested "White" → family "light" → "Heather".
  const family = guessFamily(requested);
  if (family) {
    const familySolid = solids.find((c) => c.family === family);
    if (familySolid) return familySolid.label;
  }

  // 4. Solid substring match (shorter label preferred).
  const subSolid = solids
    .filter((c) => c.label.toLowerCase().includes(r) || (r.length >= 3 && r.includes(c.label.toLowerCase())))
    .sort((a, b) => a.label.length - b.label.length);
  if (subSolid[0]) return subSolid[0].label;

  // 5. Now permit combos that *start with* the requested word.
  const startsCombo = combos.find((c) => c.label.toLowerCase().startsWith(r));
  if (startsCombo) return startsCombo.label;

  // 6. Last resort — shared resolver (covers family combos, fallback).
  return resolveColor(requested, palette[0] ? palette[0].label : "T-Shirt").chosen.label || palette[0].label;
}

/** Merge a custom color list (user-added per product) into the static catalog.
 *  Customs come without family info — they're treated as solid labels. */
export function mergedPalette(productLabel: string, customLabels: string[]): TPColor[] {
  const base = paletteFor(productLabel);
  if (customLabels.length === 0) return base;
  const existing = new Set(base.map((c) => c.label.toLowerCase()));
  const extras: TPColor[] = customLabels
    .filter((l) => l && !existing.has(l.toLowerCase()))
    .map((label) => ({ label }));
  return [...base, ...extras];
}

/** Heuristic family lookup used by the solid-preferring matcher. */
function guessFamily(label: string): ColorFamily | null {
  const lower = label.toLowerCase().trim();
  for (const [family, members] of Object.entries(FAMILY_MEMBERS) as [ColorFamily, string[]][]) {
    if (members.some((m) => m.toLowerCase() === lower)) return family;
  }
  const heuristic: Record<string, ColorFamily> = {
    white: "light", cream: "light", ivory: "light", natural: "light",
    black: "dark", charcoal: "dark", asphalt: "dark",
    red: "red", maroon: "red", burgundy: "red", crimson: "red",
    pink: "pink", blush: "pink", lavender: "pink",
    blue: "blue", navy: "blue", royal: "blue", indigo: "blue", cobalt: "blue", teal: "blue",
    green: "green", kelly: "green", forest: "green", sage: "green", olive: "green",
    purple: "purple", violet: "purple",
    orange: "orange", rust: "orange",
    yellow: "yellow", gold: "yellow",
    brown: "brown", chocolate: "brown", tan: "brown", khaki: "brown", beige: "brown",
  };
  for (const [key, fam] of Object.entries(heuristic)) if (lower.includes(key)) return fam;
  return null;
}
