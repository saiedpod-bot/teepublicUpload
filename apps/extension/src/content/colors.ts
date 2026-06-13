// Per-product color picker for TeePublic.
//
// Flow per product:
//   1. Find the row in the DOM that contains the product label.
//   2. Find the dropdown trigger inside that row (rejects radio buttons).
//   3. Open the dropdown — uses BEFORE/AFTER snapshot diff to detect the
//      newly-mounted popup, so option extraction is scoped to that popup
//      ONLY (no global queries that could pick up "Print on Front").
//   4. Read the actual visible color options from the live DOM.
//   5. Hand options + preferred color to ColorNormalizer.findBestMatch,
//      which always returns a result (degrades to safe-default rather than
//      failing).
//   6. Click the chosen option.
//
// Per-product errors are caught at the orchestrator and never abort the
// upload — TeePublic just gets whatever colors we could pick + its own
// defaults for the rest.

import { sleep } from "../lib/delays";
import { TP } from "../lib/selectors";
import { findBestMatch, categorize, type MatchResult } from "../lib/colorNormalizer";

const log = (msg: string) => console.info("[teepublic-cs] colors:", msg);

// ─── Click helper (real React-friendly click) ────────────────────────────────

export async function fullClick(el: HTMLElement): Promise<void> {
  const r = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, view: window,
                 clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new MouseEvent("pointerdown", init));
  el.dispatchEvent(new MouseEvent("mousedown", init));
  el.dispatchEvent(new MouseEvent("pointerup", init));
  el.dispatchEvent(new MouseEvent("mouseup", init));
  el.dispatchEvent(new MouseEvent("click", init));
  el.click();
}

async function closeAnyPopup(): Promise<void> {
  // Multi-pronged dismissal: Escape key on multiple targets, body click to
  // close blur-dismissable popups, and a final small wait. Critical between
  // products — leftover popups break the snapshot-diff popup detector for
  // the next pick (no "new" visible elements appear if the previous popup
  // is still open).
  for (let i = 0; i < 3; i++) {
    document.dispatchEvent(new KeyboardEvent("keydown",  { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
  }
  // Click on a corner of the document body, far from any dropdown.
  try {
    document.body.click();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 0, clientY: 0 }));
    document.body.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, clientX: 0, clientY: 0 }));
  } catch { /* ignore */ }
  // Blur whatever's currently focused.
  if (document.activeElement instanceof HTMLElement) {
    try { document.activeElement.blur(); } catch { /* ignore */ }
  }
  await sleep(200);
}

// ─── Snapshot-diff popup detection ───────────────────────────────────────────

function visibleElementsSet(): Set<HTMLElement> {
  const set = new Set<HTMLElement>();
  for (const el of document.body.getElementsByTagName("*")) {
    if (!(el instanceof HTMLElement)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) set.add(el);
  }
  return set;
}

function isPopupContainer(el: HTMLElement): boolean {
  // Tier 1: explicit container role/class.
  for (const sel of TP.popupContainer) {
    try { if (el.matches(sel)) return true; } catch { /* invalid selector — skip */ }
  }
  // Tier 2: contains ≥3 children matching known option-item selectors.
  try {
    if (el.querySelectorAll(TP.optionItem.join(", ")).length >= 3) return true;
  } catch { /* ignore */ }
  // Tier 3: contains ≥3 elements with cursor:pointer + short leaf text.
  // This catches custom markups like TeePublic's <a class="dd-option"> list.
  let optionLikeCount = 0;
  for (const desc of el.querySelectorAll<HTMLElement>("*")) {
    const r = desc.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    let cursor = "";
    try { cursor = window.getComputedStyle(desc).cursor; } catch { /* ignore */ }
    if (cursor !== "pointer") continue;
    const text = (desc.textContent ?? "").trim();
    if (text.length < 2 || text.length > 50) continue;
    optionLikeCount++;
    if (optionLikeCount >= 3) return true;
  }
  return false;
}

