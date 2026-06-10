"use client";

// Shared per-design color editor. Used by both the AI-generation flow
// (GenerationApp) and the spreadsheet flow (DesignCard) so the two pages
// look and behave identically: Light/Dark/All preset toggle + Basic Colors
// swatch row + per-product dropdowns populated from the catalog.

import { useState } from "react";
import { SLUG_TO_PRODUCT_LABEL } from "@teepublic/shared";
import {
  BASIC_COLORS,
  applyBasicColor,
  applyPreset,
  paletteFor,
  productSlugs,
  type ColorPreset,
} from "@/lib/colorPresets";
import type { CustomBasicColor } from "@/lib/batchConfig";

interface Props {
  productColors: Record<string, string>;
  enabledProducts: string[];
  preset: ColorPreset;
  onChange: (next: { productColors: Record<string, string>; preset: ColorPreset }) => void;
  readOnly?: boolean;
  customBasicColors?: CustomBasicColor[];
  onAddCustomBasicColor?: (c: CustomBasicColor) => void;
  onRemoveCustomBasicColor?: (name: string) => void;
  /** Copies the colors shown here onto every other design in the batch.
   *  Receiver is responsible for confirming + overwriting. Button hidden
   *  when `applyToAllCount <= 1` (nothing to apply to). */
  onApplyToAll?: () => void;
  /** Total designs in the batch — used to label the button ("Apply to all
   *  18 designs") and to hide it when there's only one design. */
  applyToAllCount?: number;
}

