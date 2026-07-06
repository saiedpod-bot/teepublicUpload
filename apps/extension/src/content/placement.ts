// Visual Placement & Scaling Controller
// Automatically centers and scales each enabled product's design,
// then verifies the design fits within TeePublic's safe zones.
// Logs unrecoverable failures to chrome.storage.local (failed_visuals.json).

// Map TeePublic product labels → JS tool class suffix & DOM identifiers
interface ProductMap {
  jsSuffix: string;        // e.g. "ApparelFront" → class="jsUploaderApparelFrontHAlign"
  canvasId?: number;       // canvas-option[N] ID
  canvasName?: string;     // data-canvas value
  safeZoneClass?: string;  // mockup-boundaries class
  isApparel?: boolean;
}

const PRODUCT_MAP: Record<string, ProductMap> = {
  "T-Shirt":              { jsSuffix: "Apparel",      canvasId: 1,  canvasName: "tshirt",             safeZoneClass: "t-shirt", isApparel: true },
  "Tank":                 { jsSuffix: "Apparel",      canvasId: 2,  canvasName: "tank",              safeZoneClass: "tank", isApparel: true },
  "Kids T-Shirt":         { jsSuffix: "Apparel",      canvasId: 3,  canvasName: "kids",              safeZoneClass: "kids", isApparel: true },
  "Hoodie":               { jsSuffix: "Apparel",      canvasId: 4,  canvasName: "hoodie",            safeZoneClass: "hoodie", isApparel: true },
  "Crewneck":             { jsSuffix: "Apparel",      canvasId: 5,  canvasName: "crewneck",          safeZoneClass: "crewneck", isApparel: true },
  "Wall Art":             { jsSuffix: "Print",        canvasId: 6,  canvasName: "print",             safeZoneClass: "print" },
  "Long Sleeve T-Shirt":  { jsSuffix: "Apparel",      canvasId: 7,  canvasName: "longsleevetshirt",  safeZoneClass: "long sleeve t-shirt", isApparel: true },
  "Baseball Tee":         { jsSuffix: "Apparel",      canvasId: 8,  canvasName: "baseballtee",       safeZoneClass: "baseball tee", isApparel: true },
  "Phone Case":           { jsSuffix: "Case",         canvasId: 9,  canvasName: "case",              safeZoneClass: "case" },
  "Coffee Mug":           { jsSuffix: "CoffeeMug",    canvasId: 12, canvasName: "mug",               safeZoneClass: "positionable mug" },
  "Kids Hoodie":          { jsSuffix: "Apparel",      canvasId: 14, canvasName: "kidshoodie",        safeZoneClass: "kids hoodie", isApparel: true },
  "Kids Long Sleeve":     { jsSuffix: "Apparel",      canvasId: 15, canvasName: "kidslongsleevetshirt", safeZoneClass: "kids long sleeve t-shirt", isApparel: true },
  "Sticker":              { jsSuffix: "Print",        canvasId: 16, canvasName: "sticker",           safeZoneClass: "sticker" },
  "Pillow":               { jsSuffix: "Pillow",       canvasId: 17, canvasName: "pillow",            safeZoneClass: "pillow" },
  "Tote":                 { jsSuffix: "Tote",         canvasId: 18, canvasName: "tote",              safeZoneClass: "tote" },
  "Tapestry":             { jsSuffix: "Tapestry",     canvasId: 19, canvasName: "tapestry",          safeZoneClass: "tapestry" },
  "Pin":                  { jsSuffix: "Pin",          canvasId: 20, canvasName: "pin",               safeZoneClass: "pin" },
  "Magnet":               { jsSuffix: "Print",        canvasId: 21, canvasName: "magnet",            safeZoneClass: "magnet" },
  "Hat":                  { jsSuffix: "Hat",          canvasId: 55, canvasName: "hat",               safeZoneClass: "hat" },
  "Shorts":               { jsSuffix: "Shorts",       canvasId: 56, canvasName: "shorts",            safeZoneClass: "shorts" },
  "Bag":                  { jsSuffix: "Bag",          canvasId: 58, canvasName: "bag",               safeZoneClass: "bag" },
  "Socks":                { jsSuffix: "Socks",        canvasId: 59, canvasName: "socks",             safeZoneClass: "socks" },
};

