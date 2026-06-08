"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, getTheme, setTheme, applyTheme, type ThemeId } from "@/lib/theme";

export function ThemeSwitcher() {
  // Start at the SSR default so markup is deterministic; reconcile after mount.
  const [id, setId] = useState<ThemeId>("terminal");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = getTheme();
    setId(t);
    applyTheme(t);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const current = THEMES.find((t) => t.id === id) ?? THEMES[0];

  function pick(next: ThemeId) {
    setId(next);
    setTheme(next);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch UI theme"
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: current.swatch }} />
        <span className="hidden sm:inline">{current.label}</span>
        <span className="text-zinc-500">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-60 surface p-1 z-50"
        >
          {THEMES.map((t) => {
            const active = t.id === id;
            return (
              <button
                key={t.id}
                role="option"
                aria-selected={active}
                onClick={() => pick(t.id)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition ${
                  active ? "bg-ink-700 text-accent-500" : "text-zinc-200 hover:bg-ink-800"
                }`}
              >
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: t.swatch }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm">{t.label}</span>
                  <span className="block text-[10px] text-zinc-500 truncate">{t.hint}</span>
                </span>
                {active && <span className="text-accent-500">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
