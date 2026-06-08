"use client";

import { useMemo } from "react";
import {
  PRODUCT_LABEL_TO_SLUG,
  applyPreset,
  paletteFor,
  productSlugs,
  type ColorPreset,
} from "@/lib/colorPresets";
import { SLUG_TO_PRODUCT_LABEL } from "@teepublic/shared";

export interface ColorProductConfigValue {
  preset: ColorPreset;
  /** slug → TeePublic color label */
  productColors: Record<string, string>;
  /** Product display labels (e.g. "T-Shirt") that should be uploaded. */
  enabledProducts: string[];
}

export function ColorProductConfig({
  value,
  onChange,
}: {
  value: ColorProductConfigValue;
  onChange: (next: ColorProductConfigValue) => void;
}) {
  const slugs = useMemo(productSlugs, []);

  function setPreset(preset: ColorPreset) {
    onChange({ ...value, preset, productColors: applyPreset(preset) });
  }

  function setColor(slug: string, color: string) {
    onChange({ ...value, productColors: { ...value.productColors, [slug]: color } });
  }

  function toggleProduct(label: string) {
    const has = value.enabledProducts.includes(label);
    onChange({
      ...value,
      enabledProducts: has
        ? value.enabledProducts.filter((p) => p !== label)
        : [...value.enabledProducts, label],
    });
  }

  function setAllProducts(enabled: boolean) {
    onChange({
      ...value,
      enabledProducts: enabled ? Object.values(SLUG_TO_PRODUCT_LABEL) : [],
    });
  }

  return (
    <div className="space-y-6">
      {/* Color preference presets */}
      <section className="surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Color preference</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pick a preset to fill every product, then override individual products below.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-ink-800">
            {(["light", "dark", "all"] as ColorPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition ${
                  value.preset === p
                    ? "bg-white shadow-sm text-zinc-900 dark:bg-ink-700 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {p === "all" ? "All colors" : `${p} colors`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {slugs.map((slug) => {
            const label = SLUG_TO_PRODUCT_LABEL[slug];
            const palette = paletteFor(label);
            const selected = value.productColors[slug] ?? palette[0]?.label ?? "";
            const enabled = value.enabledProducts.includes(label);
            return (
              <div
                key={slug}
                className={`surface-soft p-3 flex flex-col gap-2 transition ${
                  enabled ? "opacity-100" : "opacity-60"
                }`}
              >
                <label className="text-xs font-medium flex items-center justify-between">
                  <span>{label}</span>
                  {!enabled && <span className="text-zinc-400 dark:text-zinc-500">disabled</span>}
                </label>
                <select
                  className="input"
                  value={selected}
                  onChange={(e) => setColor(slug, e.target.value)}
                  disabled={!enabled || palette.length === 0}
                >
                  {palette.length === 0 ? (
                    <option>No catalog</option>
                  ) : (
                    palette.map((c) => (
                      <option key={c.label} value={c.label}>{c.label}</option>
                    ))
                  )}
                </select>
              </div>
            );
          })}
        </div>
      </section>

      {/* Product enable / disable */}
      <section className="surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Enabled products</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Toggle which TeePublic products to publish. Mirrors the spreadsheet&apos;s on/off column.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost text-xs px-2.5 py-1.5" onClick={() => setAllProducts(true)}>All on</button>
            <button type="button" className="btn-ghost text-xs px-2.5 py-1.5" onClick={() => setAllProducts(false)}>All off</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(SLUG_TO_PRODUCT_LABEL).map(([slug, label]) => {
            const on = value.enabledProducts.includes(label);
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggleProduct(label)}
                className={`surface-soft p-3 flex items-center justify-between text-left transition ${
                  on ? "ring-1 ring-accent-500/40" : ""
                }`}
              >
                <span className="text-sm font-medium">{label}</span>
                <span className="switch" data-on={on} aria-hidden />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Helper re-export for the parent app — keeps PRODUCT_LABEL_TO_SLUG accessible.
export { PRODUCT_LABEL_TO_SLUG };
