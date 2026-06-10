// Static catalog of TeePublic colors available per product. The dashboard
// uses this to reconcile the Excel's requested color into a value TeePublic
// actually offers, before queueing the design for upload.
//
// Seed: TeePublic's documented per-product palettes. Labels match what
// TeePublic shows in <label class="dd-option-text">, case-sensitive
// (e.g. "Black/White", not "Black / White").
//
// Match against the `label` field only — the `id` is informational; the
// extension matches dd-options by text, not by hidden numeric ID.

export interface TPColor {
  /** Stable label TeePublic shows in the dropdown. Case-sensitive. */
  label: string;
  /** Optional family tag for similarity matching. */
  family?: ColorFamily;
  /** Optional swatch URL (TeePublic's color tile image). */
  swatch?: string;
}

export type ColorFamily =
  | "light" | "dark" | "red" | "pink" | "blue" | "green"
  | "purple" | "orange" | "yellow" | "brown" | "multi";

export const FAMILY_MEMBERS: Record<ColorFamily, string[]> = {
  light:  ["White", "Off White", "Vintage White", "Solid White", "Oatmeal Heather", "Natural Heather", "Natural", "Heather", "Athletic Heather", "Vintage Heather", "Heather Grey", "Heather Gray", "Light Heather Grey", "Light Heather Gray", "Cream", "Creme", "Ivory", "Ghost", "Butter", "Sport Grey", "Sport Gray", "Sand", "Ash", "Stone", "Silver", "Light Grey", "Light Gray"],
  dark:   ["Black", "Solid Black", "Asphalt", "Charcoal", "Charcoal Heather", "Heather Charcoal", "Heather Black", "Tri-Black", "Tri Black", "Dark Grey", "Dark Gray", "Oxford"],
  red:    ["Red", "Vintage Red", "Crimson", "Maroon", "Burgundy", "Garnet", "Red Heather"],
  pink:   ["Pink", "Light Pink", "Baby Pink", "Soft Pink", "Hot Pink", "Azalea", "Blush", "Mauvelous", "Lavender"],
  blue:   ["Navy", "Vintage Navy", "Deep Navy", "Midnight Navy", "Navy Blue", "Navy Heather", "Royal", "Royal Blue", "True Royal", "Deep Royal", "Vintage Royal", "Royal Heather", "Light Blue", "Baby Blue", "Powder Blue", "Indigo Blue", "Colony Blue", "Coastal Blue", "Slate", "Cobalt", "Blue", "Teal"],
  green:  ["Kelly", "Kelly Green", "Sage", "Pistachio", "Forest", "Forest Green", "Military Green", "Sport Green", "Moss", "Basil", "Dark Green", "Olive", "Green"],
  purple: ["Purple", "Violet", "Paragon"],
  orange: ["Orange", "Tennessee Orange", "Rust"],
  yellow: ["Yellow", "Daisy", "Lemon", "Gold"],
  brown:  ["Brown", "Espresso", "Chocolate", "Latte", "Chestnut", "Tan", "Khaki", "Beige"],
  multi:  ["Black/White", "White/Black", "White/Royal", "White/Red", "White/Kelly", "White/Navy", "Tie Dye", "Sunset Stripe"],
};

function tag(label: string): TPColor {
  for (const [family, members] of Object.entries(FAMILY_MEMBERS) as [ColorFamily, string[]][]) {
    if (members.some((m) => m.toLowerCase() === label.toLowerCase())) {
      return { label, family };
    }
  }
  return { label };
}

const list = (...labels: string[]): TPColor[] => labels.map(tag);

// Per-product palettes. Seeded from TeePublic's published catalog. The exact
// list per product may shift over time; the matcher tolerates that with
// substring + family fallbacks.
export const TEEPUBLIC_CATALOG: Record<string, TPColor[]> = {
  "T-Shirt": list(
    "White", "Black", "Asphalt", "Charcoal", "Heather", "Athletic Heather", "Oatmeal Heather", "Natural Heather", "Vintage White", "Vintage Black",
    "Navy", "Vintage Navy", "Royal Blue", "True Royal", "Light Blue", "Baby Blue", "Powder Blue", "Cobalt", "Teal",
    "Red", "Vintage Red", "Maroon", "Burgundy",
    "Kelly", "Forest Green", "Military Green", "Sage", "Olive",
    "Pink", "Soft Pink", "Hot Pink", "Lavender",
    "Purple", "Orange", "Yellow", "Brown", "Tan",
    "Black/White", "White/Black",
  ),
  "Hoodie": list(
    "Black", "Asphalt", "Charcoal Heather", "Heather", "Vintage Heather", "Athletic Heather", "Oatmeal Heather", "Natural Heather",
    "Navy", "Royal", "Vintage Royal", "Slate",
    "Maroon", "Red", "Forest", "Olive", "Sage", "Sport Green",
    "Pink", "Lavender", "Purple", "Brown",
  ),
  "Tank": list(
    "White", "Black", "Heather", "Vintage Black", "Vintage White",
    "Navy", "Royal", "Red", "Maroon", "Forest", "Pink", "Purple",
  ),
  "Crewneck": list(
    "White", "Black", "Vintage Heather", "Athletic Heather", "Oatmeal Heather",
    "Navy", "Royal", "Maroon", "Red", "Forest", "Sage",
  ),
  "Long Sleeve T-Shirt": list(
    "White", "Black", "Asphalt", "Heather", "Vintage Heather", "Oatmeal Heather",
    "Navy", "Royal", "Red", "Maroon", "Forest",
  ),
  "Baseball Tee": list(
    "Black/White", "White/Black", "White/Red", "White/Navy", "White/Kelly", "White/Royal", "Heather/Black", "Heather/Navy",
  ),
  "Kids": list(
    "White", "Black", "Heather", "Athletic Heather", "Natural Heather",
    "Navy", "Royal", "Red", "Maroon", "Pink", "Light Pink", "Hot Pink",
    "Kelly", "Sport Green", "Yellow", "Purple",
  ),
  "Kids Hoodie": list(
    "Black", "Vintage Heather", "Natural Heather", "Athletic Heather",
    "Navy", "Royal", "Vintage Royal", "Red", "Maroon", "Pink",
  ),
  "Kids Long Sleeve T-Shirt": list(
    "Black", "Navy", "Royal", "Deep Royal", "Red", "Pink", "Hot Pink", "Sport Green",
  ),
  // Exactly TeePublic's trucker-hat dropdown — no other colors are offered.
  "Hats": list(
    "Black", "Navy", "Deep Royal", "Red", "Creme",
    "White/Black", "White/Royal", "White/Red", "White/Navy",
  ),
  "Shorts": list(
    "Black", "Heather", "Charcoal", "Navy", "Olive", "Military Green",
  ),
  "Bags": list(
    "Light Grey", "Natural", "Black", "Oxford", "Navy",
  ),
};
