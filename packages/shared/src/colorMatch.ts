// Match a "requested" color (from Excel) against a product's actual TeePublic
// catalog. Returns the chosen TPColor and the resolution reason.
//
// Strategy:
//   1. Exact (case-insensitive trimmed)
//   2. Substring (either direction; shorter option preferred)
//   3. Family (requested → family group → first catalog option in that family)
//   4. Fallback (first non-placeholder color in the catalog)

import { TEEPUBLIC_CATALOG, FAMILY_MEMBERS, type TPColor, type ColorFamily } from "./teepublicCatalog";

export type MatchReason = "exact" | "substring" | "family" | "fallback";

export interface MatchResult {
  chosen: TPColor;
  reason: MatchReason;
  requested: string;
  product: string;
}

/** Identify the family a color label belongs to, by label-membership lookup. */
function familyOf(label: string): ColorFamily | null {
  const lower = label.toLowerCase().trim();
  for (const [family, members] of Object.entries(FAMILY_MEMBERS) as [ColorFamily, string[]][]) {
    if (members.some((m) => m.toLowerCase() === lower)) return family;
  }
  // Fuzzy: family name itself ("white", "black", "blue", "red", …) maps to obvious families.
  const heuristic: Record<string, ColorFamily> = {
    white: "light", whites: "light", cream: "light", ivory: "light", natural: "light", off: "light",
    black: "dark", asphalt: "dark", dark: "dark", charcoal: "dark",
    red: "red", maroon: "red", burgundy: "red", crimson: "red",
    pink: "pink", blush: "pink",
    blue: "blue", navy: "blue", royal: "blue", indigo: "blue", cobalt: "blue", slate: "blue",
    green: "green", kelly: "green", forest: "green", sage: "green", olive: "green", military: "green", teal: "green",
    purple: "purple", violet: "purple", lavender: "pink",
    orange: "orange", rust: "orange",
    yellow: "yellow", gold: "yellow",
    brown: "brown", espresso: "brown", chocolate: "brown", tan: "brown", khaki: "brown", beige: "brown",
  };
  for (const [key, fam] of Object.entries(heuristic)) {
    if (lower.includes(key)) return fam;
  }
  return null;
}

/** Resolve a requested color against a product's catalog. */
export function resolveColor(
  requestedLabel: string,
  productLabel: string,
  catalog: typeof TEEPUBLIC_CATALOG = TEEPUBLIC_CATALOG,
): MatchResult {
  const palette = catalog[productLabel] ?? [];
  const requested = (requestedLabel ?? "").trim();
  const r = requested.toLowerCase();

  if (palette.length === 0) {
    // Unknown product — return requested as-is (let the extension's runtime
    // matching decide what to do).
    return { chosen: { label: requested }, reason: "fallback", requested, product: productLabel };
  }

  // 1. Exact
  for (const opt of palette) {
    if (opt.label.toLowerCase() === r) {
      return { chosen: opt, reason: "exact", requested, product: productLabel };
    }
  }

  // 2. Substring (either direction). Prefer shorter option-labels so
  // "White" picks "Off White" before "White/Black/Royal".
  const substringHits = palette
    .filter((o) => {
      const ol = o.label.toLowerCase();
      return ol.includes(r) || (r.length >= 3 && r.includes(ol));
    })
    .sort((a, b) => a.label.length - b.label.length);
  if (substringHits[0]) {
    return { chosen: substringHits[0], reason: "substring", requested, product: productLabel };
  }

  // 3. Family
  const wantFamily = familyOf(requested);
  if (wantFamily) {
    const familyHit = palette.find((o) => o.family === wantFamily);
    if (familyHit) {
      return { chosen: familyHit, reason: "family", requested, product: productLabel };
    }
  }

  // 4. Fallback — first option (TeePublic must have something).
  return { chosen: palette[0], reason: "fallback", requested, product: productLabel };
}

/** Slug → page label, mirroring PRODUCT_NAME_TO_EXCEL_SLUG on the extension. */
export const SLUG_TO_PRODUCT_LABEL: Record<string, string> = {
  t_shirt:                  "T-Shirt",
  hoodie:                   "Hoodie",
  tank:                     "Tank",
  crewneck:                 "Crewneck",
  long_sleeve:              "Long Sleeve T-Shirt",
  baseball_tee:             "Baseball Tee",
  kids:                     "Kids",
  kids_hoodie:              "Kids Hoodie",
  kids_long_sleeve_t_shirt: "Kids Long Sleeve T-Shirt",
  hats:                     "Hats",
  shorts:                   "Shorts",
  bags:                     "Bags",
};

/** Resolve every slug → product color in a productColors map. Returns BOTH
 *  the resolved map (what to send to the extension) AND a per-slug audit so
 *  the dashboard can display "Requested → Resolved (reason)" badges. */
export function resolveProductColors(
  requested: Record<string, string>,
): {
  resolved: Record<string, string>;
  audit: Record<string, MatchResult>;
} {
  const resolved: Record<string, string> = {};
  const audit: Record<string, MatchResult> = {};
  for (const [slug, requestedValue] of Object.entries(requested)) {
    if (!requestedValue) continue;
    const productLabel = SLUG_TO_PRODUCT_LABEL[slug];
    if (!productLabel) {
      // Not an apparel product (e.g. "product_colors" catch-all) — pass through.
      resolved[slug] = requestedValue;
      continue;
    }
    const match = resolveColor(requestedValue, productLabel);
    resolved[slug] = match.chosen.label;
    audit[slug]    = match;
  }
  return { resolved, audit };
}
