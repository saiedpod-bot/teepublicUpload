# TeePublic Auto-Upload — Color Selection Fix

## Context

This project uploads designs to TeePublic via a Chrome extension driven by a Next.js dashboard. The dashboard reads an Excel file, builds a queue of designs, and the extension automates the TeePublic edit page for each one.

**Two things are broken right now:**

1. The extension's color-picker (`apps/extension/src/content/colors.ts`) tries to find color dropdowns via `<select>` elements, but TeePublic uses a custom widget (`<div class="dd-select">` from the jQuery `dd-select` library). The current selector finds 0 rows and the script skips straight to PUBLISH, which silently fails because TeePublic requires every enabled product to have a color.
2. The dashboard doesn't reconcile the Excel-requested colors against what TeePublic actually offers per product. The Excel might say "White" for every product, but Hoodie has no "White" — it has Oatmeal Heather, Vintage Heather, etc. The dashboard must translate the Excel intent into a valid available color per product before sending it to the extension.

---

## How the data flows

```
Excel (Sheet1_Metadata + Sheet2_Colors + Sheet3_Enabled)
  ↓
Dashboard parses Excel → builds DesignMetadata per design
  ↓
Dashboard MATCHES requested colors against TeePublic's per-product catalog
  → exact match → use it
  → no exact match → pick a similar/visually-closest color
  → if no remotely similar color exists → use the first available color (TeePublic requires SOMETHING)
  ↓
Dashboard sends QueueBatch to extension
  ↓
Extension opens each design's /edit page
  ↓
Extension fills metadata fields, then for each enabled product row:
  → open the dd-select widget
  → click the <li> matching the chosen color label
  → verify the hidden input updated
  ↓
Extension ticks Terms & Conditions, clicks PUBLISH
  ↓
Extension waits for URL to change to /t-shirt/<id>-<slug>
```

---

## What the Excel looks like

`Sheet2_Colors` is a **catalog of allowed colors per product**, NOT per-design data. Columns:

| Column | TeePublic UI row |
|---|---|
| `t_shirt_color` | T-Shirt |
| `hoodie_color` | Hoodie |
| `tank_color` | Tank |
| `crewneck_color` | Crewneck |
| `long_sleeve_color` | **Long Sleeve T-Shirt** (note: UI label has "T-Shirt" suffix) |
| `baseball_tee_color` | Baseball Tee |
| `kids_color` | Kids |
| `kids_hoodie_color` | Kids Hoodie |
| `kids_long_sleeve_t_shirt_color` | Kids Long Sleeve T-Shirt |
| `hats_color` | Hats |
| `shorts_colors` | Shorts |
| `bags_color` | Bags |
| `product_colors` | The color-palette circles at the bottom (All / Light / Dark) — separate feature, do not touch unless explicitly handled |

`Sheet3_Enabled` is the global enable/disable list per product (On/Off).

`Sheet1_Metadata` has one row per design (filename, title, primary_tag, description, adult_content, supporting_tags).

The user wants **the same color intent applied to every design** (e.g. "I want White everywhere"), and the dashboard translates that intent into the closest valid color for each product.

---

## Required fix #1 — Extension: rewrite `colors.ts` to work with `dd-select`

The current `configureProductTable()` queries `<select>`. TeePublic actually renders this:

```html
<!-- The trigger / current value -->
<div class="dd-select" style="width: 200px;">
  <input class="dd-selected-value" type="hidden" value="Select Default Color">
  <a class="dd-selected">
    <label class="dd-selected-text">Select Default Color</label>
  </a>
  <span class="dd-pointer dd-pointer-down"></span>
</div>

<!-- Sibling list of options (hidden until clicked open) -->
<ul class="dd-options">
  <li><a class="dd-option dd-option-selected">
    <input class="dd-option-value" type="hidden" value="Select Default Color">
    <label class="dd-option-text">Select Default Color</label>
  </a></li>
  <li><a class="dd-option">
    <input class="dd-option-value" type="hidden" value="12">
    <img class="dd-option-image" src=".../color_tile_white-...">
    <label class="dd-option-text">White</label>
  </a></li>
  <li><a class="dd-option">
    <input class="dd-option-value" type="hidden" value="4">
    <img class="dd-option-image" src=".../color_tile_heather-...">
    <label class="dd-option-text">Heather</label>
  </a></li>
  <!-- ... more <li> options -->
</ul>
```