async function openDropdown(trigger: HTMLElement, timeoutMs = 1500): Promise<HTMLElement | null> {
  const before = visibleElementsSet();
  await fullClick(trigger);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(80);
    const newOnes: HTMLElement[] = [];
    for (const el of document.body.getElementsByTagName("*")) {
      if (!(el instanceof HTMLElement)) continue;
      if (before.has(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      newOnes.push(el);
    }
    const popups = newOnes.filter(isPopupContainer);
    if (popups.length > 0) {
      popups.sort((a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length);
      return popups[0];
    }
  }
  return null;
}

// Try clicking the trigger; if no popup appears, walk up to ancestors and
// try each in turn. Some React component libraries listen for events on a
// specific wrapper element a few levels above the visible text.
async function openDropdownWithRetries(trigger: HTMLElement, row: HTMLElement): Promise<HTMLElement | null> {
  let current: HTMLElement | null = trigger;
  for (let attempt = 0; attempt < 4 && current; attempt++) {
    const popup = await openDropdown(current);
    if (popup) {
      if (attempt > 0) {
        log(`  popup opened on retry #${attempt} (ancestor depth ${attempt})`);
      }
      return popup;
    }
    if (current === row || !current.parentElement || current.parentElement === row.parentElement) break;
    current = current.parentElement;
  }
  return null;
}

// Brute-force: gather EVERY plausible trigger in the row and try each,
// using both mouse clicks and keyboard activation. Stops at first success.
async function bruteForceOpenDropdown(row: HTMLElement): Promise<HTMLElement | null> {
  const tried = new Set<HTMLElement>();
  const candidates: HTMLElement[] = [];

  const isSafe = (el: Element) =>
    !el.closest('input[type="radio"], input[type="checkbox"]') &&
    !el.querySelector('input[type="radio"], input[type="checkbox"]');

  const push = (el: HTMLElement | null) => {
    if (!el) return;
    if (tried.has(el)) return;
    if (!isSafe(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    tried.add(el);
    candidates.push(el);
  };

  // 1. ARIA / role triggers
  for (const el of row.querySelectorAll<HTMLElement>('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"], [aria-expanded]')) push(el);

  // 2. Class-name based dropdown components (broad)
  for (const el of row.querySelectorAll<HTMLElement>('[class*="select" i], [class*="dropdown" i], [class*="picker" i], [class*="combobox" i]')) push(el);

  // 2b. TeePublic-specific class patterns (BEM + JS hooks observed in DOM).
  for (const el of row.querySelectorAll<HTMLElement>('[class*="m-uploader" i], [class*="js" i], [class*="apparel" i], [class*="__color" i], [class*="-color" i]')) push(el);

  // 3. Elements directly containing "Select Default Color" + their ancestors up to 5 levels
  for (const el of row.querySelectorAll<HTMLElement>("*")) {
    const t = el.textContent?.trim().toLowerCase() ?? "";
    if (!/primary color|select default color|select color/i.test(t)) continue;
    if (el.children.length > 5) continue;
    push(el);
    let p: HTMLElement | null = el.parentElement;
    for (let i = 0; i < 5 && p && p !== row; i++, p = p.parentElement) push(p);
  }

  // 4. Elements showing a current color name (closed dropdown trigger)
  const colorText = /^(white|black|navy|royal|charcoal|asphalt|oxford|oatmeal|cream|sand|ash|stone|kelly|forest|maroon|burgundy|vintage[^/]*|heather[^/]*|[a-z]+ heather|[a-z]+\/[a-z]+|deep [a-z]+)$/i;
  for (const el of row.querySelectorAll<HTMLElement>("*")) {
    const t = el.textContent?.trim() ?? "";
    if (t.length > 0 && t.length < 30 && colorText.test(t) && el.children.length === 0) {
      push(el);
      let p: HTMLElement | null = el.parentElement;
      for (let i = 0; i < 4 && p && p !== row; i++, p = p.parentElement) push(p);
    }
  }

  // 5. Buttons / focusable elements / cursor:pointer ancestors of the placeholder
  for (const el of row.querySelectorAll<HTMLElement>('button, [role="button"], [tabindex="0"], input:not([type="hidden"])')) push(el);
  for (const el of row.querySelectorAll<HTMLElement>("*")) {
    try {
      if (window.getComputedStyle(el).cursor === "pointer") push(el);
    } catch { /* ignore */ }
  }

  log(`  brute-force: trying ${candidates.length} candidate trigger(s)`);

  for (const cand of candidates) {
    // Focus + click + keyboard activation cocktail.
    try { cand.focus(); } catch { /* not focusable */ }
    const popup = await tryActivate(cand);
    if (popup) {
      log(`  ✓ popup opened via <${cand.tagName.toLowerCase()} class="${trimClass(cand)}">`);
      return popup;
    }
  }
  return null;
}

async function tryActivate(el: HTMLElement): Promise<HTMLElement | null> {
  const before = visibleElementsSet();
  await fullClick(el);
  // Some libraries open on ArrowDown / Enter / Space rather than click.
  const keyInits = [
    { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    { key: "Enter",     code: "Enter",     keyCode: 13 },
    { key: " ",         code: "Space",     keyCode: 32 },
  ];
  for (const k of keyInits) {
    el.dispatchEvent(new KeyboardEvent("keydown", { ...k, bubbles: true, cancelable: true }));
  }

  // Wait briefly and check for new popup.
  for (let i = 0; i < 12; i++) {
    await sleep(80);
    const newOnes: HTMLElement[] = [];
    for (const x of document.body.getElementsByTagName("*")) {
      if (!(x instanceof HTMLElement)) continue;
      if (before.has(x)) continue;
      const r = x.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      newOnes.push(x);
    }
    const popups = newOnes.filter(isPopupContainer);
    if (popups.length > 0) {
      popups.sort((a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length);
      return popups[0];
    }
  }
  return null;
}

// Diagnostic dump: print every interactive-looking element in the row with
// its tag, classes, role, aria attrs, and computed cursor.
function dumpRowInteractives(row: HTMLElement, productLabel: string): void {
  log(`──── debug: row interactives for "${productLabel}" ────`);
  const seen = new Set<HTMLElement>();
  let count = 0;
  for (const el of row.querySelectorAll<HTMLElement>("*")) {
    if (seen.has(el)) continue;
    seen.add(el);
    let cursor = "";
    try { cursor = window.getComputedStyle(el).cursor; } catch { /* ignore */ }
    const role = el.getAttribute("role");
    const haspopup = el.getAttribute("aria-haspopup");
    const expanded = el.getAttribute("aria-expanded");
    const cls = trimClass(el);
    const interesting =
      cursor === "pointer" || el.tagName === "BUTTON" || el.tagName === "SELECT" ||
      role || haspopup || expanded ||
      /select|dropdown|picker|combobox|color|apparel|js[A-Z]/.test(cls);
    if (!interesting) continue;
    if (count > 25) break;
    count++;
    const text = (el.textContent ?? "").trim().slice(0, 40);
    log(`  <${el.tagName.toLowerCase()} class="${cls}" role="${role ?? ""}" haspopup="${haspopup ?? ""}" cursor="${cursor}"> "${text}"`);
  }
  if (count === 0) log("  (no interactive children found in row)");
}

function trimClass(el: HTMLElement): string {
  const cls = typeof el.className === "string" ? el.className : "";
  return cls.length > 50 ? cls.slice(0, 50) + "…" : cls;
}

// Search for a native <select> related to this row. Many "custom-looking"
// dropdowns are actually a hidden native <select> styled with appearance:none
// and a div facade on top — this is the simplest robust path because we can
// set value directly without opening anything.
//
// Tries:
//   1. Direct descendant <select>
//   2. Visually-overlapping <select> (positioned inside the row's rect)
//   3. <select> in the row's nearest <tr> ancestor (handles td-only rows)
//   4. Any <select> on the page whose options look like colors AND whose
//      closest "row" container contains the product label
function findRowNativeSelect(row: HTMLElement): HTMLSelectElement | null {
  const colorish = (s: HTMLSelectElement) => {
    const opts = Array.from(s.options).map((o) => o.text.toLowerCase());
    if (opts.length < 3) return false;
    const tokens = ["white", "black", "navy", "royal", "heather", "charcoal", "asphalt", "kelly", "forest", "default", "select"];
    return opts.filter((o) => tokens.some((t) => o.includes(t))).length >= 2;
  };

  // 1. Direct descendant.
  const direct = row.querySelector<HTMLSelectElement>("select");
  if (direct && colorish(direct)) return direct;

  // 2. Visually overlapping selects.
  const rowRect = row.getBoundingClientRect();
  for (const s of document.querySelectorAll<HTMLSelectElement>("select")) {
    if (!colorish(s)) continue;
    const r = s.getBoundingClientRect();
    if (r.top >= rowRect.top - 5 && r.bottom <= rowRect.bottom + 5 &&
        r.left >= rowRect.left - 5 && r.right <= rowRect.right + 5) {
      return s;
    }
  }

  // 3. Walk up to the enclosing <tr> and try its descendants.
  const tr = row.closest("tr");
  if (tr) {
    const inTr = tr.querySelector<HTMLSelectElement>("select");
    if (inTr && colorish(inTr)) return inTr;
  }

  return null;
}

// ─── Option extraction (scoped to popup, no globals) ─────────────────────────

interface OptionItem { el: HTMLElement; text: string; }

function collectColorOptions(popup: HTMLElement): OptionItem[] {
  // Strategy A — explicit option-role/class selectors.
  const strict = collectViaSelectors(popup, TP.optionItem.join(", "));
  if (strict.length > 0) return strict;

  // Strategy B — common list elements.
  const list = collectViaSelectors(popup, "li, button, [role='menuitem']");
  if (list.length > 0) return list;

  // Strategy C — permissive scan: ANY descendant whose direct text reads
  // like a color name. Handles div-only markup (no <li>, no role="option").
  return collectViaPermissiveScan(popup);
}

function collectViaSelectors(popup: HTMLElement, selector: string): OptionItem[] {
  const items: OptionItem[] = [];
  const seen = new Set<string>();
  for (const el of popup.querySelectorAll<HTMLElement>(selector)) {
    const text = sanitizeOptionText(el);
    if (!text || seen.has(text)) continue;
    if (rejectsAsOption(el, text)) continue;
    seen.add(text);
    items.push({ el, text });
  }
  return items;
}

// Walk every descendant; pick elements whose DIRECT text (not children's text)
// looks like a color name. Picks the deepest leaf so clicks land on the
// option's clickable wrapper, not a parent containing many options.
function collectViaPermissiveScan(popup: HTMLElement): OptionItem[] {
  const items: OptionItem[] = [];
  const seen = new Set<string>();
  for (const el of popup.querySelectorAll<HTMLElement>("*")) {
    // Direct text content (no concat of children's text).
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => (n.textContent ?? "").trim())
      .filter(Boolean)
      .join(" ");
    let text = directText;
    if (!text && el.children.length <= 3) {
      // Small element — accept full textContent.
      text = (el.textContent ?? "").trim();
    }
    text = sanitizeRawText(text);
    if (!text || seen.has(text)) continue;
    if (rejectsAsOption(el, text)) continue;
    seen.add(text);
    items.push({ el, text });
  }
  return items;
}

function sanitizeOptionText(el: HTMLElement): string {
  return sanitizeRawText((el.textContent ?? "").trim());
}

function sanitizeRawText(text: string): string {
  if (!text) return "";
  if (text.length > 50) return "";
  if (text.length < 2) return "";
  // Color-name shape: starts with letter, contains letters/spaces/safe punct.
  if (!/^[A-Za-z][A-Za-z0-9\s/'\-&.]*$/.test(text)) return "";
  return text;
}

function rejectsAsOption(el: HTMLElement, text: string): boolean {
  if (el.querySelector('input[type="radio"], input[type="checkbox"]')) return true;
  if (el.closest('input[type="radio"], input[type="checkbox"]')) return true;
  if (/^print on /i.test(text)) return true;
  if (/^(yes|no|on|off|enable|disable|select|none|all|light|dark)$/i.test(text)) return true;
  if (/^front( ?& ?back)?$|^back$/i.test(text)) return true;
  if (/^select default color$/i.test(text)) return true;
  return false;
}

// ─── Row + trigger location ──────────────────────────────────────────────────

const COLOR_TOKENS = [
  "white", "black", "vintage", "heather", "navy", "royal", "charcoal",
  "asphalt", "oxford", "oatmeal", "cream", "sand", "ash", "stone",
  "kelly", "forest", "maroon", "burgundy",
];

function findProductRow(productLabel: string): HTMLElement | null {
  const wanted = productLabel.toLowerCase();
  let best: HTMLElement | null = null;
  let bestScore = -Infinity;

  for (const el of document.querySelectorAll<HTMLElement>('tr, [role="row"], li, fieldset, section, div')) {
    const text = (el.textContent ?? "").toLowerCase().trim();
    if (!text.includes(wanted)) continue;
    if (text.length > 4000) continue;
    if (/no available album|manage album|adult themes|mature content/.test(text)) continue;

    let score = 0;
    if (/(primary|select default|select)\s*color/i.test(text)) score += 100;
    if (hasDropdownish(el))                                    score += 50;
    if (COLOR_TOKENS.some((t) => text.includes(t)))            score += 40;
    if (el.querySelector("select"))                            score += 20;
    score += Math.max(0, 1500 - text.length) / 50;
    if (new RegExp(`\\b${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) score += 10;

    if (score > bestScore) { best = el; bestScore = score; }
  }
  return best;
}

function hasDropdownish(el: HTMLElement): boolean {
  return !!el.querySelector(
    'select, [role="combobox"], [role="listbox"], [aria-haspopup], ' +
    '[class*="dropdown" i], [class*="select__control" i], [class*="select-control" i], ' +
    '[class*="custom-select" i], [class*="react-select" i], [class*="picker" i]'
  );
}

// Find the dropdown trigger — the clickable ancestor of the "Select Default
// Color" placeholder text. The row's product-name label (e.g. "Hoodie") is
// NOT a valid trigger; we explicitly target the placeholder element first.
function findDropdownTrigger(row: HTMLElement): HTMLElement | null {
  const inRadio    = (el: Element) => !!el.closest('input[type="radio"], input[type="checkbox"]');
  const wrapsRadio = (el: Element) => !!el.querySelector('input[type="radio"], input[type="checkbox"]');

  // Tier 1: Standard ARIA roles for combobox/popup triggers.
  const aria = row.querySelector<HTMLElement>('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]');
  if (aria && !inRadio(aria) && !wrapsRadio(aria)) return aria;

  // Tier 2: Common dropdown component classes (react-select, MUI, etc.).
  const classBased = row.querySelector<HTMLElement>(
    '[class*="select__control" i], [class*="select-control" i], ' +
    '[class*="dropdown__control" i], [class*="dropdown-control" i], ' +
    '[class*="custom-select" i], [class*="react-select" i], ' +
    '[class*="MuiSelect" i], [class*="MuiAutocomplete" i], ' +
    '[class*="dropdown__trigger" i], [class*="dropdown-trigger" i]'
  );
  if (classBased && !inRadio(classBased) && !wrapsRadio(classBased)) return classBased;

  // Tier 3: Walk UP from the "Select Default Color" placeholder text. This is
  // the explicit user request — click on the placeholder, NOT the product name.
  for (const el of row.querySelectorAll<HTMLElement>("*")) {
    if (inRadio(el) || wrapsRadio(el)) continue;
    const t = el.textContent?.trim().toLowerCase() ?? "";
    if (/primary color|select default color|select color/i.test(t) && el.children.length < 5) {
      const target = findDropdownContainer(el) ?? findCursorPointerAncestor(el) ?? clickableAncestor(el);
      if (target) return target;
    }
  }

  // Tier 4: Walk UP from a leaf node showing a current color name (closed dropdown).
  const colorText = /^(white|black|navy|royal|charcoal|asphalt|oxford|oatmeal|cream|sand|ash|stone|kelly|forest|maroon|burgundy|vintage[^/]*|heather[^/]*|[a-z]+ heather|[a-z]+\/[a-z]+|deep [a-z]+)$/i;
  for (const el of row.querySelectorAll<HTMLElement>("*")) {
    if (inRadio(el) || wrapsRadio(el)) continue;
    const t = el.textContent?.trim() ?? "";
    if (t.length > 0 && t.length < 30 && colorText.test(t) && el.children.length === 0) {
      const target = findDropdownContainer(el) ?? findCursorPointerAncestor(el) ?? clickableAncestor(el);
      if (target) return target;
    }
  }

  // Tier 5: Last resort.
  const buttons = row.querySelectorAll<HTMLElement>('button, [tabindex="0"], [role="button"]');
  for (const b of buttons) if (!inRadio(b) && !wrapsRadio(b)) return b;
  return null;
}

// Walk up looking for an ancestor whose className suggests a dropdown container.
function findDropdownContainer(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el;
  for (let d = 0; cur && d < 8; d++, cur = cur.parentElement) {
    const cls = typeof cur.className === "string" ? cur.className : "";
    if (/select__control|select-control|dropdown__control|dropdown-control|dropdown__toggle|custom-select__control|MuiSelect|MuiAutocomplete/i.test(cls)) {
      return cur;
    }
    if (cur.getAttribute("role") === "combobox") return cur;
    if (cur.hasAttribute("aria-haspopup")) return cur;
  }
  return null;
}

// Walk up looking for an ancestor with `cursor: pointer` — a CSS-universal
// signal of clickability.
function findCursorPointerAncestor(el: HTMLElement, maxDepth = 6): HTMLElement | null {
  let cur: HTMLElement | null = el;
  for (let d = 0; cur && d < maxDepth; d++, cur = cur.parentElement) {
    try {
      const style = window.getComputedStyle(cur);
      if (style.cursor === "pointer") return cur;
    } catch { /* getComputedStyle can fail on detached nodes — ignore */ }
  }
  return null;
}

function clickableAncestor(el: HTMLElement): HTMLElement {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.tagName === "BUTTON") return cur;
    const role = cur.getAttribute("role");
    if (role === "combobox" || role === "button") return cur;
    if (cur.hasAttribute("aria-haspopup")) return cur;
    cur = cur.parentElement;
  }
  return el;
}

// ─── Per-product orchestration ───────────────────────────────────────────────

export const PRODUCT_LABELS: Record<string, string[]> = {
  t_shirt:                  ["T-Shirt", "Tee"],
  hoodie:                   ["Hoodie"],
  tank:                     ["Tank"],
  crewneck:                 ["Crewneck"],
  long_sleeve:              ["Long Sleeve T-Shirt", "Long Sleeve"],
  baseball_tee:             ["Baseball Tee"],
  kids:                     ["Kids"],
  kids_hoodie:              ["Kids Hoodie"],
  kids_long_sleeve_t_shirt: ["Kids Long Sleeve T-Shirt", "Kids Long Sleeve"],
  hats:                     ["Hat"],
  shorts:                   ["Shorts"],
  bags:                     ["Bag"],
};

// TeePublic auto-propagates a color set on T-Shirt to compatible apparel
// (Tank, Crewneck, Kids, Long Sleeve, Baseball Tee, etc.). Configuring this
// product first means most of the apparel rows will be auto-filled, and we
// only need to hit the few that aren't.
const PRIMARY_PROPAGATOR = "t_shirt";

const PROPAGATION_WAIT_MS = 3500;

// ─── V2: product-table color picker (per color.md spec) ────────────────────
// Native <select> targeting + hardcoded per-product mapping. Replaces the
// older fuzzy-match path which got tangled in TeePublic's custom dropdowns.

/** Hardcoded fallback when the Excel `productColors` doesn't carry a value
 *  for a given product row. Per-row preferred colors come from the Excel
 *  per-design map; this map is only used as a last-resort default. */
const TABLE_COLOR_MAP: Record<string, string> = {
  "t-shirt":                  "White",
  "hoodie":                   "Vintage Heather",
  "tank":                     "White",
  "crewneck":                 "White",
  "long sleeve t-shirt":      "White",
  "baseball tee":             "Black/White",
  "kids":                     "White",
  "kids hoodie":              "Vintage Royal",
  "kids long sleeve t-shirt": "Navy",
};

/** Translate the page row label ("T-Shirt", "Long Sleeve T-Shirt", …) into
 *  the slug used by the dashboard parser's readColors(). The slug is the
 *  Excel column name with the trailing "_color" / "_colors" stripped.
 *  Example: Excel column `long_sleeve_color` → slug `long_sleeve`, not
 *  `long_sleeve_t_shirt`, even though the on-page row label is
 *  "Long Sleeve T-Shirt". Keep this in sync with the Excel column names
 *  the parser strips in apps/dashboard/lib/parser.ts readColors(). */
const PRODUCT_NAME_TO_EXCEL_SLUG: Record<string, string> = {
  "t-shirt":                  "t_shirt",
  "hoodie":                   "hoodie",
  "tank":                     "tank",
  "crewneck":                 "crewneck",
  "long sleeve t-shirt":      "long_sleeve",
  "baseball tee":             "baseball_tee",
  "kids":                     "kids",
  "kids hoodie":              "kids_hoodie",
  "kids long sleeve t-shirt": "kids_long_sleeve_t_shirt",
  "hats":                     "hats",
  "shorts":                   "shorts",
  "bags":                     "bags",
};

/** Resolve the preferred color for a product row:
 *  1. productColors[slug] (from the Excel per-design map) if present + non-empty
 *  2. TABLE_COLOR_MAP[rowName.toLowerCase()] as fallback
 *  3. Plain "White" as ultimate default. */
type PreferredColor = {
  value: string;
  slug: string;
  source: "dashboard" | "fallback" | "ultimate-default";
};

function pickPreferredColor(
  rowName: string,
  productColors?: Record<string, string>,
): PreferredColor {
  const lower = rowName.toLowerCase();
  const slug = PRODUCT_NAME_TO_EXCEL_SLUG[lower] ?? "";
  if (productColors && slug) {
    const v = productColors[slug];
    if (v && v.trim()) return { value: v.trim(), slug, source: "dashboard" };
  }
  const fallback = TABLE_COLOR_MAP[lower];
  if (fallback) return { value: fallback, slug, source: "fallback" };
  return { value: "White", slug, source: "ultimate-default" };
}

interface DdRow { name: string; wrapper: HTMLElement; rowContainer: HTMLElement; }

/** Find every color-bearing dd-select widget on the page. */
function findDdSelectRows(): DdRow[] {
  const out: DdRow[] = [];
  for (const wrapper of document.querySelectorAll<HTMLElement>("div.dd-select")) {
    const valueInput = wrapper.querySelector<HTMLInputElement>("input.dd-selected-value");
    if (!valueInput) continue;
    // Accept widgets whose current value is the placeholder OR a numeric ID
    // (TeePublic stores color IDs like "12", "4", etc.). This filters out
    // unrelated dropdowns (Albums, Country, Currency).
    const v = (valueInput.value ?? "").trim();
    const isColorish = v === "" || v === "Select Default Color" || /^\d+$/.test(v);
    if (!isColorish) continue;
    const rowContainer = findDdRowContainer(wrapper);
    const name = resolveDdRowName(wrapper, rowContainer);
    if (!name) continue;
    out.push({ name, wrapper, rowContainer });
  }
  return out;
}

/** Walk up from a dd-select wrapper to find its enclosing <tr>. TeePublic's
 *  product table uses real <tr data-id data-name> rows — that's the unit we
 *  want to anchor the enable toggle + color picker to. */
function findDdRowContainer(wrapper: HTMLElement): HTMLElement {
  const tr = wrapper.closest("tr") as HTMLElement | null;
  if (tr) return tr;
  // Fallback for non-table layouts (defensive — TeePublic uses <tr>).
  let cur: HTMLElement | null = wrapper.parentElement;
  while (cur && cur !== document.body) {
    if (cur.getAttribute("role") === "row") return cur;
    const cls = typeof cur.className === "string" ? cur.className : "";
    if (/\b(apparel_row|product_row|product-row|item-row)\b/.test(cls)) return cur;
    cur = cur.parentElement;
  }
  return wrapper.parentElement ?? wrapper;
}

/** Prefer the <tr data-name="..."> attribute as the canonical product label —
 *  TeePublic sets it explicitly ("T-Shirt", "Kids Long Sleeve T-Shirt", etc.).
 *  Falls back to text-node scraping for non-standard layouts. */
function resolveDdRowName(wrapper: HTMLElement, container: HTMLElement): string | null {
  // Primary: data-name on the row.
  const attr = container.getAttribute("data-name");
  if (attr && attr.trim()) return attr.trim();

  // Fallback: scrape text nodes that appear BEFORE the wrapper in doc order.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (wrapper.contains(node)) continue;
    const pos = wrapper.compareDocumentPosition(node);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) continue;
    const t = (node.textContent ?? "").trim();
    if (!t) continue;
    if (/^(on|off|enable|item|default color|select default color|print on .+)$/i.test(t)) continue;
    if (t.length > 40) continue;
    if (!/^[A-Za-z][A-Za-z\s/'\-&]*$/.test(t)) continue;
    return t;
  }
  return null;
}

function extractRowProductName(row: HTMLElement): string | null {
  // Walk leaf text nodes; the product name is the FIRST short label-shaped string.
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = (walker.currentNode.textContent ?? "").trim();
    if (!t) continue;
    if (/^(on|off|enable|default color|select default color|print on .+)$/i.test(t)) continue;
    if (t.length > 40) continue;
    if (!/^[A-Za-z][A-Za-z\s/'\-&]*$/.test(t)) continue;
    return t;
  }
  return null;
}

/** Read the Enable state from a TeePublic apparel <tr>.
 *
 *  Two row variants exist:
 *
 *  1. WITH toggle (T-Shirt, Hoodie, Kids, …) — markup:
 *       <div class="apparel_swapper">
 *         <div class="on-off canvas-enable">
 *           <input type="hidden" name="canvas-option[N]" value="true|false">
 *           <span class="enabled|disabled"></span>
 *         </div>
 *       </div>
 *     Source of truth is the canvas-option hidden input's value.
 *
 *  2. WITHOUT toggle (Shorts, Bags, …) — markup is just canvas_label +
 *     primary_color (a dd-select for color). There is no apparel_swapper,
 *     no canvas-enable, no checkbox at all. These rows are ALWAYS enabled
 *     and still need a primary color picked.
 *
 *  NEVER text-match the row — the ON/OFF labels exist as sibling spans in
 *  the DOM at the same time, so textContent concatenates to "ONOFF". */
function isRowEnabled(row: HTMLElement): boolean {
  // Strategy 1: TeePublic's canvas-option hidden input — authoritative.
  const hidden = row.querySelector<HTMLInputElement>(
    '.canvas-enable input[type="hidden"], input[name^="canvas-option"]'
  );
  if (hidden) return hidden.value === "true";

  // Strategy 2: the .on-off span — class flips between "enabled" / "disabled".
  const span = row.querySelector<HTMLElement>(
    '.on-off.canvas-enable span, .canvas-enable span, .on-off span'
  );
  if (span) {
    if (span.classList.contains("enabled"))  return true;
    if (span.classList.contains("disabled")) return false;
  }

  // Strategy 3: aria-checked switch (other layouts).
  const aria = row.querySelector('[role="switch"], [aria-checked]');
  if (aria) {
    const v = aria.getAttribute("aria-checked");
    if (v === "true")  return true;
    if (v === "false") return false;
  }

  // Strategy 4: native checkbox — but IGNORE checkboxes nested inside the
  // color dropdown. TeePublic's dd-select library renders one <input> per
  // color option (often as <input type="checkbox">) even before the dropdown
  // is opened; those are always unchecked at row load and would incorrectly
  // return false for rows whose enable state has nothing to do with them.
  for (const cb of row.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    if (cb.closest('.dd-select, .dd-options, ul.dd-options')) continue;
    return cb.checked;
  }

  // Strategy 5 (default): rows with NO toggle at all (Shorts, Bags) are
  // always enabled and still need a primary color picked. Returning true
  // here is what lets configureProductTable proceed past them instead of
  // logging "Enable toggle is OFF, skipping".
  return true;
}

function isPlaceholder(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "" || t === "select default color" || t === "select color" ||
         t === "default color" || t === "select";
}

/** Set <select>.value via the native setter + dispatch input/change so React
 *  picks up the change. Per color.md exact instructions. */
function setSelectValueReactSafe(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event("input",  { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Find the <ul class="dd-options"> sibling for a dd-select wrapper. */
function findOptionsList(wrapper: HTMLElement): HTMLElement | null {
  // Most common: immediate next sibling.
  let next = wrapper.nextElementSibling;
  while (next) {
    if (next.tagName === "UL" && next.classList.contains("dd-options")) return next as HTMLElement;
    next = next.nextElementSibling;
  }
  // Fall back: search inside the parent.
  const parent = wrapper.parentElement;
  return parent?.querySelector<HTMLElement>("ul.dd-options") ?? null;
}

/** Locate the <ul class="dd-options"> for a wrapper. The library mounts the
 *  list in any of these positions depending on widget configuration:
 *    - inside the wrapper itself
 *    - as a sibling of the wrapper inside a shared <div class="dd-container">
 *    - as a sibling inside the wrapper's parent element
 *  Try each in turn. */
function findOptionsUl(wrapper: HTMLElement): HTMLElement | null {
  // Inside the wrapper.
  const inside = wrapper.querySelector<HTMLElement>("ul.dd-options");
  if (inside) return inside;

  // Sibling inside dd-container (real TeePublic layout):
  //   <div class="dd-container">
  //     <div class="dd-select">…</div>
  //     <ul class="dd-options">…</ul>
  //   </div>
  const container = wrapper.closest<HTMLElement>(".dd-container");
  if (container) {
    const inContainer = container.querySelector<HTMLElement>("ul.dd-options");
    if (inContainer) return inContainer;
  }

  // Fall back: parent element.
  const inParent = wrapper.parentElement?.querySelector<HTMLElement>("ul.dd-options");
  return inParent ?? null;
}

/** A dd-options list is "open" once its options have rendered AND it's
 *  visible. offsetParent alone is too strict — some dd-options stay
 *  display:block but offsetParent reports null (positioned ancestor quirks).
 *  Accept the union of three visibility signals. */
function isDdOptionsVisible(ul: HTMLElement): boolean {
  if (ul.querySelectorAll("li").length <= 1) return false;
  if (ul.offsetParent !== null) return true;
  try {
    if (window.getComputedStyle(ul).display !== "none") return true;
  } catch { /* getComputedStyle can fail on detached nodes — ignore */ }
  if (ul.getClientRects().length > 0) return true;
  return false;
}

/** Verified-working per-row commit sequence.
 *  Open trigger via fullClick → poll for options list to render and be
 *  visible → fullClick matching <li>'s <a.dd-option> → wait → verify the
 *  wrapper's dd-selected-text changed.
 *
 *  Why fullClick: TeePublic's dd-select library binds on the synthesised
 *  pointerdown/mousedown event pair, not on click(). A bare HTMLElement.click()
 *  fires only the click event and the dropdown silently stays closed. */
async function setRowColor(
  wrapper: HTMLElement,
  wantedLabel: string,
): Promise<{ ok: true; chosen: string } | { ok: false; reason: string }> {
  // 1. Open the dropdown via the full pointer/mouse/click event cocktail.
  const trigger = wrapper.querySelector<HTMLElement>("a.dd-selected");
  if (!trigger) return { ok: false, reason: "no trigger" };
  await fullClick(trigger);

  // 2. Poll up to 2s for the options list to render AND be visible. The
  // library renders the placeholder <li> immediately, so > 1 means real
  // options have loaded. Visibility uses the relaxed isDdOptionsVisible
  // check — some dd-options stay display:block but report offsetParent null.
  const pollOpen = async (iterations: number): Promise<HTMLElement | null> => {
    for (let i = 0; i < iterations; i++) {
      await sleep(50);
      const ul = findOptionsUl(wrapper);
      if (ul && isDdOptionsVisible(ul)) return ul;
    }
    return null;
  };
  let ul = await pollOpen(40);
  if (!ul) {
    // Some widgets need a second activation to actually open.
    await fullClick(trigger);
    ul = await pollOpen(20);
  }
  if (!ul) return { ok: false, reason: "dropdown never opened" };

  // 3. Find the <li> matching wantedLabel (case-insensitive, trimmed).
  const lis = Array.from(ul.querySelectorAll<HTMLElement>("li"));
  const labelOf = (li: HTMLElement) =>
    (li.querySelector<HTMLElement>("label.dd-option-text")?.textContent ?? "").trim();

  let target = lis.find((li) => labelOf(li).toLowerCase() === wantedLabel.toLowerCase()) ?? null;
  let isFallback = false;

  // 4. If no exact match, fall back to the first non-placeholder.
  if (!target) {
    const availableLabels = lis.map(labelOf).filter((t) => t && !isPlaceholder(t));
    log(`    ⚠ "${wantedLabel}" not in options [${availableLabels.join(", ")}] — falling back`);
    target = lis.find((li) => {
      const t = labelOf(li);
      return t && !isPlaceholder(t);
    }) ?? null;
    isFallback = true;
  }
  if (!target) return { ok: false, reason: "no non-placeholder options" };

  // 5. Commit the option via the full event cocktail (matches step 1's
  // reasoning — click() alone is silently ignored by the library handler).
  const optAnchor = target.querySelector<HTMLElement>("a.dd-option");
  if (!optAnchor) return { ok: false, reason: "li has no anchor" };
  await fullClick(optAnchor);

  // 6. Wait briefly, then verify the wrapper updated.
  await sleep(200);
  const newText = (wrapper.querySelector<HTMLElement>("label.dd-selected-text")?.textContent ?? "").trim();
  if (!newText || isPlaceholder(newText)) {
    return { ok: false, reason: "value did not commit" };
  }
  return { ok: true, chosen: isFallback ? `${newText} (fallback)` : newText };
}

/** Read the currently-committed visible color label from the wrapper. */
function readDdSelectedText(wrapper: HTMLElement): string {
  return (wrapper.querySelector<HTMLElement>("label.dd-selected-text")?.textContent ?? "").trim();
}

/** Expand any collapsed sections / scroll the products table into view so
 *  React mounts the dd-select widgets we need to interact with. */
async function expandAndRevealProductTable(): Promise<void> {
  // Try to find the products table and scroll it into view.
  const tableCandidates = Array.from(document.querySelectorAll<HTMLElement>("table, [class*='product' i], [class*='apparel' i]"));
  for (const el of tableCandidates) {
    const text = (el.textContent ?? "").toLowerCase();
    if (text.includes("default color") || text.includes("select default color")) {
      el.scrollIntoView({ behavior: "auto", block: "start" });
      await sleep(200);
      return;
    }
  }
}

// ─── Per-design enable/disable toggle ──────────────────────────────────────

function normalizeProductName(s: string): string {
  return s.toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "Tee" → "t shirt" so the Excel column variant lines up with the page label.
    .replace(/\btee\b/g, "t shirt");
}

/** Canvas-tile class token (e.g. "hat" from div.canvas.hat) → display name.
 *  Tiles have no data-name, so the product name comes from the container's
 *  second class. Handles wall_art/wallart spelling variants. */
export const TILE_CLASS_TO_NAME: Record<string, string> = {
  hat: "Hats", sock: "Socks", sticker: "Stickers", case: "Cases", mug: "Mugs",
  wall_art: "Wall Art", wallart: "Wall Art", "wall-art": "Wall Art",
  pillow: "Pillows", tote: "Totes", tapestry: "Tapestries",
  pin: "Pins", magnet: "Magnets",
};

/** Any product name/token (singular OR plural, Excel OR page) → one canonical
 *  key, so "Hats"/"hat", "Bags"/"bag", "Totes"/"tote" all compare equal. The
 *  Excel sheet sends plurals; the page's tile classes are singular tokens. */
const PRODUCT_CANONICAL: Record<string, string> = {
  // apparel
  "t shirt": "t_shirt", "tee": "t_shirt",
  "hoodie": "hoodie",
  "tank": "tank", "tank top": "tank",
  "crewneck": "crewneck",
  "long sleeve t shirt": "long_sleeve", "long sleeve": "long_sleeve",
  "baseball tee": "baseball_tee",
  "kids": "kids",
  "kids hoodie": "kids_hoodie",
  "kids long sleeve t shirt": "kids_long_sleeve", "kids long sleeve": "kids_long_sleeve",
  "shorts": "shorts", "short": "shorts",
  "bags": "bags", "bag": "bags",
  // tiles
  "hats": "hats", "hat": "hats",
  "socks": "socks", "sock": "socks",
  "stickers": "stickers", "sticker": "stickers",
  "cases": "cases", "case": "cases", "phone case": "cases", "phone cases": "cases",
  "mugs": "mugs", "mug": "mugs",
  "wall art": "wall_art", "wallart": "wall_art",
  "pillows": "pillows", "pillow": "pillows",
  "totes": "totes", "tote": "totes", "tote bag": "totes", "tote bags": "totes",
  "tapestries": "tapestries", "tapestry": "tapestries",
  "pins": "pins", "pin": "pins",
  "magnets": "magnets", "magnet": "magnets",
};

/** Resolve a product name to its canonical key, tolerating singular/plural. */
function canonicalProductKey(name: string): string {
  const n = normalizeProductName(name);
  if (PRODUCT_CANONICAL[n]) return PRODUCT_CANONICAL[n];
  // naive plural/singular fallbacks
  const singular = n.replace(/s$/, "");
  if (PRODUCT_CANONICAL[singular]) return PRODUCT_CANONICAL[singular];
  if (PRODUCT_CANONICAL[n + "s"]) return PRODUCT_CANONICAL[n + "s"];
  // last resort: apparel slug map, then the normalized name itself
  return canonicalApparelSlug(name) ?? n;
}

/** Resolve a product name (from Excel OR the page) to its canonical apparel
 *  slug, using PRODUCT_LABELS as the source of truth. Returns null for product
 *  names that aren't in the apparel map (Stickers, Mugs, Pillows, etc.) — the
 *  caller falls back to an exact normalized match for those. */
function canonicalApparelSlug(name: string): string | null {
  const target = normalizeProductName(name);
  if (!target) return null;
  for (const [slug, labels] of Object.entries(PRODUCT_LABELS)) {
    for (const label of labels) {
      if (normalizeProductName(label) === target) return slug;
    }
    if (normalizeProductName(slug.replace(/_/g, " ")) === target) return slug;
  }
  return null;
}

/** Strict name match that respects product identity. Avoids the substring
 *  trap where Excel "T-Shirt" would otherwise match page "Kids Long Sleeve
 *  T-Shirt". Resolves both names to canonical apparel slugs and compares those.
 *  Falls back to exact normalized equality for non-apparel products. */
function productNameMatch(excelName: string, pageName: string): boolean {
  // Both sides go through the same canonical resolver, so apparel and tile
  // names match across singular/plural and Excel-vs-page spellings.
  return canonicalProductKey(excelName) === canonicalProductKey(pageName);
}

// The 12 products the dashboard actually controls. Only these are enabled/
// disabled to match the dashboard; the other TeePublic products (Socks,
// Stickers, Cases, Mugs, Wall Art, Pillows, Totes, Pins, Magnets) are left at
// TeePublic's own default so we don't silently switch off products the user
// never saw on the dashboard.
const MANAGED_PRODUCT_KEYS = new Set([
  "t_shirt", "hoodie", "tank", "crewneck", "long_sleeve", "baseball_tee",
  "kids", "kids_hoodie", "kids_long_sleeve", "hats", "shorts", "bags",
]);

function isManagedProduct(name: string): boolean {
  return MANAGED_PRODUCT_KEYS.has(canonicalProductKey(name));
}

/** Return the element that flips the Enable state when clicked. TeePublic's
 *  toggle is a <span> inside .on-off.canvas-enable — its class swaps between
 *  "enabled" and "disabled" and the hidden canvas-option input mirrors it.
 *  The span IS the click target; the hidden <input> isn't clickable. */
function findRowEnableToggle(row: HTMLElement): HTMLElement | null {
  // Primary: TeePublic's actual click target.
  const span = row.querySelector<HTMLElement>(
    '.on-off.canvas-enable span, .canvas-enable span, .on-off span'
  );
  if (span) return span;

  // Fallback: a native checkbox in the row + its wrapping label (non-TP
  // layouts).
  const cb = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (cb) {
    const wrap = cb.closest("label") as HTMLElement | null;
    if (wrap) return wrap;
    if (cb.id) {
      const forLabel = row.querySelector<HTMLLabelElement>(`label[for="${cb.id}"]`);
      if (forLabel) return forLabel;
    }
    return cb;
  }

  // Fallback: role="switch" / any element flagged as a switch.
  const sw = row.querySelector<HTMLElement>('[role="switch"]');
  return sw ?? null;
}

/** Dump the row's HTML so we can see exactly how TeePublic markup looks when
 *  the toggle doesn't flip. Only fires on diagnostic paths. */
function dumpRowForToggleDebug(row: HTMLElement, productName: string): void {
  const html = row.outerHTML;
  log(`──── DEBUG: row HTML for "${productName}" (${html.length} chars) ────`);
  log(html.length > 2000 ? html.slice(0, 2000) + "…(truncated)" : html);
}

/** Toggle off any product row whose name is NOT in `enabledProducts`, and
 *  toggle on any row that IS in the list but currently shows off. Mirrors
 *  the Excel "products" sheet's on/off column.
 *
 *  Pass an empty `enabledProducts` array to no-op (safer than blanket-off
 *  when no products sheet was provided). */
export async function applyEnabledProducts(enabledProducts: string[]): Promise<void> {
  if (!enabledProducts || enabledProducts.length === 0) {
    log(`enabled-products: empty list — leaving page toggles as-is`);
    return;
  }
  const toggles = getAllProductToggles();
  log(`getAllProductToggles: ${toggles.length} products found`);
  log(`enabled-products: ${enabledProducts.length} enabled from dashboard: [${enabledProducts.join(", ")}]`);

  for (const t of toggles) {
    const label = t.name || "(unnamed)";
    // Only manage the products the DASHBOARD controls. The dashboard knows 12
    // products; TeePublic has 22. Products the dashboard can't represent
    // (Socks, Stickers, Cases, Mugs, Wall Art, Pillows, Totes, Pins, Magnets)
    // are left at TeePublic's default instead of being force-disabled.
    if (!isManagedProduct(t.name)) {
      log(`  ${label}: not managed by dashboard — leaving at TeePublic default`);
      continue;
    }
    const wanted = enabledProducts.some((p) => productNameMatch(p, t.name));
    const currently = t.canvasOptionInput.value === "true";

    if (wanted === currently) {
      log(`  ${label}: ${currently ? "ON" : "OFF"} — matches dashboard, no change`);
      continue;
    }
    const ok = await flipProductToggle(t, wanted);
    if (ok) {
      log(`    ✓ ${label}: now ${wanted ? "ON" : "OFF"}${!wanted ? " → OFF ✓" : ""}`);
    } else {
      log(`    ✗ ${label}: state did NOT flip (type=${t.type})`);
    }
  }
}

interface ProductToggle {
  name: string;
  canvasOptionInput: HTMLInputElement;
  enableSpan: HTMLElement | null;
  type: "apparel" | "tile";
  container: HTMLElement;
}

/** Enumerate ALL products on the edit page (22), not just the apparel rows
 *  that carry a color dropdown. Source of truth is the 22
 *  input[name="canvas-option[N]"] enable inputs; each is classified as an
 *  apparel row (inside <tr data-name>) or a canvas tile (inside div.canvas.<type>). */
function getAllProductToggles(): ProductToggle[] {
  const out: ProductToggle[] = [];
  const inputs = document.querySelectorAll<HTMLInputElement>('input[name^="canvas-option"]');

  for (const input of inputs) {
    const enableSpanIn = (el: HTMLElement) =>
      el.querySelector<HTMLElement>('.on-off.canvas-enable span, .canvas-enable span, .on-off span');

    // Type A — apparel row: <tr data-name="T-Shirt">
    const tr = input.closest<HTMLElement>("tr[data-name]");
    if (tr) {
      out.push({
        name: tr.getAttribute("data-name") ?? "",
        canvasOptionInput: input,
        enableSpan: enableSpanIn(tr),
        type: "apparel",
        container: tr,
      });
      continue;
    }

    // Type B — canvas tile: <div class="canvas hat"> (name from 2nd class token)
    const canvas = input.closest<HTMLElement>("div.canvas");
    if (canvas) {
      const token = Array.from(canvas.classList).find((c) => c !== "canvas");
      const name = token ? (TILE_CLASS_TO_NAME[token] ?? token) : "";
      out.push({
        name,
        canvasOptionInput: input,
        enableSpan: enableSpanIn(canvas),
        type: "tile",
        container: canvas,
      });
      continue;
    }

    // Fallback — unknown structure: keep the toggle so it can still be driven.
    const container = input.closest<HTMLElement>(".canvas-enable, .on-off")?.parentElement
      ?? input.parentElement ?? input;
    out.push({
      name: "",
      canvasOptionInput: input,
      enableSpan: enableSpanIn(container),
      type: "tile",
      container,
    });
  }
  return out;
}

/** Flip a product's enable state. Tries clicking the toggle; if the hidden
 *  canvas-option value doesn't flip, sets it directly (the proven fallback).
 *  Works for both apparel rows and canvas tiles. */
async function flipProductToggle(t: ProductToggle, wanted: boolean): Promise<boolean> {
  const matches = () => (t.canvasOptionInput.value === "true") === wanted;

  const clickTargets: (HTMLElement | null)[] = [
    t.enableSpan,
    t.container.querySelector<HTMLElement>(".on-off.canvas-enable, .canvas-enable"),
    t.container.querySelector<HTMLElement>(".on-off"),
  ];
  for (const el of clickTargets) {
    if (!el) continue;
    await fullClick(el);
    await sleep(220);
    if (matches()) return true;
  }

  // Direct fallback — drive the hidden input + mirror the span class.
  setHiddenInputValue(t.canvasOptionInput, wanted ? "true" : "false");
  if (t.enableSpan) {
    t.enableSpan.classList.toggle("enabled", wanted);
    t.enableSpan.classList.toggle("disabled", !wanted);
  }
  await sleep(150);
  return matches();
}

/** Names of primary_colors inputs that are empty while their product is still
 *  enabled — these are exactly what makes TeePublic reject Publish with
 *  "You must choose a primary color for X". Returns the blocking input names. */
export function findBlockingEmptyColors(): string[] {
  const blocking: string[] = [];
  for (const colorInput of document.querySelectorAll<HTMLInputElement>('input[name^="primary_colors"]')) {
    const m = colorInput.name.match(/\[(\d+)\]/);
    if (!m) continue;
    const enable = document.querySelector<HTMLInputElement>(`input[name="canvas-option[${m[1]}]"]`);
    const enabled = enable ? enable.value === "true" : true;
    if (enabled && !colorInput.value.trim()) {
      blocking.push(colorInput.name);
      log(`BLOCKING: ${colorInput.name} enabled but has empty color`);
    }
  }
  return blocking;
}

/** Escalate through every plausible click target, then fall back to directly
 *  setting the canvas-option hidden input + span class if no click flips state.
 *  Returns true once isRowEnabled matches `wanted`. */
async function flipEnableToggle(
  rowContainer: HTMLElement,
  name: string,
  wanted: boolean,
): Promise<boolean> {
  const span    = rowContainer.querySelector<HTMLElement>('.on-off.canvas-enable > span, .canvas-enable > span, .on-off > span');
  const enable  = rowContainer.querySelector<HTMLElement>('.on-off.canvas-enable, .canvas-enable');
  const onOff   = rowContainer.querySelector<HTMLElement>('.on-off');
  const swapper = rowContainer.querySelector<HTMLElement>('.apparel_swapper');
  const hidden  = rowContainer.querySelector<HTMLInputElement>('.canvas-enable input[type="hidden"], input[name^="canvas-option"]');
  const currently = isRowEnabled(rowContainer);

  log(`  ${name}: ${currently ? "ON" : "OFF"} → ${wanted ? "ON" : "OFF"} (hidden input present: ${!!hidden}, span present: ${!!span})`);

  // Escalating click targets. TeePublic's actual click listener might be
  // bound to any of these (delegation can sit on the wrapper or the row),
  // so we try in order — outer-most last to avoid double-flipping.
  const targets: { el: HTMLElement | null; what: string }[] = [
    { el: span,    what: ".canvas-enable > span" },
    { el: enable,  what: ".canvas-enable" },
    { el: onOff,   what: ".on-off" },
    { el: swapper, what: ".apparel_swapper" },
  ];

  for (const t of targets) {
    if (!t.el) continue;
    log(`    clicking ${t.what}`);
    await fullClick(t.el);
    await sleep(250);
    if (isRowEnabled(rowContainer) === wanted) return true;
  }

  // Last resort: TeePublic's handler didn't respond to any synthetic click.
  // Drive the underlying state directly — set the hidden input's value and
  // dispatch change, then mirror the span class so the visual stays in sync.
  // The Publish form post will pick up the updated hidden-input value.
  if (hidden) {
    log(`    direct fallback: setting canvas-option value=${wanted ? "true" : "false"}`);
    setHiddenInputValue(hidden, wanted ? "true" : "false");
    if (span) {
      span.classList.toggle("enabled",  wanted);
      span.classList.toggle("disabled", !wanted);
    }
    await sleep(200);
    return isRowEnabled(rowContainer) === wanted;
  }
  return false;
}

/** Set an <input>.value via the native setter (so React/jQuery proxies don't
 *  swallow it) and dispatch input + change events. */
function setHiddenInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input",  { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// ─── Configure Other Products — per-card edit + Default Color ─────────────

/** Configure Other Products card. Has a thumbnail, a name label, and a
 *  canvas-enable toggle. Clicking the thumbnail switches the apparel table
 *  at top to show *that* card's Default Color dropdown. */
interface OtherProductTile { el: HTMLElement; name: string; }

function findConfigureOtherProductsSection(): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestSize = Infinity;
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    const text = (el.textContent ?? "").toLowerCase();
    if (!text.includes("configure other products")) continue;
    if (text.length > 5000) continue;
    if (text.length < bestSize) { best = el; bestSize = text.length; }
  }
  return best;
}

function findOtherProductTiles(section: HTMLElement): OtherProductTile[] {
  // Known product names that appear in the Configure Other Products grid.
  // Apparel is skipped because it's the same as the default apparel table.
  const knownNames = [
    "Apparel", "Socks", "Bags", "Shorts", "Hats", "Stickers", "Cases",
    "Phone Cases", "Mugs", "Wall Art", "Pillows", "Totes", "Tapestries",
    "Pins", "Magnets",
  ];
  const tiles: OtherProductTile[] = [];
  for (const name of knownNames) {
    const tile = findTileForProduct(section, name);
    if (tile) tiles.push({ el: tile, name });
  }
  return tiles;
}

function findTileForProduct(section: HTMLElement, name: string): HTMLElement | null {
  for (const el of section.querySelectorAll<HTMLElement>("*")) {
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => (n.textContent ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (directText.toLowerCase() !== name.toLowerCase()) continue;
    // Walk up to a container that has both an <img> and a toggle.
    let cur: HTMLElement | null = el;
    for (let d = 0; cur && d < 6; d++, cur = cur.parentElement) {
      if (cur.querySelector("img") && cur.querySelector(".canvas-enable, .on-off")) {
        return cur;
      }
    }
  }
  return null;
}

/** The tile body is clickable to switch the editing context; the toggle
 *  pill is a separate target. Return an element inside the tile that's not
 *  the toggle — preferably the thumbnail. */
function findTileClickTarget(tile: HTMLElement): HTMLElement {
  const img = tile.querySelector<HTMLElement>("img");
  if (img) return img;
  return tile;
}

/** For each enabled card in Configure Other Products (Bags, Shorts, etc.),
 *  click the card, wait for the apparel table to swap to that product's row,
 *  and set its Default Color. Without this TeePublic rejects publish with
 *  "You must choose a primary color for shorts/bags/...". */
export async function configureOtherProducts(
  productColors?: Record<string, string>,
): Promise<{ configured: string[]; unconfigured: string[] }> {
  const configured: string[] = [];
  const unconfigured: string[] = [];

  const section = findConfigureOtherProductsSection();
  if (!section) {
    log("configure-other-products: section not found — skipping");
    return { configured, unconfigured };
  }

  const tiles = findOtherProductTiles(section);
  log(`configure-other-products: ${tiles.length} tile(s) found: [${tiles.map((t) => t.name).join(", ")}]`);

  for (const tile of tiles) {
    if (tile.name.toLowerCase() === "apparel") continue; // already in default apparel table

    const enabled = isRowEnabled(tile.el);
    if (!enabled) {
      log(`  ${tile.name}: tile OFF — skipping color config`);
      continue;
    }

    log(`  ${tile.name}: clicking thumbnail to switch editing context`);
    const target = findTileClickTarget(tile.el);
    await fullClick(target);
    await sleep(900); // give the apparel table time to swap

    // After click, the apparel table shows this product's rows.
    const rows = findDdSelectRows();
    if (rows.length === 0) {
      log(`    ${tile.name}: no dd-select appeared — product doesn't need a primary color`);
      continue;
    }

    const needsColor = rows.filter((r) => {
      const t = readDdSelectedText(r.wrapper);
      return !t || isPlaceholder(t);
    });

    if (needsColor.length === 0) {
      log(`    ${tile.name}: rows already configured`);
      configured.push(tile.name);
      continue;
    }

    let anyOk = false;
    for (const { name, wrapper } of needsColor) {
      const preferred = pickPreferredColor(name, productColors);
      log(`    ${name}: slug=${preferred.slug || "(unmapped)"}, wanted="${preferred.value}" (source=${preferred.source})`);
      let result = await setRowColor(wrapper, preferred.value);
      if (!result.ok) {
        await sleep(250);
        result = await setRowColor(wrapper, preferred.value);
      }
      if (result.ok) {
        log(`    ${name} → ${result.chosen} ✓`);
        anyOk = true;
      } else {
        log(`    ${name}: FAILED (${result.reason})`);
        unconfigured.push(name);
      }
      await sleep(150);
    }
    if (anyOk) configured.push(tile.name);
  }

  return { configured, unconfigured };
}

/** Configure every enabled row in the product table.
 *  @param productColors Per-design colors from Excel (item.metadata.productColors).
 *                       Keys are Excel slugs ("t_shirt", "hoodie", "long_sleeve", …).
 *  Returns the list of enabled rows that are STILL unconfigured after the run. */
export async function configureProductTable(
  productColors?: Record<string, string>,
): Promise<{ ok: boolean; unconfigured: string[]; configured: string[] }> {
  await expandAndRevealProductTable();

  const rows = findDdSelectRows();
  log(`product table: found ${rows.length} dd-select color rows`);
  if (productColors && Object.keys(productColors).length > 0) {
    log(`  using per-item productColors: ${JSON.stringify(productColors)}`);
  } else {
    log(`  no per-item productColors — falling back to hardcoded TABLE_COLOR_MAP`);
  }
  const configured: string[] = [];
  const unconfigured: string[] = [];

  for (const { name, wrapper, rowContainer } of rows) {
    if (!isRowEnabled(rowContainer)) {
      log(`  ${name}: Enable toggle is OFF, skipping`);
      continue;
    }
    const currentText = readDdSelectedText(wrapper);
    if (currentText && !isPlaceholder(currentText)) {
      log(`  ${name}: already "${currentText}", skipping`);
      configured.push(name);
      continue;
    }

    const preferred = pickPreferredColor(name, productColors);
    log(`  ${name}: slug=${preferred.slug || "(unmapped)"}, wanted="${preferred.value}" (source=${preferred.source})`);
    const result = await setRowColor(wrapper, preferred.value);

    if (result.ok) {
      log(`  ${name} → ${result.chosen} ✓`);
      configured.push(name);
    } else {
      log(`  ${name}: FAILED (${result.reason}) — retrying once`);
      await sleep(250);
      const retry = await setRowColor(wrapper, preferred.value);
      if (retry.ok) {
        log(`  ${name} → ${retry.chosen} ✓ (on retry)`);
        configured.push(name);
      } else {
        log(`  ${name}: FAILED (${retry.reason})`);
        unconfigured.push(name);
      }
    }
    await sleep(150);
  }

  // Re-scan: any enabled row whose value is still placeholder?
  const stillEmpty: string[] = [];
  for (const { name, wrapper, rowContainer } of rows) {
    if (!isRowEnabled(rowContainer)) continue;
    const text = readDdSelectedText(wrapper);
    if (!text || isPlaceholder(text)) stillEmpty.push(name);
  }
  return { ok: stillEmpty.length === 0, unconfigured: stillEmpty, configured };
}

// ─── Non-apparel color dropdowns (outside the <tr> table) ──────────────────
// Some products (notably Hats) have a color dropdown that lives in
// #primary_color_<canvasType> OUTSIDE any <tr>, so findDdSelectRows misses it.
// Its <ul.dd-options> is empty until the matching div.canvas.<type> tile is
// activated ("Currently Editing"). Left unconfigured it stays on "Select
// Default Color" and blocks Publish with "must choose a primary color for X".

interface NonApparelDropdown {
  name: string;          // display name, e.g. "Hats"
  canvasType: string;    // id suffix / tile class token, e.g. "hat"
  wrapper: HTMLElement;  // div.dd-select
  container: HTMLElement; // div#primary_color_<type>
}

/** Color dropdowns that are NOT inside an apparel <tr> — matched by the
 *  #primary_color_<type> container id. */
function findNonApparelColorDropdowns(): NonApparelDropdown[] {
  const out: NonApparelDropdown[] = [];
  for (const wrapper of document.querySelectorAll<HTMLElement>("div.dd-select")) {
    if (wrapper.closest("tr")) continue; // apparel rows handled by findDdSelectRows
    const container = wrapper.closest<HTMLElement>('[id^="primary_color_"]');
    if (!container) continue;
    const canvasType = container.id.replace(/^primary_color_/, "");
    const name = TILE_CLASS_TO_NAME[canvasType] ?? canvasType;
    out.push({ name, canvasType, wrapper, container });
  }
  return out;
}

/** Poll (DOM-keyed, not URL-keyed) for the non-apparel dropdowns to mount.
 *  Returns as soon as at least one appears, or the full list at timeout. */
async function pollForNonApparelDropdowns(timeoutMs: number): Promise<NonApparelDropdown[]> {
  const deadline = Date.now() + timeoutMs;
  let found = findNonApparelColorDropdowns();
  while (found.length === 0 && Date.now() < deadline) {
    await sleep(150);
    found = findNonApparelColorDropdowns();
  }
  return found;
}

/** Find a canvas tile (div.canvas.<type>) by class token without CSS-escaping. */
function findCanvasTile(canvasType: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>("div.canvas")) {
    if (el.classList.contains(canvasType)) return el;
  }
  return null;
}

/** Is the product behind this canvas tile currently enabled? */
function isCanvasTypeEnabled(canvasType: string): boolean {
  const tile = findCanvasTile(canvasType);
  const hidden = tile?.querySelector<HTMLInputElement>('input[name^="canvas-option"]');
  return hidden ? hidden.value === "true" : false;
}

/** Poll for a dd-options list inside `container` to populate (> 1 <li>). */
async function pollForOptions(container: HTMLElement, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ul = container.querySelector<HTMLElement>("ul.dd-options");
    if (ul && ul.querySelectorAll("li").length > 1) return true;
    await sleep(100);
  }
  return false;
}

/** Configure the ENABLED non-apparel color dropdowns (Hats, …): activate the
 *  tile so options populate, then reuse setRowColor. Disabled products are
 *  skipped — they need no color and won't block Publish.
 *
 *  URL-agnostic: this keys off the DOM (div.canvas.<type> tiles +
 *  div[id^="primary_color_"] containers), so it runs the same on
 *  /design/quick_create and on a redirected /designs/<id>/edit page. The
 *  tiles can mount late, so we reveal the product section and poll for them
 *  before giving up. */
export async function configureNonApparelColors(
  productColors?: Record<string, string>,
): Promise<{ ok: boolean; configured: string[]; unconfigured: string[] }> {
  // Make sure the product section is mounted/visible (it lazy-renders), then
  // wait for the non-apparel dropdowns to appear regardless of the URL.
  await expandAndRevealProductTable();
  const dropdowns = await pollForNonApparelDropdowns(5000);

  log(`non-apparel color dropdowns found: ${dropdowns.length} (url: ${location.pathname}, ` +
      `canvas tiles: ${document.querySelectorAll("div.canvas").length}, ` +
      `primary_color containers: ${document.querySelectorAll('[id^="primary_color_"]').length})`);
  const configured: string[] = [];
  const unconfigured: string[] = [];

  for (const dd of dropdowns) {
    if (!isCanvasTypeEnabled(dd.canvasType)) {
      log(`  ${dd.name}: disabled — skipping color`);
      continue;
    }

    const current = readDdSelectedText(dd.wrapper);
    if (current && !isPlaceholder(current)) {
      log(`  ${dd.name}: already "${current}", skipping`);
      configured.push(dd.name);
      continue;
    }

    // 1. Activate the tile so its color options mount.
    const tile = findCanvasTile(dd.canvasType);
    if (tile) {
      log(`  ${dd.name}: activating tile`);
      await fullClick(tile);
    } else {
      log(`  ${dd.name}: ⚠ no canvas tile found for "${dd.canvasType}"`);
    }

    // 2. Wait (up to 3s) for the options to populate.
    if (!(await pollForOptions(dd.container, 3000))) {
      log(`  ${dd.name}: ⚠ options never populated`);
      unconfigured.push(dd.name);
      continue;
    }
    const optCount = dd.container.querySelectorAll("ul.dd-options li").length;
    log(`  ${dd.name}: options populated (${optCount} colors)`);

    // 3. Pick the user's dashboard color (exact, else fuzzy fallback).
    const preferred = pickPreferredColor(dd.name, productColors);
    log(`  ${dd.name}: slug=${preferred.slug || "(unmapped)"}, wanted="${preferred.value}" (source=${preferred.source})`);
    let result = await setRowColor(dd.wrapper, preferred.value);
    if (!result.ok) {
      await sleep(250);
      result = await setRowColor(dd.wrapper, preferred.value);
    }
    if (result.ok) {
      log(`  ${dd.name} → ${result.chosen} ✓`);
      configured.push(dd.name);
    } else {
      log(`  ${dd.name}: FAILED (${result.reason})`);
      unconfigured.push(dd.name);
    }
    await sleep(150);
  }
  return { ok: unconfigured.length === 0, configured, unconfigured };
}

/** Determine the dominant tone preference from the spreadsheet's per-product
 *  colors. Returns "white", "black", or "all" (mixed/unknown). */
function dominantTone(productColors: Record<string, string>): "white" | "black" | "all" {
  const values = Object.values(productColors).filter(Boolean);
  if (values.length === 0) return "all";
  const wantCategory = (v: string) => categorize(v);
  let whiteCount = 0, blackCount = 0;
  for (const v of values) {
    const cat = wantCategory(v);
    if (cat === "white") whiteCount++;
    else if (cat === "black") blackCount++;
  }
  if (whiteCount > blackCount * 2) return "white";
  if (blackCount > whiteCount * 2) return "black";
  return "all";
}

/** Click the Light / Dark / All preset button in the "Product Colors" palette
 *  section. This activates background colors for non-Apparel products
 *  (Stickers, Cases, Mugs, Pillows, Totes, Tapestries, Pins, Magnets, Socks)
 *  in one click — TeePublic then accepts those products without complaining
 *  "you must choose a color for X". */
export async function applyProductColorPalette(tone: "white" | "black" | "all"): Promise<void> {
  const targetTexts = tone === "all"   ? ["all",   "all colors"]
                    : tone === "white" ? ["light", "light colors"]
                                       : ["dark",  "dark colors"];

  // Globally scan ALL clickable elements; the All/Light/Dark/None pills can
  // be <button>, <a>, <div role="button">, or just styled <div onclick> on
  // different TeePublic builds. Then validate each candidate by walking up
  // looking for an ancestor whose textContent mentions "product colors".
  const candidates = Array.from(document.body.querySelectorAll<HTMLElement>(
    'button, [role="button"], a, [class*="btn" i], div, span'
  ));

  const matches: HTMLElement[] = [];
  for (const el of candidates) {
    const t = (el.textContent ?? "").trim().toLowerCase();
    if (!targetTexts.includes(t)) continue;
    // Skip wrappers — only leaf-ish elements (<= 1 element children) so we
    // don't catch a section that *contains* an "All" button.
    if (el.children.length > 1) continue;
    // Validate: ancestor (within 10 levels) mentions "product colors".
    let cur: HTMLElement | null = el;
    let isPaletteButton = false;
    for (let d = 0; cur && d < 10; d++, cur = cur.parentElement) {
      const ancText = (cur.textContent ?? "").toLowerCase();
      if (ancText.includes("product colors")) { isPaletteButton = true; break; }
    }
    if (!isPaletteButton) continue;
    // Skip invisible elements.
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    matches.push(el);
  }

  if (matches.length === 0) {
    log(`product-colors palette: "${targetTexts.join("/")}" preset button not found — skipping`);
    return;
  }

  // If multiple match (rare), prefer the deepest/innermost element.
  matches.sort((a, b) => depth(b) - depth(a));
  const chosen = matches[0];

  // Snapshot palette state before clicking so we can verify the click landed.
  const beforeCount = countActiveSwatches();
  log(`product-colors palette: clicking "${chosen.textContent?.trim()}" preset (tone=${tone}, ${matches.length} candidate(s), ${beforeCount} swatches active before)`);
  chosen.scrollIntoView({ block: "center" });
  await sleep(300);
  await fullClick(chosen);
  await sleep(600);

  const afterCount = countActiveSwatches();
  log(`product-colors palette: ${afterCount} swatches active after click`);

  // If the click didn't change anything AND there are still few active
  // swatches, escalate by clicking the parent (the button might delegate
  // events upward).
  if (afterCount === beforeCount && afterCount < 5 && chosen.parentElement) {
    log(`product-colors palette: click had no effect — retrying on parent`);
    await fullClick(chosen.parentElement);
    await sleep(500);
    log(`product-colors palette: ${countActiveSwatches()} swatches active after parent click`);
  }
}

/** Count "active" color swatches on the page — used to verify a palette
 *  preset click actually changed state. A swatch is active when its element
 *  carries a class like "active" / "selected" / "checked" or contains a
 *  checkmark child. Loose by design so we tolerate markup variants. */
function countActiveSwatches(): number {
  let count = 0;
  for (const el of document.querySelectorAll<HTMLElement>('[class*="swatch" i], [class*="palette" i] [class*="color" i]')) {
    const cls = typeof el.className === "string" ? el.className : "";
    if (/\b(active|selected|checked|enabled|on)\b/i.test(cls)) count++;
  }
  return count;
}

function depth(el: HTMLElement): number {
  let d = 0;
  let cur: HTMLElement | null = el;
  while (cur) { d++; cur = cur.parentElement; }
  return d;
}

export async function pickAllProductColors(productColors: Record<string, string>): Promise<void> {
  // T-Shirt always first so its color propagates to compatible apparel.
  // Everything else follows the visual top-to-bottom order from the Item table.
  const entries = Object.entries(productColors).filter(([slug, color]) => color && slug !== "product");
  entries.sort(([a], [b]) => {
    if (a === PRIMARY_PROPAGATOR) return -1;
    if (b === PRIMARY_PROPAGATOR) return 1;
    // Preserve the canonical top-down product order.
    const order = Object.keys(PRODUCT_LABELS);
    return order.indexOf(a) - order.indexOf(b);
  });

  log(`──── color picker: ${entries.length} products to process (top-down, starting from T-Shirt) ────`);

  let step = 0;
  for (const [slug, color] of entries) {
    step++;
    const labels = PRODUCT_LABELS[slug];
    if (!labels) {
      log(`step ${step}: (skip) unknown slug "${slug}"`);
      continue;
    }
    const primaryLabel = labels[0];

    // Skip if TeePublic already propagated a color into this row.
    const existing = readConfiguredColor(primaryLabel);
    if (existing) {
      log(`step ${step}: ${primaryLabel} → already "${existing}" (propagated by TeePublic, skipping)`);
      continue;
    }

    // Open dropdown + pick color via fuzzy matcher.
    log(`step ${step}: ${primaryLabel} → opening Default Color dropdown for preferred="${color}"`);
    let succeeded = false;
    for (const label of labels) {
      try {
        await pickColorForProduct(label, color);
        succeeded = true;
        break;
      } catch (e) {
        log(`step ${step}: ✗ ${label}: ${(e as Error).message}`);
      }
    }
    if (!succeeded) {
      log(`step ${step}: (skip) ${slug}: could not configure any label variant`);
    } else if (slug === PRIMARY_PROPAGATOR) {
      // Critical: after T-Shirt, wait for TeePublic's auto-propagation to
      // fan out across compatible rows before we check the next product.
      log(`step ${step}: T-Shirt set → waiting for TeePublic propagation to settle…`);
      await waitForPropagationToSettle();
    }
    await closeAnyPopup();
  }

  // After per-product apparel/primary picks, activate the global Product
  // Colors palette so non-Apparel products (Cases, Mugs, Pillows, Pins,
  // Socks, Totes, Tapestries) get background colors. Without this TeePublic
  // refuses to publish: "You must choose a color for phone cases / pillows / …".
  //
  // Strategy: first apply the tone-matched preset (Light/Dark) to respect the
  // user's preference, then ALSO ensure "All" coverage as a safety net — even
  // some "Light" presets don't include every product's required color, so
  // adding "All" guarantees coverage without removing anything (palette
  // selections are additive).
  const tone = dominantTone(productColors);
  log(`step ${step + 1}: applying Product Colors palette (tone=${tone})`);
  await applyProductColorPalette(tone);

  // Safety net: also click "All" so every product is guaranteed at least
  // one compatible color. This satisfies TeePublic's pre-publish validation
  // even if the tone preset misses some product types.
  log(`step ${step + 1}b: adding "All" palette coverage as safety net`);
  await applyProductColorPalette("all");

  reportFinalState(entries);
}

// Returns the currently-selected color text for a product row, or null if
// the row still shows the placeholder. Robust to TeePublic's dd-* markup
// where the visible color sits inside .dd-selected-text wrapped by various
// container divs.
export function readConfiguredColor(productLabel: string): string | null {
  const row = findProductRow(productLabel);
  if (!row) return null;

  // Path A: native <select>
  const select = row.querySelector<HTMLSelectElement>("select");
  if (select) {
    if (select.selectedIndex <= 0) return null;
    const text = select.options[select.selectedIndex]?.text?.trim() ?? "";
    if (!text || isPlaceholderText(text)) return null;
    return text;
  }

  // Path B: custom dropdown's "selected-text" element. Many dropdown libraries
  // (TeePublic's dd-select included) put the currently-selected value in a
  // dedicated element with a known class — read that directly.
  const selectedTextEl = row.querySelector<HTMLElement>(
    '[class*="dd-selected-text" i], [class*="selected-text" i], [class*="select__single-value" i], [class*="selected-label" i], [class*="selected-value" i]'
  );
  if (selectedTextEl) {
    const t = firstNonEmptyLine(selectedTextEl.textContent ?? "");
    if (t && !isPlaceholderText(t) && hasLetters(t)) return t;
  }

  // Path C: fall back to the trigger's textContent, taking the first non-empty
  // line and stripping leading/trailing junk. Accepts color-shaped names
  // including digits, slashes, ampersands.
  const trigger = findDropdownTrigger(row);
  if (!trigger) return null;
  const text = firstNonEmptyLine(trigger.textContent ?? "");
  if (!text || isPlaceholderText(text)) return null;
  if (text.length > 50) return null;
  if (!hasLetters(text)) return null;
  return text;
}

function firstNonEmptyLine(s: string): string {
  return s.split(/[\n\r]+/).map((x) => x.trim()).filter(Boolean)[0] ?? "";
}

function hasLetters(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

// Watches every known product row and returns when the number of rows
// showing a real color (vs. placeholder) hasn't changed for ~2 seconds.
// Caps at `maxMs` so a stuck UI doesn't block forever.
async function waitForPropagationToSettle(maxMs = 12_000, stableMs = 2_000): Promise<void> {
  const labels = Array.from(new Set(Object.values(PRODUCT_LABELS).map((arr) => arr[0])));
  const start = Date.now();
  let lastCount = -1;
  let stableSince = 0;
  log(`waiting for TeePublic propagation to settle (max ${maxMs}ms)…`);

  while (Date.now() - start < maxMs) {
    const count = labels.filter((l) => readConfiguredColor(l) !== null).length;
    if (count !== lastCount) {
      log(`  propagation: ${count} / ${labels.length} products configured`);
      lastCount = count;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= stableMs) {
      log(`  propagation settled at ${count} / ${labels.length} after ${Math.round((Date.now() - start) / 100) / 10}s`);
      return;
    }
    await sleep(500);
  }
  log(`  propagation wait timed out at ${lastCount} / ${labels.length}`);
}

function isPlaceholderText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "select default color" ||
    t === "select color" ||
    t === "default color" ||
    t === "primary color" ||
    t === "select" ||
    t === ""
  );
}

/** @internal Snapshot of current design's color/product config. Kept private
 *  now that the reference-designs feature is removed (no external callers). */
function captureCurrentConfig(): { productColors: Record<string, string>; enabledProducts: string[] } {
  const productColors: Record<string, string> = {};
  for (const [slug, labels] of Object.entries(PRODUCT_LABELS)) {
    const color = readConfiguredColor(labels[0]);
    if (color) productColors[slug] = color;
  }

  // Enabled-product detection: any row/card whose product label is followed
  // by a switch element that's in the "on" state.
  const enabledProducts: string[] = [];
  const allProductNames = [
    "T-Shirt", "Hoodie", "Tank", "Crewneck", "Long Sleeve T-Shirt", "Long Sleeve",
    "Baseball Tee", "Kids", "Kids Hoodie", "Kids Long Sleeve T-Shirt",
    "Hats", "Hat", "Shorts", "Bags", "Bag",
    "Stickers", "Sticker", "Cases", "Case", "Phone Case",
    "Mugs", "Mug", "Wall Art", "Pillows", "Pillow", "Totes", "Tote",
    "Tapestries", "Tapestry", "Pins", "Pin", "Magnets", "Magnet", "Socks", "Sock",
  ];
  for (const name of allProductNames) {
    if (isProductEnabled(name)) {
      // Dedupe by canonical name (first match wins).
      if (!enabledProducts.includes(name)) enabledProducts.push(name);
    }
  }
  return { productColors, enabledProducts };
}

function isProductEnabled(productName: string): boolean {
  // Find any container that mentions this product name.
  const wanted = productName.toLowerCase();
  for (const el of document.body.getElementsByTagName("*")) {
    if (!(el instanceof HTMLElement)) continue;
    const text = (el.textContent ?? "").toLowerCase().trim();
    if (text.length > 200 || !text.includes(wanted)) continue;
    // Skip nested matches — only check containers whose textContent is "small".
    if (text.length > 80) continue;
    // Look for an ON/OFF toggle inside.
    const toggle = el.querySelector('input[type="checkbox"], [role="switch"], [class*="toggle" i], [class*="switch" i]');
    if (!toggle) continue;
    if (toggle instanceof HTMLInputElement && toggle.type === "checkbox") return toggle.checked;
    const ariaChecked = toggle.getAttribute("aria-checked");
    if (ariaChecked === "true") return true;
    if (ariaChecked === "false") return false;
    const cls = typeof toggle.className === "string" ? toggle.className : "";
    if (/\bon\b|active|enabled|checked/i.test(cls)) return true;
    if (/\boff\b|inactive|disabled/i.test(cls)) return false;
    // Fallback: look at the toggle's text content.
    const tText = (toggle.textContent ?? "").trim().toLowerCase();
    if (tText === "on") return true;
    if (tText === "off") return false;
  }
  return false;
}

function reportFinalState(entries: [string, string][]): void {
  const propagated: string[] = [];
  const unconfigured: string[] = [];
  for (const [slug] of entries) {
    const labels = PRODUCT_LABELS[slug];
    if (!labels) continue;
    const existing = readConfiguredColor(labels[0]);
    if (existing) propagated.push(`${labels[0]}=${existing}`);
    else          unconfigured.push(labels[0]);
  }
  log(`──── color summary ────`);
  log(`  configured (${propagated.length}): ${propagated.join(", ") || "none"}`);
  if (unconfigured.length > 0) {
    log(`  STILL unconfigured (${unconfigured.length}): ${unconfigured.join(", ")}`);
  }
}

async function pickColorForProduct(productLabel: string, preferred: string): Promise<void> {
  // Always start clean — leftover popups from the previous pick break
  // the "new element" snapshot-diff popup detector.
  await closeAnyPopup();

  const row = findProductRow(productLabel);
  if (!row) throw new Error("row not found in DOM");

  // Native <select> path — read live options, match, set.
  // Search not just direct descendants but any <select> visually inside the row
  // (some uploaders hide a real <select> behind a styled div facade).
  const select = findRowNativeSelect(row);
  if (select && select.options.length > 0) {
    // Exclude the "Select Default Color" placeholder so the matcher can never
    // "pick" it (which would leave the product with no real color and trigger
    // TeePublic's "You must choose a primary color" error on publish).
    const available = Array.from(select.options)
      .map((o) => o.text.trim())
      .filter((t) => t.length > 0 && !isPlaceholderText(t));
    if (available.length > 0) {
      const match = findBestMatch(available, preferred);
      if (match) {
        logMatch(productLabel, "native-select", match);
        const targetIdx = Array.from(select.options).findIndex((o) => o.text.trim() === match.chosen);
        select.selectedIndex = targetIdx >= 0 ? targetIdx : match.index;
        select.dispatchEvent(new Event("input",  { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
  }

  // Custom dropdown path — try to open, fall back to brute-force if needed.
  row.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  await sleep(200);

  let popup: HTMLElement | null = null;
  const trigger = findDropdownTrigger(row);
  if (trigger) popup = await openDropdownWithRetries(trigger, row);

  // Brute force: try every plausible trigger in the row.
  if (!popup) popup = await bruteForceOpenDropdown(row);

  if (!popup) {
    await closeAnyPopup();
    // Dump a compact snapshot of the row's interactive children so we can see
    // which classes TeePublic actually uses on the trigger.
    dumpRowInteractives(row, productLabel);
    throw new Error(`popup did not open (no trigger in row responded to click/keyboard)`);
  }

  await sleep(350); // virtualized lists need a moment
  const allItems = collectColorOptions(popup);
  // Drop the "Select Default Color" placeholder so it can't be chosen as a
  // fallback (which leaves the product with no real color → publish error).
  const items = allItems.filter((i) => !isPlaceholderText(i.text));
  if (items.length === 0) {
    dumpPopupContents(popup, productLabel);
    await closeAnyPopup();
    throw new Error("popup opened but no color options found inside");
  }

  const available = items.map((i) => i.text);
  const match = findBestMatch(available, preferred);
  if (!match) {
    await closeAnyPopup();
    throw new Error("matcher returned no result (unreachable)");
  }

  // If the only fallback we have is "first option in the list" — meaning
  // the dropdown contains nothing matching the requested color OR its tone —
  // it's better to leave TeePublic's own default than force a wrong color
  // (e.g. picking Black when White was requested for a product that only
  // offers Black + Deep Royal). TeePublic will keep its propagated default.
  if (match.method === "safe-default-first") {
    await closeAnyPopup();
    log(`──── ${productLabel} (custom-dropdown) ────`);
    log(`  preferred:  "${match.preferred}"${match.category ? ` (category: ${match.category})` : ""}`);
    log(`  available (${match.available.length}): ${match.available.slice(0, 16).join(", ")}${match.available.length > 16 ? "…" : ""}`);
    log(`  ↪ leaving TeePublic's default — no acceptable match for "${match.preferred}"`);
    return;
  }

  logMatch(productLabel, "custom-dropdown", match);

  // Robust option commit: click + keyboard + verify the dropdown closed.
  await commitOptionClick(items[match.index].el, match.chosen);
  await sleep(400);

  // Strict verification: the row must show EXACTLY the color we tried to pick.
  // "Black" when we picked "White" is a failure, not a success.
  const verified = readConfiguredColor(productLabel);
  const matched = !!verified && colorsMatch(verified, match.chosen);

  if (!matched) {
    log(`  ⚠ ${productLabel}: picked "${match.chosen}" but row reads "${verified ?? "(placeholder)"}" — retrying`);
    await closeAnyPopup();
    await sleep(300);

    // Re-attempt up to 2 more times.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const rePopup = await bruteForceOpenDropdown(row);
      if (!rePopup) {
        log(`  ✗ retry ${attempt}: popup did not open`);
        break;
      }
      await sleep(350);
      const reItems = collectColorOptions(rePopup).filter((i) => !isPlaceholderText(i.text));
      const reMatch = findBestMatch(reItems.map((i) => i.text), preferred);
      if (!reMatch || reMatch.method === "safe-default-first") {
        await closeAnyPopup();
        log(`  ↪ retry ${attempt}: no acceptable match in popup — leaving TeePublic default`);
        break;
      }
      await commitOptionClick(reItems[reMatch.index].el, reMatch.chosen);
      await sleep(450);

      const reVerified = readConfiguredColor(productLabel);
      if (reVerified && colorsMatch(reVerified, reMatch.chosen)) {
        log(`  ✓ ${productLabel} → "${reVerified}" (committed on retry ${attempt})`);
        return;
      }
      log(`  ⚠ retry ${attempt}: still reads "${reVerified ?? "(placeholder)"}"`);
      await closeAnyPopup();
      await sleep(400);
    }
    log(`  ✗ ${productLabel}: gave up after retries — TeePublic default will stand`);
  }
}

// Lenient color comparison: trim, lowercase, and treat "Solid White" / "White"
// as the same so a verified "Solid White" doesn't trigger retry.
function colorsMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^solid\s+/, "");
  return norm(a) === norm(b);
}

// Click the option element with a full event cocktail. If the element wraps
// a more specific clickable child (e.g. <div class="option"><span>Black</span></div>),
// also click that child as a backup.
async function commitOptionClick(el: HTMLElement, chosenText: string): Promise<void> {
  el.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
  try { el.focus(); } catch { /* not focusable */ }
  await fullClick(el);

  // Look for a more specific descendant whose direct text is the chosen color
  // and click that too — covers the case where the visible row is a wrapper
  // and React's listener is on an inner element.
  for (const inner of el.querySelectorAll<HTMLElement>("*")) {
    const t = (inner.textContent ?? "").trim();
    if (t === chosenText && inner.children.length === 0) {
      await fullClick(inner);
      break;
    }
  }

  // Some libraries commit on Enter while the option is focused.
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent("keyup",   { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
}

// Diagnostic when popup opened but options weren't extractable.
function dumpPopupContents(popup: HTMLElement, productLabel: string): void {
  log(`──── debug: popup contents for "${productLabel}" ────`);
  const cls = trimClass(popup);
  log(`  popup root: <${popup.tagName.toLowerCase()} class="${cls}">`);
  // Show first ~15 elements with their direct text.
  let count = 0;
  for (const el of popup.querySelectorAll<HTMLElement>("*")) {
    if (count >= 15) break;
    const direct = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => (n.textContent ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (!direct) continue;
    count++;
    log(`  <${el.tagName.toLowerCase()} class="${trimClass(el)}"> "${direct.slice(0, 40)}"`);
  }
  if (count === 0) log(`  (popup contains no leaf text nodes — may be image-only or shadow DOM)`);
}

// ─── Debug logging — explicit and structured ─────────────────────────────────

function logMatch(productLabel: string, path: string, m: MatchResult): void {
  const safe = m.method === "safe-default-tone" || m.method === "safe-default-first";
  const arrow = safe ? "↪" : "✓";
  log(`──── ${productLabel} (${path}) ────`);
  log(`  preferred:  "${m.preferred}"${m.category ? ` (category: ${m.category})` : ""}`);
  log(`  available (${m.available.length}): ${m.available.slice(0, 16).join(", ")}${m.available.length > 16 ? "…" : ""}`);
  log(`  ${arrow} chosen:    "${m.chosen}"  via ${m.method}`);
}
