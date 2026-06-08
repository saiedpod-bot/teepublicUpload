// React-aware form fillers + label-text-based element finders.
// The React technique (native value setter + `_valueTracker` reset + dispatched
// input/change events) is borrowed from automa/src/utils/handleFormElement.js
// so React's controlled inputs notice the programmatic change.

import { sleep, jitter, KEYSTROKE_MIN, KEYSTROKE_MAX } from "./delays";

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;

const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  "value"
)!.set!;

function reactNotify(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const tracker = (element as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker;
  const setter = element.tagName === "TEXTAREA" ? nativeTextareaValueSetter : nativeInputValueSetter;
  const previous = element.value;
  setter.call(element, value);
  if (tracker) tracker.setValue(previous);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function typeInto(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  opts: { clear?: boolean; humanLike?: boolean } = {}
) {
  element.focus();
  if (opts.clear) reactNotify(element, "");
  if (opts.humanLike) {
    let acc = "";
    for (const ch of value) {
      acc += ch;
      reactNotify(element, acc);
      await sleep(jitter(KEYSTROKE_MIN, KEYSTROKE_MAX));
    }
  } else {
    reactNotify(element, value);
  }
  // Note: we deliberately do NOT blur — some chip/tag inputs commit on Enter
  // while focused, and the next step usually wants focus to stay.
}

export function waitForSelector<T extends Element = HTMLElement>(selector: string, timeoutMs = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const found = document.querySelector<T>(selector);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`timed out waiting for "${selector}"`));
    }, timeoutMs);
  });
}

export async function setFileInput(input: HTMLInputElement, file: File): Promise<void> {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("input",  { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  // Many dropzones also (or only) listen for real drag/drop events. Walk up
  // from the input to find a dropzone-shaped ancestor and dispatch the
  // sequence dragenter → dragover → drop on it.
  const dropzone = findDropzoneAncestor(input);
  if (dropzone) {
    const make = (type: string): DragEvent => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true });
      try { Object.defineProperty(ev, "dataTransfer", { value: dt }); } catch { /* readonly in some envs */ }
      return ev;
    };
    dropzone.dispatchEvent(make("dragenter"));
    dropzone.dispatchEvent(make("dragover"));
    dropzone.dispatchEvent(make("drop"));
  }
}

function findDropzoneAncestor(input: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = input.parentElement;
  for (let i = 0; cur && i < 8; i++, cur = cur.parentElement) {
    const cls = typeof cur.className === "string" ? cur.className : "";
    if (/dropzone|drop-zone|upload-area|file-drop|drop-target|upload__zone/i.test(cls)) return cur;
  }
  return null;
}

export async function firstMatching<T extends Element = HTMLElement>(candidates: string[], timeoutMs = 8_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of candidates) {
      const el = document.querySelector<T>(sel);
      if (el) return el;
    }
    await sleep(150);
  }
  throw new Error(`no candidate matched: ${candidates.join(" | ")}`);
}

// ─── label-text-based finders (fallbacks when CSS selectors miss) ───────────

// Find an <input>/<textarea> visually closest to a label, preferring fields
// BELOW the label (typical form layout). DOM-climbing fails on two-column
// layouts where Description (left) and Supporting Tags (right) share an
// ancestor — spatial proximity handles those correctly.
//
// `exclude` lets the caller skip already-filled fields so consecutive lookups
// can't collide on the same element.
export async function findFieldByLabel(
  labelText: string,
  opts: { kind?: "text" | "textarea" | "any"; timeoutMs?: number; exclude?: Set<Element> } = {}
): Promise<HTMLInputElement | HTMLTextAreaElement> {
  const { kind = "any", timeoutMs = 5_000, exclude = new Set<Element>() } = opts;
  const start = Date.now();
  const wanted = labelText.toLowerCase();

  while (Date.now() - start < timeoutMs) {
    // Prefer element-based label lookup (works with React's split text nodes);
    // fall back to text-node walker.
    const labelEl: HTMLElement | null = findLabelElement(wanted) ?? findTextNode(wanted)?.parentElement ?? null;
    if (labelEl) {
      const labelRect = labelEl.getBoundingClientRect();
      const sel = kind === "textarea"
        ? "textarea"
        : kind === "text"
          ? 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"])'
          : 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea';

      let best: HTMLInputElement | HTMLTextAreaElement | null = null;
      let bestScore = Infinity;
      for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(sel)) {
        if (exclude.has(field)) continue;
        const r = field.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // hidden / display:none
        // Reject fields well above the label (dy < -50). They belong to other rows.
        const dy = r.top - labelRect.bottom;
        if (dy < -50) continue;
        // Center distances; horizontal mismatch is penalized 2× to keep us in-column.
        const dx = (r.left + r.width / 2) - (labelRect.left + labelRect.width / 2);
        const score = Math.abs(dx) * 2 + Math.max(0, dy);
        if (score < bestScore) {
          bestScore = score;
          best = field;
        }
      }
      if (best) return best;
    }
    await sleep(200);
  }
  throw new Error(`no field found near label "${labelText}"`);
}

