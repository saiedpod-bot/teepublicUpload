// Human-like timing primitives. Borrowed from automa/src/utils/helper.js (sleep)
// and extended with jittered range + per-keystroke delay.

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function jitter(min: number, max: number): number {
  return Math.floor(min + Math.random() * Math.max(0, max - min));
}

export function humanDelay(min = 600, max = 1400): Promise<void> {
  return sleep(jitter(min, max));
}

// Per-keystroke delay range used by inputText.
export const KEYSTROKE_MIN = 25;
export const KEYSTROKE_MAX = 90;
