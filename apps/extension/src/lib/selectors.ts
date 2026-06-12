// Centralized selectors for TeePublic's quick-create page.
// Each entry is an ordered list of candidates — the first that matches wins.
// If TeePublic ships a redesign, fix it HERE only.
//
// Field map vs. our DesignMetadata:
//   metadata.title         → Design Title input
//   metadata.primaryTag    → Main Tag input    (single tag — REQUIRED by TeePublic)
//   metadata.description   → Description textarea
//   metadata.tags          → Supporting Tags textarea (comma-separated)
//   metadata.matureContent → Yes/No radio buttons (NOT a checkbox)
//   (terms checkbox)       → must be checked before Publish

export const TP = {
  fileInput: [
    'input[type="file"][accept*="image"]',
    'input[type="file"]',
  ],

  titleInput: [
    'input[name="title"]',
    'input[name="design_title"]',
    'input[placeholder="Title"]',
    'input[placeholder*="title" i]',
    'input[id*="title" i]',
  ],

  mainTagInput: [
    'input[name="main_tag"]',
    'input[name="mainTag"]',
    'input[name="primary_tag"]',
    'input[placeholder="Main tag"]',
    'input[placeholder*="main tag" i]',
    'input[id*="main_tag" i]',
  ],

  descriptionInput: [
    'textarea[name="description"]',
    'textarea[placeholder*="describe" i]',
    'textarea[placeholder*="description" i]',
    'textarea[id*="description" i]',
  ],

  // Supporting Tags is a single textarea — fill the whole comma-joined string.
  supportingTagsInput: [
    'textarea[name="supporting_tags"]',
    'textarea[name="tags"]',
    'textarea[placeholder*="comma" i]',
    'textarea[placeholder*="tags" i]',
    'input[name="supporting_tags"]',
    'input[name="tags"]',
    'input[placeholder*="comma" i]',
  ],

  matureYes: [
    'input[type="radio"][name*="mature" i][value="true"]',
    'input[type="radio"][name*="mature" i][value="yes"]',
    'input[type="radio"][name*="mature" i][value="1"]',
    'input[type="radio"][name*="adult" i][value="true"]',
    'input[type="radio"][name*="adult" i][value="yes"]',
  ],
  matureNo: [
    'input[type="radio"][name*="mature" i][value="false"]',
    'input[type="radio"][name*="mature" i][value="no"]',
    'input[type="radio"][name*="mature" i][value="0"]',
    'input[type="radio"][name*="adult" i][value="false"]',
    'input[type="radio"][name*="adult" i][value="no"]',
  ],

  termsCheckbox: [
    'input[type="checkbox"][name*="terms" i]',
    'input[type="checkbox"][name*="agreement" i]',
    'input[type="checkbox"][name*="agree" i]',
    'input[type="checkbox"][id*="terms" i]',
    'input[type="checkbox"][id*="agree" i]',
  ],

  publishButton: [
    'button:contains("PUBLISH")',
    'button:contains("Publish")',
    'input[type="submit"][value*="publish" i]',
    'a:contains("PUBLISH")',
    'a:contains("Publish")',
    'button[type="submit"]',
  ],

  successIndicator: [
    '[data-testid="upload-success"]',
    '.upload-success',
    'a[href*="/t-shirt/"]',
    '.flash-success',
    '[class*="success" i][class*="message" i]',
  ],
  errorIndicator: [
    '[role="alert"]',
    '.flash-error',
    '.error-message',
    '.alert-danger',
    '[class*="error" i][class*="message" i]',
  ],

  // ── Color picker selectors ─────────────────────────────────────────────
  // Used to scope option extraction to the open popup ONLY, so we never
  // accidentally pick up "Print on Front" / "Print on Back" radio labels.
  popupContainer: [
    '[role="listbox"]',
    '[role="menu"]',
    '[class*="dropdown__menu" i]',
    '[class*="select__menu" i]',
    '[class*="dropdown-menu" i]',
    '[class*="popper" i]',
    '[class*="popover" i]',
    // TeePublic-specific (dd- prefix observed in DOM dump)
    '[class*="dd-menu" i]',
    '[class*="dd-list" i]',
    '[class*="dd-select" i]',
    '[class*="dd-options" i]',
    '[class*="dd-dropdown" i]',
  ],
  optionItem: [
    '[role="option"]',
    'li[role="option"]',
    'li[data-value]',
    '[class*="dropdown__option" i]',
    '[class*="select__option" i]',
    '[class*="menu__item" i]',
    // TeePublic-specific
    '[class*="dd-option" i]:not([class*="dd-option-image" i]):not([class*="dd-option-text" i]):not([class*="dd-option-description" i])',
    'a.dd-option',
  ],
} as const;

// ── Bulk uploader (/designs/bulk_uploader) ────────────────────────────────
// Drop all designs → GET STARTED → per-design editor (same listing/colors/
// products form as the single flow) → NEXT DESIGN … → PUBLISH on the last.
export const BULK = {
  multiFileInput: [
    'input[type="file"][multiple]',
    'input[type="file"][accept*="image" i]',
    'input[type="file"]',
  ],
  getStarted: [
    'button:contains("GET STARTED")',
    'button:contains("Get Started")',
    'button:contains("Get started")',
    'a:contains("GET STARTED")',
    'a:contains("Get Started")',
  ],
  nextDesign: [
    'button:contains("NEXT DESIGN")',
    'button:contains("Next Design")',
    'button:contains("Next design")',
    'a:contains("NEXT DESIGN")',
    'a:contains("Next Design")',
  ],
} as const;