// Find a radio button by section label + option label (e.g. "Mature Content" + "No").
export async function findRadioByLabel(
  sectionLabel: string,
  optionLabel: string,
  timeoutMs = 5_000
): Promise<HTMLInputElement> {
  const start = Date.now();
  const sectionWanted = sectionLabel.toLowerCase();
  const optionWanted = optionLabel.toLowerCase();

  while (Date.now() - start < timeoutMs) {
    const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    for (const radio of radios) {
      const radioLabel = getRadioLabelText(radio).toLowerCase();
      if (radioLabel !== optionWanted) continue;
      // Climb to confirm we're in the right section.
      let parent: HTMLElement | null = radio.parentElement;
      for (let depth = 0; parent && depth < 8; depth++, parent = parent.parentElement) {
        if ((parent.textContent ?? "").toLowerCase().includes(sectionWanted)) return radio;
      }
    }
    await sleep(200);
  }
  throw new Error(`radio "${optionLabel}" near "${sectionLabel}" not found`);
}

function getRadioLabelText(radio: HTMLInputElement): string {
  // Wrapping <label>
  const wrap = radio.closest("label");
  if (wrap) return wrap.textContent?.trim() ?? "";
  // <label for=...>
  if (radio.id) {
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (label) return label.textContent?.trim() ?? "";
  }
  // Adjacent text node or sibling
  const sib = radio.nextSibling;
  if (sib?.nodeType === Node.TEXT_NODE) return sib.textContent?.trim() ?? "";
  if (radio.nextElementSibling) return radio.nextElementSibling.textContent?.trim() ?? "";
  return "";
}

function findTextNode(needle: string): Text | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const t = n.textContent?.trim().toLowerCase() ?? "";
      return t.includes(needle) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  return walker.nextNode() as Text | null;
}

// Find the SMALLEST element whose textContent contains the needle. Works even
// when React splits the label across multiple text nodes ("Supporting" + "Tags"
// in separate spans) — text-node walkers miss those, but the parent element's
// textContent still reads as the full string.
export function findLabelElement(needle: string): HTMLElement | null {
  const wanted = needle.toLowerCase();
  let best: HTMLElement | null = null;
  let bestSize = Infinity;
  for (const el of document.body.getElementsByTagName("*")) {
    if (!(el instanceof HTMLElement)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const text = (el.textContent ?? "").toLowerCase();
    if (!text.includes(wanted)) continue;
    if (text.length < bestSize) {
      best = el;
      bestSize = text.length;
    }
  }
  return best;
}

// Walk forward from a label-text node through DOM order, returning the first
// input/textarea that comes after it. Most resilient finder for two-column
// forms: "Supporting Tags" label + nearby textarea, regardless of nesting.
export async function findFieldAfterLabel(
  labelText: string,
  opts: { kind?: "input" | "textarea" | "any"; timeoutMs?: number; exclude?: Set<Element> } = {}
): Promise<HTMLInputElement | HTMLTextAreaElement | null> {
  const { kind = "any", timeoutMs = 5_000, exclude = new Set<Element>() } = opts;
  const start = Date.now();
  const wanted = labelText.toLowerCase();

  const wantTag = (el: Element): boolean => {
    if (kind === "textarea") return el.tagName === "TEXTAREA";
    if (kind === "input")    return el.tagName === "INPUT" && (el as HTMLInputElement).type !== "hidden";
    return el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "hidden");
  };

  while (Date.now() - start < timeoutMs) {
    const node = findTextNode(wanted);
    if (node?.parentElement) {
      const result = scanForwardForField(node.parentElement, wantTag, exclude);
      if (result) return result;
    }
    await sleep(200);
  }
  return null;
}

function scanForwardForField(
  start: Element,
  match: (el: Element) => boolean,
  exclude: Set<Element>
): HTMLInputElement | HTMLTextAreaElement | null {
  // Use a global walker positioned at the start element, then iterate forward.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  walker.currentNode = start;
  let cur: Node | null = walker.nextNode();
  while (cur) {
    if (cur instanceof HTMLElement && !exclude.has(cur) && match(cur)) {
      const r = cur.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return cur as HTMLInputElement | HTMLTextAreaElement;
      }
    }
    cur = walker.nextNode();
  }
  return null;
}
