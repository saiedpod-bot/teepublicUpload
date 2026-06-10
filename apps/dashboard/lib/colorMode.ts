// Light/dark color mode. Stored in localStorage and applied by toggling the
// `dark` class (Tailwind darkMode: "class") + the document color-scheme, so
// native controls (selects, scrollbars) match. Default is dark.

export type ColorMode = "light" | "dark";

const KEY = "teepublic.colormode";
export const DEFAULT_MODE: ColorMode = "dark";

export function getColorMode(): ColorMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const v = window.localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : DEFAULT_MODE;
}

export function applyColorMode(mode: ColorMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
}

export function setColorMode(mode: ColorMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, mode);
  applyColorMode(mode);
}