function log(msg: string) {
  console.info("[placement]", msg);
}

/** Compute the recommended scale % based on the design's aspect ratio.
 *  Square and full-width designs need more margin to avoid bleed. */
function recommendedScale(aspectRatio: number): number {
  // aspectRatio = width / height
  if (Math.abs(aspectRatio - 1) < 0.05) return 85;  // near-square → 85%
  if (aspectRatio > 1.3) return 80;                    // very wide → 80%
  if (aspectRatio < 0.7) return 85;                    // very tall → 85%
  return 90;                                             // default → 90%
}

/** Activate a product canvas by clicking its container, so TeePublic switches
 *  to that product's toolbar. */
function activateCanvas(canvasName: string): void {
  const sel = `div[data-canvas="${canvasName}"], div[data-canvas-name="${canvasName}"]`;
  const el = document.querySelector<HTMLElement>(sel);
  if (el) { el.click(); log(`activated canvas: ${canvasName}`); }
}

/** Get the scale slider element for a product. */
function scalerEl(suffix: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`.jsUploader${suffix}Scaler`);
}

/** Get the scale label element for a product. */
function scalerLabelEl(suffix: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.jsUploader${suffix}ScalerLabel`);
}

/** Center horizontally button. */
function hAlignBtn(suffix: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.jsUploader${suffix}HAlign`);
}

/** Center vertically button. */
function vAlignBtn(suffix: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.jsUploader${suffix}VAlign`);
}

/** Check if a product is enabled via its canvas-option hidden input. */
function isProductEnabledFn(canvasId: number): boolean {
  const input = document.querySelector<HTMLInputElement>(`input[name="canvas-option[${canvasId}]"]`);
  return input?.value === "true";
}

/** Disable a product so TeePublic won't reject Publish with "must choose a
 *  primary color". Sets the hidden canvas-option input, toggles the visual
 *  switch class, and clicks whatever native control is present. */
function disableProduct(canvasId: number): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="canvas-option[${canvasId}]"]`);
  if (!input) return;
  input.value = "false";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  // Toggle span class for visual consistency
  const container = input.closest(".canvas-enable, .on-off, td, div");
  if (container) {
    const span = container.querySelector<HTMLElement>("span");
    if (span) { span.className = "disabled"; span.textContent = "Disabled"; }
  }
  // Click the toggle to trigger TeePublic's React state
  const toggle = input.closest('[class*="canvas-enable"], [class*="on-off"]');
  if (toggle && toggle instanceof HTMLElement) toggle.click();
  log(`disabled product canvas-option[${canvasId}]`);
}

/** Set the scale slider to a specific percentage, returning the actual value set. */
function setScale(suffix: string, targetPct: number): number {
  const slider = scalerEl(suffix);
  if (!slider) { log(`no scaler for ${suffix}`); return -1; }
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 200;
  const clamped = Math.round(Math.max(min, Math.min(targetPct, max)));
  slider.value = String(clamped);
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
  log(`scale ${suffix}: set to ${clamped}%`);
  return clamped;
}

