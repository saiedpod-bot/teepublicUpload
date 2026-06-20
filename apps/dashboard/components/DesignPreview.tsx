"use client";

// Shared design preview used by BOTH the AI-generation flow and the spreadsheet
// flow so the two look identical: the artwork on a square tile tinted with the
// dominant selected color, and a "Selected colors" swatch strip beneath it.

import { colorHexForLabel } from "./ColorsEditor";

/** The artwork tile, tinted with the dominant selected product color so you can
 *  see how the design will look on the color it'll be listed on. */
export function DesignPreview({
  src,
  alt,
  productColors,
}: {
  src?: string;
  alt: string;
  productColors: Record<string, string>;
}) {
  const bg = dominantColorHex(productColors);
  return (
    <div
      className="aspect-square w-full bg-zinc-50 dark:bg-ink-700 rounded-xl overflow-hidden grid place-items-center border border-zinc-200 dark:border-white/5"
      style={bg ? { background: bg } : undefined}
      title={bg ? "Preview on the selected color" : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="object-contain max-h-full max-w-full p-3" />
      ) : (
        <span className="text-zinc-500 text-xs">no image</span>
      )}
    </div>
  );
}

/** Distinct colors chosen across products — so the user can eyeball how they
 *  match the artwork without opening the Colors tab. */
export function DesignColorSwatches({ productColors }: { productColors: Record<string, string> }) {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const v of Object.values(productColors)) {
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(v);
  }
  if (colors.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Selected colors</div>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((label) => (
          <span
            key={label}
            title={label}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-300 dark:border-white/10 bg-zinc-50 dark:bg-ink-800 pl-1 pr-2 py-0.5"
          >
            <ColorDot label={label} />
            <span className="text-[11px] text-zinc-700 dark:text-zinc-200">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The most-used selected color, as a hex — used to tint the preview tile. */
function dominantColorHex(productColors: Record<string, string>): string | null {
  const counts = new Map<string, number>();
  for (const v of Object.values(productColors)) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = "", n = -1;
  for (const [label, c] of counts) if (c > n) { best = label; n = c; }
  return colorHexForLabel(best);
}

/** A small color dot; combo labels like "White/Black" render as a split dot. */
function ColorDot({ label }: { label: string }) {
  const parts = label.split("/").map((s) => s.trim()).filter(Boolean);
  const base = "h-3.5 w-3.5 rounded-full border border-black/10 shrink-0";
  if (parts.length >= 2) {
    return (
      <span
        className={base}
        style={{ background: `linear-gradient(135deg, ${colorHexForLabel(parts[0])} 0 50%, ${colorHexForLabel(parts[1])} 50% 100%)` }}
      />
    );
  }
  return <span className={base} style={{ background: colorHexForLabel(label) }} />;
}