Key facts about the widget:

- The committed value lives in `<input class="dd-selected-value">` inside the wrapper.
- The visible-text element is `<label class="dd-selected-text">`.
- The wrapper `<a class="dd-selected">` must be **clicked** to open the dropdown; setting the hidden input directly does nothing — the library listens for clicks.
- Options live in a sibling `<ul class="dd-options">` (usually right after the wrapper).
- Each `<li>` has both a hidden `<input class="dd-option-value">` (e.g. `value="12"`) and a `<label class="dd-option-text">` (e.g. `White`).
- Clicking the `<a class="dd-option">` inside an `<li>` commits the selection, updates `dd-selected-value`, and fires whatever JS handlers TeePublic wired up.

### Implementation requirements

Replace `configureProductTable` with logic that:

1. **Important pre-step — expand all hidden sections first.** Before scraping, look for any "Select Default Color" toggles or collapsed product-table sections and click them to expand. Also scroll the products table into view so React mounts any virtualized rows. The function must not assume rows are visible.
2. **Finds rows by `div.dd-select`**, not `<select>`. Keep only wrappers whose current `dd-selected-value` is the placeholder `"Select Default Color"` or a numeric ID — this filters out unrelated dropdowns (Albums, Country, Currency).
3. **Resolves the product row name** (T-Shirt, Hoodie, Long Sleeve T-Shirt, ...) by walking up from the wrapper to the surrounding row/section and finding the first short text node that isn't "On", "Off", "Default Color", "Select Default Color", "Print on …", "Enable", or "Item". Don't grab text that appears AFTER the wrapper (that's where color names sit when the dropdown is open). Use `compareDocumentPosition` if needed.
4. **Checks `isRowEnabled(row)`** the same way the current code does (checkbox / aria-checked / role=switch / textual "Off"). If the row is disabled, skip it.
5. **Looks up the chosen color** for that product from `item.metadata.productColors` (the map passed in from the dashboard). Use a slug map to convert the page label to the Excel slug:
   ```
   T-Shirt                  → t_shirt
   Hoodie                   → hoodie
   Tank                     → tank
   Crewneck                 → crewneck
   Long Sleeve T-Shirt      → long_sleeve
   Baseball Tee             → baseball_tee
   Kids                     → kids
   Kids Hoodie              → kids_hoodie
   Kids Long Sleeve T-Shirt → kids_long_sleeve_t_shirt
   Hats                     → hats
   Shorts                   → shorts
   Bags                     → bags
   ```
6. **Opens the dropdown** by clicking the wrapper's `<a class="dd-selected">` and waits ~150 ms for the options to render.
7. **Finds the matching `<li>`** in the sibling `<ul class="dd-options">`. Match by `label.dd-option-text` text (case-insensitive, trimmed). If no match, log the row name + wanted color + the actual available option labels, then fall back to the first non-placeholder `<li>` (TeePublic requires SOMETHING).
8. **Clicks the matching `<a class="dd-option">`** to commit. Wait ~150 ms.
9. **Verifies** that the wrapper's `dd-selected-value` and `dd-selected-text` updated. If the value is still the placeholder, retry once. If it still fails, log the row name and skip — don't proceed to PUBLISH.
10. **Final pass**: after all rows are processed, re-scan every enabled `div.dd-select` row and confirm none still says "Select Default Color". If any does, return `{ ok: false, unconfigured: [...] }` and the caller must abort the publish.

Signature:
```ts
configureProductTable(productColors: Record<string, string>)
  : Promise<{ ok: boolean; configured: string[]; unconfigured: string[] }>
```

The caller in the automation flow must pass `item.metadata.productColors` from the current `QueueItem`. Search for every call site of `configureProductTable(` and update it.

Use the existing `setSelectValueReactSafe` helper only for any remaining native `<select>` paths if you keep them as a fallback; for `dd-select` use real `click()` calls — the widget needs them.

Use polling-based waits (e.g. wait for `ul.dd-options li` to be visible), not fixed `setTimeout`s longer than ~200 ms between actions.

---

## Required fix #2 — Dashboard: match Excel colors to TeePublic's actual catalog

Right now, `apps/dashboard/lib/parser.ts` reads `t_shirt_color = "White"` and passes `"White"` straight through. If the user puts "White" in every product column, the extension tries to set every Hoodie/Baseball Tee/Kids Hoodie row to "White" — which doesn't exist for those products.

**The dashboard must translate the requested color into a valid available color per product before queueing.**

### Sub-task 2a — build a static catalog of TeePublic colors per product

Create a file like `packages/shared/src/teepublicCatalog.ts` exporting:

```ts
export interface TPColor { id: string; label: string; family?: string; }
export const TEEPUBLIC_CATALOG: Record<string, TPColor[]> = {
  "T-Shirt":                  [/* … */],
  "Hoodie":                   [/* … */],
  "Tank":                     [/* … */],
  "Crewneck":                 [/* … */],
  "Long Sleeve T-Shirt":      [/* … */],
  "Baseball Tee":             [/* … */],
  "Kids":                     [/* … */],
  "Kids Hoodie":              [/* … */],
  "Kids Long Sleeve T-Shirt": [/* … */],
  "Hats":                     [/* … */],
  "Shorts":                   [/* … */],
  "Bags":                     [/* … */],
};
```

Seed it from `Sheet2_Colors` of the user's Excel — that sheet already enumerates every color available per product. Treat NaN/blank cells as end-of-list. Keep labels exactly as TeePublic writes them (case-sensitive, including slashes like "Black/White").

**Note on IDs:** the user does not want to use TeePublic's numeric color IDs (the `dd-option-value` hidden input values). Match by **label text** only, since labels are stable.

The `family` field is optional but useful for similarity matching — group light colors (White, Oatmeal Heather, Natural Heather, Off White, Creme, Heather, Ghost) into `"light"`, blacks/darks into `"dark"`, blues together, greens together, etc.

### Sub-task 2b — write a color matcher

Create `packages/shared/src/colorMatch.ts`:

```ts
export function resolveColor(
  requestedLabel: string,
  productLabel: string,    // "T-Shirt", "Hoodie", "Long Sleeve T-Shirt", ...
  catalog: typeof TEEPUBLIC_CATALOG,
): { chosen: TPColor; reason: "exact" | "substring" | "family" | "fallback" } {
  // 1. Exact match (case-insensitive, trimmed)
  // 2. Substring match — "White" matches "White/Black", "Off White", "Heather White"
  // 3. Family match — map requested to family ("white" → "light"), pick first in family
  // 4. Fallback — first non-placeholder color in the catalog
}
```

Resolution order:

1. **Exact** — `requestedLabel.toLowerCase() === option.label.toLowerCase()`.
2. **Substring (either direction)** — `option.label.toLowerCase().includes(requested)` OR `requested.toLowerCase().includes(option.label.toLowerCase())`. Prefer shorter matches over longer ones (so "White" picks "Off White" before "White/Black/Royal").
3. **Family** — define families:
   - `light`: White, Off White, Oatmeal Heather, Natural Heather, Heather, Creme, Ghost, Butter
   - `dark`: Black, Asphalt, Dark Grey, Charcoal Heather, Forest Green, Navy
   - `red`: Red, Maroon, Burgundy, Garnet, Red Heather
   - `pink`: Soft Pink, Hot Pink, Azalea, Blush, Mauvelous, Lavender
   - `blue`: Navy, Royal Blue, Light Blue, Indigo Blue, Colony Blue, Coastal Blue, Slate, Deep Royal, Navy Heather, Royal Heather, Vintage Royal
   - `green`: Kelly, Sage, Pistachio, Forest Green, Military Green, Sport Green, Moss, Basil, Teal, Dark Green
   - `purple`: Purple, Paragon
   - `orange`: Orange, Tennessee Orange
   - `yellow`: Yellow, Butter
   - `brown`: Brown, Latte, Chestnut
   - `multi`: White/Black, White/Royal, White/Red, White/Kelly, White/Navy, Black/White, Tie Dye, Sunset Stripe, Oxford

   When the requested color matches a family, pick the first option in that product's catalog that belongs to the same family.
4. **Fallback** — return the first non-placeholder color in the catalog. TeePublic must have *something*. Log it loudly.

The return value's `reason` field helps the dashboard show "exact" / "approximate" / "fallback" badges in the UI.

### Sub-task 2c — update the parser

In `apps/dashboard/lib/parser.ts`:

- Keep reading `Sheet2_Colors` and `Sheet3_Enabled` as today.
- After reading the raw `productColors: Record<string, string>` from the row, run each value through `resolveColor(value, productLabelForSlug(slug), TEEPUBLIC_CATALOG)`.
- Store both the original requested label and the resolved label so the dashboard can show "Requested: White → Resolved: Oatmeal Heather (family match)".

### Sub-task 2d — dashboard preview

In the existing Color Preference UI (the one that already shows per-product dropdowns with current values like "T-Shirt: White / Hoodie: Vintage Heather"), show:

- The resolved color label as the current selection.
- A small icon or color tile next to it (the catalog can store image URLs for the swatches if available — TeePublic uses `https://assets.teepublic.com/assets/colors/swatches/color_tile_<slug>-<hash>.png`).
- A badge next to non-exact matches: "approx" for family/substring, "fallback" for last-resort.
- An override dropdown letting the user change the resolved color per (design × product). The override is persisted back into the queue item before sending to the extension.

---

## Required fix #3 — `color.md` at the repo root

Replace the current hardcoded `TABLE_COLOR_MAP` instructions. New `color.md` should say:

> Before clicking PUBLISH on a TeePublic edit page, every product row whose Enable toggle is ON must have a Default Color set in its `div.dd-select` dropdown. The color values are provided by the dashboard via `item.metadata.productColors` (a slug → label map), and the dashboard has already reconciled them against TeePublic's per-product catalog. The extension does NOT pick colors; it only applies what the dashboard chose.
>
> If a row's dropdown can't be set (color not in the option list, click ignored, value reverts), retry once, then abort the publish for that item and report the row name in `unconfigured`. Never publish with empty color rows — TeePublic silently rejects it.

Remove the per-product fixed map. The fallback to "White" / "Vintage Heather" / "Black/White" must NOT live in the extension; it lives in the dashboard's color matcher.

---

## Test plan (do all of these before saying "done")

1. **Unit test the matcher** with the Excel's Sheet2_Colors as the catalog. Verify:
   - `resolveColor("White", "T-Shirt", cat)` → `{ chosen: White, reason: "exact" }`
   - `resolveColor("White", "Hoodie", cat)` → `{ chosen: <Oatmeal Heather or similar>, reason: "family" }`
   - `resolveColor("White", "Baseball Tee", cat)` → `{ chosen: White/Black or similar, reason: "substring" }`
   - `resolveColor("White", "Kids Long Sleeve T-Shirt", cat)` → `{ chosen: Black or Navy or Deep Royal, reason: "fallback" }`
   - `resolveColor("Green", "Hoodie", cat)` → `{ chosen: Sport Green, reason: "family" }`
   - `resolveColor("Green", "Tank", cat)` → `{ chosen: Black/Navy/White/Red, reason: "fallback" }` (Tank has no greens)
2. **Manual extension test** with an existing draft design: load the edit page, open Console, paste the new `configureProductTable` body wrapped in an IIFE, and confirm every enabled row gets a non-placeholder color before any PUBLISH-related code runs.
3. **End-to-end test** with one design from the user's Excel: dashboard queues 1 item → extension uploads → confirm the published URL appears and the chosen colors match what the dashboard preview showed.

---

## Things to NOT change

- The artwork upload flow (already works).
- The metadata fields (title, tags, description, mature content) — already working.
- The "Configure Other Products" section toggles (Mugs, Stickers, etc.) — already working.
- The "Product Colors" palette of colored circles at the bottom — leave at TeePublic default unless the Excel's `product_colors` column says otherwise (currently `All` / `Light` / `Dark`); that's a separate feature.

## Important: expand collapsed sections first

The TeePublic edit page sometimes has the per-product color rows collapsed by default. Before reading `div.dd-select` wrappers, check if there's a "Select Default Color" trigger or a collapsed accordion above the color table and click it to expand. Without this, the dropdowns won't be in the DOM yet and the script will think there are no color rows to set.

Likewise, the `<ul class="dd-options">` for a `dd-select` is only rendered after the wrapper is clicked open. Always click `a.dd-selected` first, then poll for `ul.dd-options li` before reading options.