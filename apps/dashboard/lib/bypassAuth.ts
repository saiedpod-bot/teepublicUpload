const BYPASS_KEY = "teepublic_bypass_code";

export function getBypassCode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(BYPASS_KEY) || "";
}

export function setBypassCode(code: string): void {
  localStorage.setItem(BYPASS_KEY, code);
}

export function clearBypassCode(): void {
  localStorage.removeItem(BYPASS_KEY);
}

export function isBypassValid(code: string): boolean {
  return code === "1992";
}

export function hasValidBypass(): boolean {
  return isBypassValid(getBypassCode());
}
