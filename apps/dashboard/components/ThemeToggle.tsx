"use client";

// Light/dark toggle. Starts at the SSR default ("dark") so the first client
// render matches the server (no hydration mismatch), then reconciles with the
// saved preference after mount.

import { useEffect, useState } from "react";
import { getColorMode, setColorMode, type ColorMode } from "@/lib/colorMode";

export function ThemeToggle() {
  const [mode, setMode] = useState<ColorMode>("dark");
  useEffect(() => { setMode(getColorMode()); }, []);

  function toggle() {
    const next: ColorMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    setColorMode(next);
  }

  const isDark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span aria-hidden className="text-base leading-none">{isDark ? "☀" : "☾"}</span>
    </button>
  );
}
