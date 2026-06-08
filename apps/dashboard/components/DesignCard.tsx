"use client";

import { useState } from "react";
import clsx from "clsx";
import type { DesignMetadata } from "@teepublic/shared";
import type { ParsedRow } from "@/lib/parser";
import type { MatchedImage } from "@/lib/queue";
import { ColorsEditor } from "./ColorsEditor";
import type { ColorPreset } from "@/lib/colorPresets";
import type { CustomBasicColor } from "@/lib/batchConfig";

type Tab = "info" | "colors" | "products";

interface Props {
  row: ParsedRow;
  image: MatchedImage | undefined;
  onChange: (rowNumber: number, next: DesignMetadata) => void;
  onRemove?: () => void;
  customBasicColors?: CustomBasicColor[];
  onAddCustomBasicColor?: (c: CustomBasicColor) => void;
  onRemoveCustomBasicColor?: (name: string) => void;
  /** Total rows in the batch — used to label and gate the Apply-to-all
   *  button. Apply-to-all is hidden when totalDesigns <= 1. */
  totalDesigns?: number;
  /** Copy this row's productColors onto every other row in the batch. */
  onApplyColorsToAll?: () => void;
  /** Copy this row's enabledProducts onto every other row in the batch. */
  onApplyProductsToAll?: () => void;
}

const ALL_PRODUCTS = [
  "T-Shirt", "Hoodie", "Tank", "Crewneck", "Long Sleeve", "Baseball Tee",
  "Kids", "Kids Hoodie", "Kids Long Sleeve T-Shirt",
  "Hats", "Shorts", "Bags",
  "Stickers", "Cases", "Mugs", "Wall Art", "Pillows", "Totes",
  "Tapestries", "Pins", "Magnets",
];

