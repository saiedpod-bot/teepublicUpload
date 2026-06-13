"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { parseSpreadsheet, stemName, type ParsedRow } from "@/lib/parser";
import { validateRows, type ValidationResult } from "@/lib/validator";
import { buildQueue, type MatchedImage } from "@/lib/queue";
import { isExtensionAvailable, sendQueueToExtension, pingExtension, getExtensionId, setExtensionId } from "@/lib/bridge";
import type { QueueBatch } from "@teepublic/shared";
import { Dropzone } from "./Dropzone";
import { DesignCard } from "./DesignCard";
import { ValidationPanel } from "./ValidationPanel";
import { ExtensionStatus } from "./ExtensionStatus";
import { GenerationApp } from "./GenerationApp";
import type { DesignMetadata } from "@teepublic/shared";
import { loadCustomBasicColors, saveCustomBasicColors, type CustomBasicColor } from "@/lib/batchConfig";
import { loadSpreadsheet, saveSpreadsheet } from "@/lib/spreadsheetStore";
import { uploadDesignImage } from "@/lib/uploadImage";

type Stage = "idle" | "validated" | "sending" | "sent";
type Mode  = "spreadsheet" | "generate";

export function UploaderApp() {
  const [sessionId] = useState(() => nanoid(10));
  const [mode, setMode] = useState<Mode>("spreadsheet");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [spreadsheetName, setSpreadsheetName] = useState<string>("");
  // Images keyed by STEM (lowercased, extensionless) so "1" matches "1.png".
  const [images, setImages] = useState<Map<string, MatchedImage>>(new Map());
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  // Start empty so server and client render the same HTML (no hydration
  // mismatch), then load the saved id from localStorage after mount.
  const [extensionId, setExtId] = useState<string>("");
  useEffect(() => { setExtId(getExtensionId() ?? ""); }, []);
  // chrome.runtime only exists in the browser; computing it during render
  // would differ from the server (always false) and break hydration.
  const [chromePresent, setChromePresent] = useState(false);
  useEffect(() => { setChromePresent(isExtensionAvailable()); }, []);
  // Becomes true once the saved spreadsheet batch has loaded, so the autosave
  // effect doesn't overwrite it with the empty initial state.
  const [hydrated, setHydrated] = useState(false);
  const [extensionOk, setExtensionOk] = useState<boolean | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Custom basic-color swatches — shared with the AI-generate flow via the
  // same localStorage key, so colors added on either page show up on both.
  const [customBasicColors, setCustomBasicColors] = useState<CustomBasicColor[]>([]);
  useEffect(() => { setCustomBasicColors(loadCustomBasicColors()); }, []);
  const customColorsLoaded = useRef(false);
  useEffect(() => {
    if (!customColorsLoaded.current) { customColorsLoaded.current = true; return; }
    saveCustomBasicColors(customBasicColors);
  }, [customBasicColors]);
  function addCustomBasicColor(c: CustomBasicColor) {
    setCustomBasicColors((prev) => prev.find((x) => x.name === c.name) ? prev : [...prev, c]);
  }
  function removeCustomBasicColor(name: string) {
    setCustomBasicColors((prev) => prev.filter((x) => x.name !== name));
  }

  function revalidate(nextRows = rows, nextImages = images) {
    if (nextRows.length === 0) {
      setValidation(null);
      return;
    }
    const stems = new Set([...nextImages.keys()]);
    const result = validateRows(nextRows, stems);
    setValidation(result);
    setStage("validated");
  }

  // Load the user's saved spreadsheet batch once on mount so their work follows
  // their account across browsers/devices.
  useEffect(() => {
    (async () => {
      try {
        const batch = await loadSpreadsheet();
        if (batch && (batch.rows.length > 0 || batch.images.length > 0)) {
          const map = new Map(batch.images.map((i) => [i.stem, i]));
          setSpreadsheetName(batch.spreadsheetName);
          setRows(batch.rows);
          setImages(map);
          revalidate(batch.rows, map);
        }
      } catch (e) {
        console.warn("loadSpreadsheet failed", e); // non-fatal: start empty
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Save the current batch to the user's account on demand (the Import button),
  // not automatically.
  const [importStage, setImportStage] = useState<"idle" | "saving" | "saved">("idle");
  async function importToAccount() {
    setError(null);
    setImportStage("saving");
    try {
      await saveSpreadsheet({ spreadsheetName, rows, images: [...images.values()] });
      setImportStage("saved");
    } catch (e) {
      setError(`Save failed: ${(e as Error).message}`);
      setImportStage("idle");
    }
  }
  // Any edit invalidates the "saved" indicator.
  useEffect(() => { if (hydrated) setImportStage("idle"); }, [rows, images, spreadsheetName, hydrated]);

  async function handleSpreadsheet(file: File) {
    setError(null);
    try {
      const parsed = await parseSpreadsheet(file);
      setSpreadsheetName(file.name);
      setRows(parsed);
      revalidate(parsed, images);
    } catch (e) {
      setError(`Failed to parse spreadsheet: ${(e as Error).message}`);
    }
  }

  async function handleImages(files: File[]) {
    setError(null);
    const next = new Map(images);
    for (const file of files) {
      try {
        const up = await uploadDesignImage(sessionId, file);
        const stem = stemName(up.originalName);
        next.set(stem, {
          stem,
          originalName: up.originalName,
          url: up.url,
          mime: up.mime,
          size: up.size,
        });
      } catch (e) {
        setError(`Upload of ${file.name} failed: ${(e as Error).message}`);
      }
    }
    setImages(next);
    revalidate(rows, next);
  }

  function removeImage(stem: string) {
    const next = new Map(images);
    next.delete(stem);
    setImages(next);
    revalidate(rows, next);
  }

  function updateRowMetadata(rowNumber: number, metadata: DesignMetadata) {
    const nextRows = rows.map((r) => (r.rowNumber === rowNumber ? { ...r, metadata } : r));
    setRows(nextRows);
    revalidate(nextRows, images);
  }

  /** Copy the source row's productColors onto every OTHER row in the batch.
   *  Leaves each row's enabledProducts + listing metadata alone. */
  function applyColorsToAllRows(sourceRowNumber: number) {
    const src = rows.find((r) => r.rowNumber === sourceRowNumber);
    if (!src) return;
    const nextRows = rows.map((r) =>
      r.rowNumber === sourceRowNumber
        ? r
        : { ...r, metadata: { ...r.metadata, productColors: { ...src.metadata.productColors } } }
    );
    setRows(nextRows);
    revalidate(nextRows, images);
  }

  /** Copy the source row's enabledProducts onto every OTHER row in the batch.
   *  Colors are left alone. */
  function applyProductsToAllRows(sourceRowNumber: number) {
    const src = rows.find((r) => r.rowNumber === sourceRowNumber);
    if (!src) return;
    const nextRows = rows.map((r) =>
      r.rowNumber === sourceRowNumber
        ? r
        : { ...r, metadata: { ...r.metadata, enabledProducts: [...src.metadata.enabledProducts] } }
    );
    setRows(nextRows);
    revalidate(nextRows, images);
  }

  async function handleStartUpload() {
    setError(null);
    if (!validation) return;
    if (!extensionId) {
      setError("Set the extension ID first (see the panel above).");
      return;
    }
    setStage("sending");
    try {
      const batch: QueueBatch = buildQueue(
        validation.validRows,
        images,
        { spreadsheetName, rowCount: rows.length },
      );
      // Send the queue to the extension only — the user picks which designs
      // to upload in the popup, then clicks Start there. Chunked so large
      // local images don't exceed Chrome's 64 MiB per-message limit.
      await sendQueueToExtension(batch, extensionId);
      setStage("sent");
    } catch (e) {
      setError((e as Error).message);
      setStage("validated");
    }
  }

  async function handlePing() {
    if (!extensionId) {
      setError("Enter the extension ID first.");
      return;
    }
    setExtensionId(extensionId);
    const ok = await pingExtension(extensionId);
    setExtensionOk(ok);
    if (!ok) setError("Extension did not respond — verify the ID and that it's loaded in Chrome.");
  }

  const matchedCount = validation?.validRows.length ?? 0;
  const errorCount = validation?.issues.filter((i) => i.level === "error").length ?? 0;

  return (
    <div className="space-y-6">
      <ExtensionStatus
        chromePresent={chromePresent}
        extensionId={extensionId}
        onChange={(v) => { setExtId(v); setExtensionId(v); }}
        onPing={handlePing}
        ok={extensionOk}
      />

      {/* Mode switcher — pick the input flow. */}
      <div className="surface px-2 py-2 inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMode("spreadsheet")}
          className={`tab ${mode === "spreadsheet" ? "tab-active" : ""}`}
        >
          From spreadsheet
        </button>
        <button
          type="button"
          onClick={() => setMode("generate")}
          className={`tab ${mode === "generate" ? "tab-active" : ""}`}
        >
          Generate with AI
        </button>
      </div>

      {mode === "generate" && <GenerationApp sessionId={sessionId} />}

      {mode === "spreadsheet" && (<>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Dropzone
          title="Spreadsheet"
          hint="Drop an .xlsx or .csv. Columns: filename, title, description, primary_tag, tags, products, mature_content"
          accept=".xlsx,.csv"
          onFiles={(f) => handleSpreadsheet(f[0])}
          badge={spreadsheetName ? `${spreadsheetName} • ${rows.length} rows` : undefined}
        />
        <Dropzone
          title="Design images"
          hint="Drop .png/.jpg files. Filenames match the `filename` column with or without extension (`1` matches `1.png`)."
          accept="image/png,image/jpeg,image/webp"
          multiple
          onFiles={handleImages}
          badge={images.size > 0 ? `${images.size} images staged` : undefined}
        />
      </div>

      {error && (
        <div className="surface p-4 border-danger-500/40 text-danger-500">{error}</div>
      )}

      {validation && (
        <>
          <div className="surface p-5 flex items-center justify-between gap-6">
            <div className="grid grid-cols-3 gap-8">
              <Stat label="Rows"          value={rows.length} />
              <Stat label="Matched"       value={matchedCount} accent="ok" />
              <Stat label="Blocking errors" value={errorCount} accent={errorCount ? "err" : "mute"} />
            </div>
            <div className="flex items-center gap-3">
              <button
                className="btn-ghost text-base px-6 py-3"
                disabled={(rows.length === 0 && images.size === 0) || importStage === "saving"}
                onClick={importToAccount}
              >
                {importStage === "saving" ? "Importing…" : importStage === "saved" ? "Imported ✓" : "Import"}
              </button>
              <button
                className="btn-primary text-base px-6 py-3"
                disabled={matchedCount === 0 || errorCount > 0 || stage === "sending"}
                onClick={handleStartUpload}
              >
                {stage === "sending" ? "Sending…" : stage === "sent" ? "Sent ✓" : `Send to extension (${matchedCount})`}
              </button>
            </div>
          </div>

          <ValidationPanel issues={validation.issues} />

          {validation.validRows.length > 0 && (() => {
            const safeIndex = Math.min(currentIndex, validation.validRows.length - 1);
            const row = validation.validRows[safeIndex];
            const stem = stemName(row.metadata.filename);
            return (
              <section className="space-y-3">
                <DesignPager
                  current={safeIndex}
                  total={validation.validRows.length}
                  onPrev={() => setCurrentIndex(Math.max(0, safeIndex - 1))}
                  onNext={() => setCurrentIndex(Math.min(validation.validRows.length - 1, safeIndex + 1))}
                  onJump={(i) => setCurrentIndex(Math.max(0, Math.min(validation.validRows.length - 1, i)))}
                />
                <DesignCard
                  key={row.rowNumber}
                  row={row}
                  image={images.get(stem)}
                  onChange={(rowNumber, next) => updateRowMetadata(rowNumber, next)}
                  onRemove={() => {
                    removeImage(stem);
                    // After removing, clamp the index so we don't land out of bounds.
                    setCurrentIndex((i) => Math.max(0, Math.min(i, validation.validRows.length - 2)));
                  }}
                  customBasicColors={customBasicColors}
                  onAddCustomBasicColor={addCustomBasicColor}
                  onRemoveCustomBasicColor={removeCustomBasicColor}
                  totalDesigns={validation.validRows.length}
                  onApplyColorsToAll={() => applyColorsToAllRows(row.rowNumber)}
                  onApplyProductsToAll={() => applyProductsToAllRows(row.rowNumber)}
                />
              </section>
            );
          })()}
        </>
      )}

      {!validation && (
        <div className="surface p-8 text-center text-zinc-500 dark:text-zinc-400">
          Upload a spreadsheet and matching images to begin.
        </div>
      )}
      </>)}
    </div>
  );
}

function DesignPager({
  current, total, onPrev, onNext, onJump,
}: {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (i: number) => void;
}) {
  const [draft, setDraft] = useState<string>("");
  const display = current + 1;

  return (
    <div className="surface px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost px-3 py-1.5 text-base"
          onClick={onPrev}
          disabled={current === 0}
          aria-label="Previous design"
        >
          ‹
        </button>
        <button
          className="btn-ghost px-3 py-1.5 text-base"
          onClick={onNext}
          disabled={current === total - 1}
          aria-label="Next design"
        >
          ›
        </button>
        <span className="text-sm">
          <span className="text-zinc-400">Design </span>
          <span className="font-mono text-accent-200">{display}</span>
          <span className="text-zinc-400"> of </span>
          <span className="font-mono text-zinc-900 dark:text-zinc-100">{total}</span>
        </span>
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(draft, 10);
          if (!Number.isNaN(n)) onJump(n - 1);
          setDraft("");
        }}
      >
        <input
          className="surface-soft px-2 py-1 text-sm w-20 outline-none focus:border-accent-500/60 font-mono"
          placeholder="Jump to…"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </form>
    </div>
  );
}

function Stat({ label, value, accent = "info" }: { label: string; value: number | string; accent?: "info" | "ok" | "err" | "mute" }) {
  const tone =
    accent === "ok"  ? "text-success-500"
    : accent === "err" ? "text-danger-500"
    : accent === "mute" ? "text-zinc-300"
    : "text-accent-200";
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`stat text-3xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
