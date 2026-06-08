// UI theme registry. Each theme is a CSS-variable block in app/globals.css,
// selected by the `data-theme` attribute on <html>. The choice is stored in
// localStorage and applied before paint by an inline script in layout.tsx.
// All themes are dark-structured, so <html> always keeps the `dark` class.

export type ThemeId = "terminal" | "amber" | "cyber" | "indigo";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  hint: string;
  /** A representative accent swatch for the switcher dot. */
  swatch: string;
}

export const THEMES: ThemeDef[] = [
  { id: "terminal", label: "Terminal",    hint: "green phosphor · mono · scanlines", swatch: "#3dff86" },
  { id: "amber",    label: "Amber CRT",   hint: "amber phosphor · mono · warm",      swatch: "#ffb000" },
  { id: "cyber",    label: "Cyber Neon",  hint: "cyan/magenta · rounded · glow",     swatch: "#00c8ff" },
  { id: "indigo",   label: "Indigo SaaS", hint: "indigo/violet · glassy · soft",     swatch: "#5b65ff" },
];

const STORAGE_KEY = "teepublic.uitheme";
export const DEFAULT_THEME: ThemeId = "terminal";

export function getTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : DEFAULT_THEME;
}

export function setTheme(id: ThemeId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
  applyTheme(id);
}

export function applyTheme(id: ThemeId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", id);
  root.classList.add("dark"); // themes are dark-structured
  root.style.colorScheme = "dark";
}
