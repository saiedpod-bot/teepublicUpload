# TeePublic Default-Color Application

Before clicking PUBLISH on a TeePublic edit page, every product row whose
**Enable** toggle is ON must have a Default Color set in its
`div.dd-select` dropdown.

The color labels are provided by the dashboard via
`item.metadata.productColors` — a slug → label map (`t_shirt → "White"`,
`hoodie → "Vintage Heather"`, etc.). The dashboard has already reconciled
those labels against TeePublic's per-product catalog
(see `packages/shared/src/teepublicCatalog.ts` and `colorMatch.ts`), so the
extension does NOT pick colors on its own — it only applies what the
dashboard chose.

## Slug map (page label ↔ Excel slug)

```
T-Shirt                  ↔  t_shirt
Hoodie                   ↔  hoodie
Tank                     ↔  tank
Crewneck                 ↔  crewneck
Long Sleeve T-Shirt      ↔  long_sleeve         (NOT long_sleeve_t_shirt)
Baseball Tee             ↔  baseball_tee
Kids                     ↔  kids
Kids Hoodie              ↔  kids_hoodie
Kids Long Sleeve T-Shirt ↔  kids_long_sleeve_t_shirt
Hats                     ↔  hats
Shorts                   ↔  shorts
Bags                     ↔  bags
```

## Per-row commit flow (extension)

The `dd-select` widget is jQuery-based and does NOT accept setting the
hidden input directly. The library only commits on real clicks.

```
1. Find every  div.dd-select  whose  input.dd-selected-value  reads
   "" / "Select Default Color" / a numeric ID.
2. Walk up to the surrounding row and resolve the product label from the
   text node that appears BEFORE the wrapper in document order.
3. Skip if isRowEnabled(rowContainer) is false.
4. Skip if  label.dd-selected-text  already shows a real color.
5. Open the dropdown:  a.dd-selected .click()
6. Wait until  ul.dd-options  becomes visible with ≥1 <li>.
7. Find the <li> whose  label.dd-option-text  matches productColors[slug]
   (case-insensitive). If no match, log the requested label and the
   actual available labels, then click the first non-placeholder <li>.
8. Click  a.dd-option  inside the chosen <li>.
9. Verify  label.dd-selected-text  changed away from the placeholder.
   If not, retry once. If still empty, mark this row as unconfigured.
10. Final scan: every enabled row must show a real color or the caller
    aborts before clicking PUBLISH.
```

The extension's `configureProductTable(productColors)` returns
`{ ok: boolean; configured: string[]; unconfigured: string[] }`. If
`ok === false`, the caller must NOT click PUBLISH — TeePublic silently
rejects publishes with empty color rows.

## Dashboard responsibility

The dashboard's parser runs `resolveProductColors(requested)` from
`packages/shared/src/colorMatch.ts` against `Sheet2_Colors`. This:

1. Looks up the product's catalog from `TEEPUBLIC_CATALOG`.
2. Resolves the requested color in this order:
   - exact (case-insensitive)
   - substring (shorter option wins)
   - family (white→light, black→dark, blue/navy/royal→blue, …)
   - fallback (first non-placeholder color in the catalog)
3. Returns `{ resolved, audit }` so the UI can show
   "Requested: White → Resolved: Vintage Heather (family)" badges.

The fallback for "no exact match exists" lives in the DASHBOARD, not the
extension. The extension only applies labels — never invents them.

## What NOT to do

- Don't query `<select>` elements — TeePublic uses `<div class="dd-select">`.
- Don't set the hidden `input.dd-selected-value` directly — the widget
  ignores writes; only clicks commit.
- Don't touch the "Product Colors" palette (circles at the bottom) unless
  the Excel's `product_colors` column explicitly says to.
- Don't publish if any enabled row's color is still empty after the retry.