export function ColorsEditor({
  productColors,
  enabledProducts,
  preset,
  onChange,
  readOnly = false,
  customBasicColors = [],
  onAddCustomBasicColor,
  onRemoveCustomBasicColor,
  onApplyToAll,
  applyToAllCount,
}: Props) {
  const slugs = productSlugs();

  function setPreset(next: ColorPreset) {
    onChange({ productColors: applyPreset(next), preset: next });
  }
  function setColor(slug: string, color: string) {
    onChange({ productColors: { ...productColors, [slug]: color }, preset });
  }
  function applyColor(name: string) {
    onChange({ productColors: applyBasicColor(name), preset });
  }

  function isBasicActive(name: string): boolean {
    const resolved = applyBasicColor(name);
    for (const [slug, label] of Object.entries(SLUG_TO_PRODUCT_LABEL)) {
      if (!enabledProducts.includes(label)) continue;
      if (productColors[slug] !== resolved[slug]) return false;
    }
    return true;
  }

  // Custom-basic-color adder UI state.
  const [showAdd, setShowAdd] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftHex, setDraftHex] = useState("#888888");
  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draftName.trim() || !onAddCustomBasicColor) return;
    onAddCustomBasicColor({ name: draftName, hex: draftHex });
    setDraftName("");
    setDraftHex("#888888");
    setShowAdd(false);
  }

  const canApplyToAll = !readOnly && !!onApplyToAll && (applyToAllCount ?? 0) > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Applies to <span className="font-medium text-zinc-700 dark:text-zinc-200">this design only</span>.
        </p>
        <div className="flex items-center gap-2">
          {canApplyToAll && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Copy these colors to all ${applyToAllCount} designs? This overwrites every other design's color settings.`)) {
                  onApplyToAll?.();
                }
              }}
              className="btn-ghost text-xs px-2.5 py-1.5"
              title="Copy this design's colors onto every other design in the batch"
            >
              Apply to all {applyToAllCount}
            </button>
          )}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-ink-800">
            {(["light", "dark", "all"] as ColorPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => !readOnly && setPreset(p)}
                disabled={readOnly}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition ${
                  preset === p
                    ? "bg-white shadow-sm text-zinc-900 dark:bg-ink-700 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-300"
                } ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {p === "all" ? "All colors" : `${p} colors`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Basic-colors row — built-ins + user-added swatches + Add button. */}
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 mr-1">Basic colors:</span>

        {BASIC_COLORS.map((c) => {
          const active = isBasicActive(c.name);
          return (
            <Swatch
              key={c.name}
              name={c.name}
              hex={c.hex}
              checkOn={c.checkOn}
              active={active}
              disabled={readOnly}
              onClick={() => !readOnly && applyColor(c.name)}
            />
          );
        })}

        {customBasicColors.map((c) => {
          const active = isBasicActive(c.name);
          const lum = hexLuminance(c.hex);
          return (
            <Swatch
              key={c.name}
              name={c.name}
              hex={c.hex}
              checkOn={lum > 0.55 ? "dark" : "light"}
              active={active}
              custom
              disabled={readOnly}
              onClick={() => !readOnly && applyColor(c.name)}
              onRemove={onRemoveCustomBasicColor ? () => onRemoveCustomBasicColor(c.name) : undefined}
            />
          );
        })}

        {/* Add custom basic color — only shown if a handler was passed in. */}
        {!readOnly && onAddCustomBasicColor && (
          !showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="h-8 w-8 mt-0.5 rounded-full border-2 border-dashed border-zinc-300 dark:border-white/15 text-zinc-400 dark:text-zinc-500 grid place-items-center text-base hover:border-accent-500 hover:text-accent-500 transition"
              aria-label="Add custom basic color"
              title="Add custom basic color"
            >+</button>
          ) : (
            <form onSubmit={submitAdd} className="flex items-center gap-1 surface-soft px-2 py-1.5">
              <input
                type="color"
                value={draftHex}
                onChange={(e) => setDraftHex(e.target.value)}
                className="h-7 w-7 rounded cursor-pointer bg-transparent border-0 p-0"
                aria-label="Pick hex"
              />
              <input
                autoFocus
                className="input text-xs py-1 w-28"
                placeholder="Color name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
              <button type="submit" className="btn-primary text-xs px-2 py-1">Add</button>
              <button type="button" onClick={() => { setShowAdd(false); setDraftName(""); }} className="btn-ghost text-xs px-2 py-1">×</button>
            </form>
          )
        )}
      </div>

      {/* Per-product colors — split into two columns so every product is
          visible at once (half the scrolling). Falls back to one column on
          narrow screens. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-t border-zinc-700/40">
        {slugs.map((slug) => {
          const label = SLUG_TO_PRODUCT_LABEL[slug];
          const palette = paletteFor(label);
          const enabled = enabledProducts.includes(label);
          const selected = productColors[slug] ?? palette[0]?.label ?? "";
          return (
            <div
              key={slug}
              className={`flex items-center justify-between gap-3 py-2 px-1 border-b border-zinc-700/30 transition ${enabled ? "" : "opacity-55"}`}
            >
              <span className="text-sm flex items-center gap-2 min-w-0">
                <span className="truncate">{label}</span>
                {!enabled && <span className="text-zinc-500 text-[10px] shrink-0">· disabled</span>}
              </span>
              <label className="surface-soft flex items-center gap-2 pl-2.5 pr-2 py-1.5 shrink-0 w-44 focus-within:border-accent-500/70 transition">
                <span
                  className="h-3.5 w-3.5 rounded-full border border-zinc-600 shrink-0"
                  style={{ background: colorHexForLabel(selected) }}
                />
                <select
                  // The native option popup follows the document color-scheme
                  // (set on <html> per theme), so it's readable in light + dark.
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                  value={selected}
                  onChange={(e) => setColor(slug, e.target.value)}
                  disabled={readOnly || !enabled || palette.length === 0}
                >
                  {palette.length === 0
                    ? <option>No catalog</option>
                    : palette.map((c) => (
                        <option key={c.label} value={c.label}>{c.label}</option>
                      ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Swatch({
  name, hex, checkOn, active, custom, disabled, onClick, onRemove,
}: {
  name: string;
  hex: string;
  checkOn: "light" | "dark";
  active: boolean;
  custom?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex flex-col items-center gap-1 relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={`Set all products to ${name}`}
        aria-label={`Set all products to ${name}`}
        aria-pressed={active}
        className={`relative h-8 w-8 rounded-full shadow-sm transition
          ring-2 ${active ? "ring-accent-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-900" : "ring-zinc-300 dark:ring-white/10"}
          ${disabled ? "opacity-60 cursor-not-allowed" : "group-hover:ring-accent-500/60"}`}
        style={{ backgroundColor: hex }}
      >
        {active && (
          <span className={`absolute inset-0 grid place-items-center text-xs font-bold ${checkOn === "light" ? "text-white" : "text-black"}`}>✓</span>
        )}
      </button>
      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 max-w-[64px] truncate">{name}</span>
      {custom && onRemove && !disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-zinc-900 text-white text-[10px] grid place-items-center opacity-0 group-hover:opacity-100 transition dark:bg-white dark:text-zinc-900"
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
        >×</button>
      )}
    </div>
  );
}

// Catalog labels don't carry a hex, so map common color words to a
// representative swatch for the dropdown dot. Combos ("White/Black") use the
// first token; unknown labels fall back to a neutral grey.
const COLOR_HEX: Record<string, string> = {
  "light grey": "#d1d5db", "light gray": "#d1d5db",
  "vintage heather": "#a8a29e", "royal blue": "#2563eb", "kelly green": "#16a34a",
  black: "#0a0a0a", white: "#ffffff", navy: "#1e293b", blue: "#2563eb",
  red: "#dc2626", maroon: "#7f1d1d", green: "#16a34a", forest: "#14532d",
  yellow: "#facc15", gold: "#d4af37", pink: "#ec4899", purple: "#9333ea",
  orange: "#ea580c", heather: "#9ca3af", grey: "#9ca3af", gray: "#9ca3af",
  charcoal: "#374151", asphalt: "#3f3f46", silver: "#cbd5e1", cream: "#f5f5dc",
  natural: "#e7e0cf", tan: "#d2b48c", khaki: "#c3b091", brown: "#78350f",
  teal: "#0d9488", sage: "#9caf88", olive: "#6b7d3a", indigo: "#4f46e5",
};

function colorHexForLabel(label: string): string {
  if (!label) return "#52525b";
  const l = label.toLowerCase().trim();
  const first = l.split("/")[0].trim();
  if (COLOR_HEX[l]) return COLOR_HEX[l];
  if (COLOR_HEX[first]) return COLOR_HEX[first];
  for (const key of Object.keys(COLOR_HEX)) {
    if (first.includes(key)) return COLOR_HEX[key];
  }
  return "#52525b";
}

function hexLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
