// Persists the user's custom basic-color swatches to localStorage. Per-design
// colors/products configs are kept ephemeral on purpose — every design owns
// its own settings inside the GenerationApp state.

const KEY = "teepublic.customBasicColors";

export interface CustomBasicColor {
  name: string;
  hex: string;
}

export function loadCustomBasicColors(): CustomBasicColor[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.name === "string" && typeof c.hex === "string")
      .map((c) => ({ name: c.name, hex: c.hex }));
  } catch {
    return [];
  }
}

export function saveCustomBasicColors(colors: CustomBasicColor[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(colors));
  } catch { /* quota / disabled — ignore */ }
}
