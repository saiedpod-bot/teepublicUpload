// Pure color normalization & matching. No DOM, no side effects.
// Design contract: findBestMatch ALWAYS returns a result for non-empty input.
// Failure mode is "no fuzzy match → safe default", never "no match at all".

export type ColorCategory =
  | "white" | "black" | "navy" | "blue" | "red" | "green"
  | "yellow" | "pink" | "gray" | "brown" | "purple" | "orange" | "tan";

interface CategoryDef {
  /** Patterns that classify the spreadsheet's input value as this category. */
  inputPatterns: RegExp[];
  /** Ranked TeePublic option-name fragments to prefer when the exact match fails. */
  alternatives: string[];
  /** Words that disqualify an option (it's a different color), unless the option
   *  also contains the canonical category name (e.g. "White/Royal" passes for
   *  white because "white" is present). */
  disqualifiers: string[];
  /** Used as the safe default when nothing matches — picks the most neutral
   *  / closest-tone option in the available list. */
  safeDefaultPriority: string[];
}

const CATEGORIES: Record<ColorCategory, CategoryDef> = {
  white: {
    inputPatterns: [/^white$/i, /^solid white$/i, /^vintage white$/i, /^natural$/i, /^cream$/i, /^ivory$/i],
    alternatives: [
      "white", "solid white", "vintage white",
      "white/black", "black/white",
      "natural", "athletic heather", "vintage heather",
      "oatmeal heather", "oatmeal", "heather grey", "heather gray",
      "cream", "ivory", "sport grey", "sport gray", "sand",
      "ash", "stone", "silver", "heather",
    ],
    disqualifiers: [
      "royal", "navy", "blue", "green", "red", "purple", "violet", "orange",
      "yellow", "pink", "rose", "coral", "rust", "maroon", "burgundy", "olive",
      "forest", "teal", "mint", "lime", "gold", "tan", "brown", "espresso",
      "chocolate", "kelly", "crimson", "fuchsia", "magenta", "lavender",
    ],
    safeDefaultPriority: ["heather", "oatmeal", "cream", "ivory", "ash", "stone", "sand", "silver", "gray", "grey"],
  },
  black: {
    inputPatterns: [/^black$/i, /^solid black$/i],
    alternatives: ["black", "solid black", "black/white", "white/black", "asphalt",
                   "charcoal", "heather charcoal", "tri-black", "tri black",
                   "heather black", "dark grey", "dark gray"],
    disqualifiers: [],
    safeDefaultPriority: ["charcoal", "asphalt", "navy", "dark"],
  },
  navy: {
    inputPatterns: [/^navy$/i],
    alternatives: ["navy", "deep navy", "vintage navy", "midnight navy", "navy blue"],
    disqualifiers: [],
    safeDefaultPriority: ["royal", "blue", "deep"],
  },
  blue: {
    inputPatterns: [/^blue$/i, /^royal$/i],
    alternatives: ["royal blue", "royal", "true royal", "deep royal", "vintage royal", "cobalt", "blue"],
    disqualifiers: [],
    safeDefaultPriority: ["navy", "blue"],
  },
  red: {
    inputPatterns: [/^red$/i],
    alternatives: ["red", "vintage red", "deep red", "crimson"],
    disqualifiers: [],
    safeDefaultPriority: ["maroon", "burgundy", "crimson"],
  },
  green: {
    inputPatterns: [/^green$/i, /^kelly$/i, /^forest$/i],
    alternatives: ["kelly green", "forest green", "kelly", "forest", "olive", "green"],
    disqualifiers: [],
    safeDefaultPriority: ["olive", "green"],
  },
  yellow: {
    inputPatterns: [/^yellow$/i],
    alternatives: ["yellow", "daisy", "lemon"],
    disqualifiers: [],
    safeDefaultPriority: ["gold", "orange"],
  },
  pink: {
    inputPatterns: [/^pink$/i],
    alternatives: ["pink", "light pink", "baby pink", "soft pink"],
    disqualifiers: [],
    safeDefaultPriority: ["rose", "coral", "red"],
  },
  gray: {
    inputPatterns: [/^gr[ae]y$/i, /^charcoal$/i, /^heather$/i],
    alternatives: ["heather", "charcoal", "asphalt", "athletic heather", "heather grey", "heather gray"],
    disqualifiers: [],
    safeDefaultPriority: ["heather", "ash", "stone", "silver"],
  },
  brown: {
    inputPatterns: [/^brown$/i],
    alternatives: ["brown", "espresso", "chocolate"],
    disqualifiers: [],
    safeDefaultPriority: ["espresso", "chocolate", "tan", "khaki"],
  },
  purple: {
    inputPatterns: [/^purple$/i, /^violet$/i],
    alternatives: ["purple", "violet", "lavender"],
    disqualifiers: [],
    safeDefaultPriority: ["lavender", "pink"],
  },
  orange: {
    inputPatterns: [/^orange$/i],
    alternatives: ["orange", "rust"],
    disqualifiers: [],
    safeDefaultPriority: ["rust", "yellow", "red"],
  },
  tan: {
    inputPatterns: [/^tan$/i, /^khaki$/i, /^beige$/i],
    alternatives: ["tan", "khaki", "sand", "beige"],
    disqualifiers: [],
    safeDefaultPriority: ["sand", "khaki", "beige", "stone"],
  },
};