/** Read current scale percentage from the label. */
function readScale(suffix: string): number | null {
  const label = scalerLabelEl(suffix);
  if (!label) return null;
  const m = label.textContent?.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/** Verify the design fits within the safe zone by checking if the rendered
 *  preview image is fully contained in the mockup-boundaries rect.
 *  Returns true if the design appears uncropped. */
function verifyPlacement(suffix: string, canvasName: string): boolean {
  const container = document.querySelector<HTMLElement>(
    `.canvas-container.x.${canvasName}, div[data-canvas="${canvasName}"]`
  );
  if (!container) { log(`verify: no container for ${canvasName}`); return true; }
  const preview = container.querySelector<HTMLImageElement>("img.mutable-preview");
  const boundaries = container.querySelector<HTMLElement>(".mockup-boundaries");
  if (!preview || !boundaries) { log(`verify: missing preview/boundaries for ${canvasName}`); return true; }
  const pr = preview.getBoundingClientRect();
  const br = boundaries.getBoundingClientRect();
  // Check if preview extends beyond boundaries (indicating cropping)
  const overflows = pr.left < br.left || pr.top < br.top || pr.right > br.right || pr.bottom > br.bottom;
  if (overflows) log(`verify: ${canvasName} OVERFLOW (preview exceeds safe zone)`);
  else log(`verify: ${canvasName} OK`);
  return !overflows;
}

export interface PlacementResult {
  ok: boolean;
  wallArtDisabled: boolean;
  error?: string;
}

/** Append a line to the failed_visuals log stored in chrome.storage.local.
 *  Each entry: { timestamp, label, aspectRatio, attempts }. */
async function logVisualFailure(label: string, aspectRatio: number, attempts: number): Promise<void> {
  try {
    const key = "failed_visuals";
    const data = await chrome.storage.local.get(key);
    const entries: unknown[] = data[key] ?? [];
    entries.push({ timestamp: Date.now(), label, aspectRatio, attempts });
    await chrome.storage.local.set({ [key]: entries.slice(-500) }); // cap at 500
  } catch { /* non-fatal */ }
}

/** Run the placement controller for all currently enabled products.
 *  aspectRatio: width/height of the uploaded design image. */
export async function runPlacement(aspectRatio: number): Promise<PlacementResult> {
  log(`── placement controller (aspect ratio: ${aspectRatio.toFixed(3)}) ──`);
  const baseScale = recommendedScale(aspectRatio);
  log(`base scale: ${baseScale}%`);

  const failures: string[] = [];
  let wallArtDisabled = false;

  const productOrder = [
    "T-Shirt", "Tank", "Kids T-Shirt", "Hoodie", "Crewneck",
    "Long Sleeve T-Shirt", "Baseball Tee", "Kids Hoodie", "Kids Long Sleeve",
    "Sticker", "Phone Case", "Coffee Mug", "Travel Mug",
    "Pillow", "Tote", "Tapestry", "Pin", "Magnet", "Hat", "Shorts", "Bag", "Socks",
    "Wall Art",
  ];

  for (const label of productOrder) {
    const pm = PRODUCT_MAP[label];
    if (!pm) continue;
    if (pm.canvasId != null && !isProductEnabledFn(pm.canvasId)) {
      log(`skip ${label} (disabled)`);
      continue;
    }
    const cs = pm.canvasName;
    if (!cs) continue;

    let placed = false;
    let attempt = 0;
    let currentScale = baseScale;

    while (!placed && attempt < 3) {
      attempt++;
      if (attempt > 1) {
        currentScale = Math.max(currentScale - 5, 30); // reduce 5% per retry, floor 30%
        log(`retry ${label} attempt ${attempt}: scale ${currentScale}%`);
      }

      activateCanvas(cs);
      await sleep(200);

      const actualScale = setScale(pm.jsSuffix, currentScale);
      if (actualScale < 0) { failures.push(`${label}:no-scaler`); break; }
      await sleep(150);

      const hBtn = hAlignBtn(pm.jsSuffix);
      if (hBtn) { hBtn.click(); log(`center H: ${label}`); }
      await sleep(100);

      const vBtn = vAlignBtn(pm.jsSuffix);
      if (vBtn) { vBtn.click(); log(`center V: ${label}`); }
      await sleep(150);

      placed = verifyPlacement(pm.jsSuffix, cs);
    }

    if (placed) continue;

    // Could not align after 3 attempts
    if (label === "Wall Art" && pm.canvasId != null) {
      disableProduct(pm.canvasId);
      wallArtDisabled = true;
      log(`Wall Art disabled (could not align after ${attempt} attempts)`);
    } else {
      failures.push(`${label}:overflow-after-${attempt}attempts`);
      void logVisualFailure(label, aspectRatio, attempt);
    }
  }

  const ok = failures.length === 0;
  if (!ok) log(`placement failures: ${failures.join(", ")}`);
  log(`placement done — ok=${ok}, wallArtDisabled=${wallArtDisabled}`);
  return { ok, wallArtDisabled, error: failures.length > 0 ? failures.join("; ") : undefined };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