export function DesignCard({
  row, image, onChange, onRemove,
  customBasicColors, onAddCustomBasicColor, onRemoveCustomBasicColor,
  totalDesigns, onApplyColorsToAll, onApplyProductsToAll,
}: Props) {
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DesignMetadata>(row.metadata);
  // Preset tracking is UI-only (not part of DesignMetadata) — defaults to
  // "all" so no toggle button shows as active until the user clicks one.
  const [preset, setPreset] = useState<ColorPreset>("all");

  const m = editing ? draft : row.metadata;

  function save() {
    onChange(row.rowNumber, draft);
    setEditing(false);
  }
  function cancel() {
    setDraft(row.metadata);
    setEditing(false);
  }
  function startEdit() {
    setDraft(row.metadata);
    setEditing(true);
  }

  return (
    <div className="surface p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold tracking-tight">Design Configuration</h3>
          <span className="chip-mute font-mono">{row.metadata.filename}</span>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <>
              <button className="btn-ghost text-xs" onClick={startEdit}>✎ Edit</button>
              {onRemove && <button className="btn-ghost text-xs" onClick={onRemove} title="Remove">✕</button>}
            </>
          )}
          {editing && (
            <>
              <button className="btn-ghost text-xs" onClick={cancel}>Cancel</button>
              <button className="btn-primary text-xs" onClick={save}>Save</button>
            </>
          )}
        </div>
      </div>

      {/* Split pane — section rail on the left, detail panel on the right. */}
      <div className="grid grid-cols-1 md:grid-cols-[168px_1fr] border-t border-zinc-700/60 pt-4">
        <nav className="flex md:flex-col gap-1 md:gap-0.5 md:border-r md:border-zinc-700/60 md:pr-2 mb-4 md:mb-0">
          <RailItem active={tab === "info"}     label="info"     count={m.tags.length}                          onClick={() => setTab("info")} />
          <RailItem active={tab === "colors"}   label="colors"   count={Object.keys(m.productColors ?? {}).length} onClick={() => setTab("colors")} />
          <RailItem active={tab === "products"} label="products" count={(m.enabledProducts ?? []).length}        onClick={() => setTab("products")} />
        </nav>

        <div className="min-w-0 md:pl-5">
          {tab === "info" && (
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="flex-shrink-0 w-28">
                <div className="aspect-square rounded-sm overflow-hidden bg-ink-800 border border-zinc-700 grid place-items-center">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={m.title} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-zinc-500 text-xs">no image</span>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <InfoTab metadata={m} editing={editing} onChange={(p) => setDraft({ ...draft, ...p })} />
              </div>
            </div>
          )}
          {tab === "colors"   && (
            <ColorsEditor
              productColors={m.productColors ?? {}}
              enabledProducts={m.enabledProducts ?? []}
              preset={preset}
              onChange={({ productColors, preset: nextPreset }) => {
                setPreset(nextPreset);
                setDraft({ ...draft, productColors });
              }}
              readOnly={!editing}
              customBasicColors={customBasicColors}
              onAddCustomBasicColor={onAddCustomBasicColor}
              onRemoveCustomBasicColor={onRemoveCustomBasicColor}
              applyToAllCount={totalDesigns}
              // Apply-to-all writes to the parent row store directly, not to
              // the draft — saves a Save click and matches the AI flow's
              // immediate-write behavior. Only enabled in edit mode so it's
              // discoverable next to the rest of the editing controls.
              onApplyToAll={editing && onApplyColorsToAll ? () => {
                // Push the local draft into the source row first so the
                // copy includes any unsaved tweaks.
                onChange(row.rowNumber, draft);
                onApplyColorsToAll();
              } : undefined}
            />
          )}
          {tab === "products" && (
            <ProductsTab
              metadata={m}
              editing={editing}
              onChange={(enabledProducts) => setDraft({ ...draft, enabledProducts })}
              totalDesigns={totalDesigns}
              onApplyToAll={editing && onApplyProductsToAll ? () => {
                onChange(row.rowNumber, draft);
                onApplyProductsToAll();
              } : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Section-rail entry — vertical nav item with a left accent bar and a count.
function RailItem({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "group flex items-center justify-between gap-2 px-3 py-2.5 text-sm transition border-l-2 text-left",
        active
          ? "border-accent-500 text-accent-500 bg-ink-800/60"
          : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-ink-800/40"
      )}
    >
      <span>{label}</span>
      {count != null && (
        <span className={clsx("text-xs font-mono tabular-nums", active ? "text-accent-700" : "text-zinc-500")}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Info tab ────────────────────────────────────────────────────────────────
function InfoTab({ metadata, editing, onChange }: { metadata: DesignMetadata; editing: boolean; onChange: (p: Partial<DesignMetadata>) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Design Title">
        {editing ? (
          <input className="input" value={metadata.title} onChange={(e) => onChange({ title: e.target.value })} />
        ) : (
          <Readout text={metadata.title} />
        )}
      </Field>

      <Field label="Primary Tag">
        {editing ? (
          <input className="input" value={metadata.primaryTag ?? ""} onChange={(e) => onChange({ primaryTag: e.target.value || undefined })} />
        ) : (
          <Readout text={metadata.primaryTag ?? "—"} />
        )}
      </Field>

      <Field label="Description" full>
        {editing ? (
          <textarea className="input min-h-[80px]" value={metadata.description} onChange={(e) => onChange({ description: e.target.value })} />
        ) : (
          <Readout text={metadata.description || "—"} multiline />
        )}
      </Field>

      <Field label="Supporting Tags" full>
        {editing ? (
          <textarea
            className="input min-h-[80px]"
            value={metadata.tags.join(", ")}
            onChange={(e) => onChange({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
            placeholder="comma-separated tags"
          />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {metadata.tags.length > 0
              ? metadata.tags.map((t) => <span key={t} className="chip-mute">{t}</span>)
              : <span className="text-zinc-500 text-sm">—</span>}
          </div>
        )}
      </Field>

      <Field label="Adult Content">
        {editing ? (
          <div className="flex gap-3">
            <RadioOption checked={!metadata.matureContent} label="No"  onClick={() => onChange({ matureContent: false })} />
            <RadioOption checked={metadata.matureContent}  label="Yes" onClick={() => onChange({ matureContent: true })} />
          </div>
        ) : (
          metadata.matureContent
            ? <span className="chip-warn">Yes</span>
            : <span className="chip-ok">No</span>
        )}
      </Field>
    </div>
  );
}

// ── Products tab ────────────────────────────────────────────────────────────
function ProductsTab({
  metadata, editing, onChange, totalDesigns, onApplyToAll,
}: {
  metadata: DesignMetadata;
  editing: boolean;
  onChange: (next: string[]) => void;
  totalDesigns?: number;
  onApplyToAll?: () => void;
}) {
  const enabled = new Set(metadata.enabledProducts ?? []);
  function toggle(name: string) {
    const next = new Set(enabled);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next]);
  }
  const canApplyToAll = !!onApplyToAll && (totalDesigns ?? 0) > 1;
  return (
    <div className="space-y-3">
      {canApplyToAll && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {enabled.size} of {ALL_PRODUCTS.length} enabled.
          </p>
          <button
            type="button"
            className="btn-ghost text-xs px-2.5 py-1.5"
            title="Copy this design's enabled products onto every other design in the batch"
            onClick={() => {
              if (window.confirm(`Copy these enabled products to all ${totalDesigns} designs? This overwrites every other design's product list.`)) {
                onApplyToAll?.();
              }
            }}
          >
            Apply to all {totalDesigns}
          </button>
        </div>
      )}
      {/* Terminal checklist — [x]/[ ] rows laid out in columns. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-0.5">
        {ALL_PRODUCTS.map((name) => {
          const on = enabled.has(name);
          return (
            <button
              key={name}
              onClick={() => editing && toggle(name)}
              disabled={!editing}
              className={clsx(
                "group flex items-center gap-2.5 px-2 py-1.5 text-sm text-left rounded-sm transition",
                editing ? "cursor-pointer hover:bg-ink-800" : "cursor-default",
                on ? "text-zinc-100" : "text-zinc-500"
              )}
            >
              <span className={clsx("font-mono select-none shrink-0", on ? "text-accent-500" : "text-zinc-600")}>
                {on ? "[x]" : "[ ]"}
              </span>
              <span className="truncate">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────
function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={clsx(full && "md:col-span-2")}>
      <div className="text-xs font-semibold text-zinc-300 mb-1">{label}</div>
      {children}
    </div>
  );
}

function Readout({ text, multiline = false }: { text: string; multiline?: boolean }) {
  return (
    <div className={clsx("surface-soft px-3 py-2 text-sm text-zinc-200", multiline && "whitespace-pre-wrap")}>
      {text}
    </div>
  );
}

function RadioOption({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 rounded-lg border text-sm transition",
        checked ? "border-accent-500 bg-accent-500/10 text-accent-200" : "border-white/10 text-zinc-300 hover:border-white/20"
      )}
    >
      <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
            style={{ background: checked ? "currentColor" : "transparent", boxShadow: "inset 0 0 0 1px currentColor" }} />
      {label}
    </button>
  );
}