export function categorize(value: string): ColorCategory | null {
  const v = value.trim().toLowerCase();
  for (const [name, def] of Object.entries(CATEGORIES)) {
    if (def.inputPatterns.some((p) => p.test(v))) return name as ColorCategory;
  }
  return null;
}

export type MatchMethod =
  | "exact"
  | "alternative"
  | "substring"
  | "category-loose"
  | "safe-default-tone"
  | "safe-default-first";

export interface MatchResult {
  index: number;
  chosen: string;
  method: MatchMethod;
  preferred: string;
  category: ColorCategory | null;
  available: string[];
}

/**
 * Pick the best option for `desired` from `options`. Tiered:
 *   1. exact (case-insensitive)
 *   2. category alternatives (ranked)
 *   3. plain substring
 *   4. category-loose (any non-disqualified option)
 *   5. safe-default-tone (best by category priority list)
 *   6. safe-default-first (first option — never returns null on non-empty input)
 *
 * Returns null ONLY when `options` is empty.
 */
export function findBestMatch(options: string[], desired: string): MatchResult | null {
  if (options.length === 0) return null;
  const want = desired.trim().toLowerCase();
  const cat = categorize(want);

  const make = (index: number, method: MatchMethod): MatchResult => ({
    index,
    chosen: options[index],
    method,
    preferred: desired,
    category: cat,
    available: options.slice(),
  });

  // 1. Exact
  let i = options.findIndex((o) => o.trim().toLowerCase() === want);
  if (i >= 0) return make(i, "exact");

  // 2. Category alternatives
  if (cat) {
    const def = CATEGORIES[cat];
    for (const alt of def.alternatives) {
      i = options.findIndex((o) => {
        const lo = o.toLowerCase();
        return lo.includes(alt) && !hasDisqualifier(lo, want, def);
      });
      if (i >= 0) return make(i, "alternative");
    }
  }

  // 3. Plain substring
  i = options.findIndex((o) => o.toLowerCase().includes(want));
  if (i >= 0) return make(i, "substring");

  // 4. Category-loose: any option that isn't actively wrong (non-disqualified)
  if (cat) {
    const def = CATEGORIES[cat];
    i = options.findIndex((o) => !hasDisqualifier(o.toLowerCase(), want, def));
    if (i >= 0) return make(i, "category-loose");
  }

  // 5. Safe default by tone priority
  if (cat) {
    const def = CATEGORIES[cat];
    for (const tonePref of def.safeDefaultPriority) {
      i = options.findIndex((o) => o.toLowerCase().includes(tonePref));
      if (i >= 0) return make(i, "safe-default-tone");
    }
  }

  // 6. Last resort — return whatever is first so the upload doesn't fail
  return make(0, "safe-default-first");
}

function hasDisqualifier(option: string, desired: string, def: CategoryDef): boolean {
  if (def.disqualifiers.length === 0) return false;
  if (option.includes(desired)) return false;
  return def.disqualifiers.some((d) => option.includes(d));
}
