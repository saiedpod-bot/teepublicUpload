"use client";

import { useState, useRef } from "react";
import { nanoid } from "nanoid";
import { generateDesigns } from "@/lib/imageGen";
import { removeBackgroundFromBase64, padToMinimum } from "@/lib/removeBg";

interface GenResult {
  id: string;
  base64: string;
  previewUrl: string;
}

export function DesignGenerator() {
  const [competitorImage, setCompetitorImage] = useState<string | null>(null);
  const [competitorTitle, setCompetitorTitle] = useState("");
  const [designCount, setDesignCount] = useState(4);
  const [results, setResults] = useState<GenResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImage(file: File | undefined) {
    if (!file) return;
    setCompetitorImage(URL.createObjectURL(file));
  }

  function buildPrompt(): string {
    let p = competitorTitle.trim();
    if (!p) p = "trendy t-shirt design";
    return `Style reference from a competitor design. Create a unique, original t-shirt design inspired by this theme: "${p}". The design must be completely different but target the same audience. No background, no watermark, clean printable vector style.`;
  }

  async function handleGenerate() {
    setError(null);
    if (!competitorTitle && !competitorImage) { setError("Upload a competitor design or enter a title."); return; }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setResults([]);

    try {
      const images = await generateDesigns(buildPrompt(), designCount, ac.signal);
      const genResults: GenResult[] = await Promise.all(images.map(async (img) => {
        // Remove background, then scale to meet 4500×5400 minimum
        const cleanUrl = await removeBackgroundFromBase64(img.base64, img.mime);
        const paddedUrl = await padToMinimum(cleanUrl.split(",")[1] || img.base64, "image/png");
        const cleaned = paddedUrl.split(",")[1] || img.base64;
        return {
          id: nanoid(10),
          base64: cleaned,
          previewUrl: paddedUrl,
        };
      }));
      setResults(genResults);
    } catch (e) {
      if (!ac.signal.aborted) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setBusy(false);
  }

  function downloadAll() {
    for (const r of results) {
      const a = document.createElement("a");
      a.href = r.previewUrl;
      a.download = `design-${r.id}.png`;
      a.click();
    }
  }

  return (
    <div className="space-y-6">
      <div className="surface p-4 bg-green-900/10 border border-green-700/30 rounded text-xs text-green-300 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400" />
        Authenticated via Google Cloud ADC (Service Account)
      </div>

      <section className="surface p-5 space-y-3">
        <h3 className="text-sm font-semibold">Competitor Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="label">Upload competitor design</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="input"
              onChange={(e) => handleImage(e.target.files?.[0])}
            />
            {competitorImage && (
              <img src={competitorImage} alt="Competitor" className="w-full max-w-[200px] rounded border border-zinc-700" />
            )}
          </div>
          <div className="space-y-2">
            <label className="label">Competitor title</label>
            <input
              className="input"
              placeholder="e.g. Vintage Cat Lover Gift"
              value={competitorTitle}
              onChange={(e) => setCompetitorTitle(e.target.value)}
            />
            <label className="label mt-3">Number of designs to generate</label>
            <div className="flex items-center gap-2">
              {[1, 2, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`tab ${designCount === n ? "tab-active" : ""}`}
                  onClick={() => setDesignCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        {busy ? (
          <button type="button" className="btn-danger" onClick={cancel}>Cancel</button>
        ) : (
          <button type="button" className="btn-primary" onClick={handleGenerate}>
            Generate {designCount} {designCount === 1 ? "design" : "designs"}
          </button>
        )}
        {busy && <span className="text-sm text-zinc-400">Generating with Vertex AI...</span>}
      </div>

      {error && <div className="surface p-4 text-danger-500">{error}</div>}

      {results.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Generated Designs ({results.length})</h3>
            <button type="button" className="btn-ghost text-xs" onClick={downloadAll}>
              Download All
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {results.map((r) => (
              <div key={r.id} className="surface p-3 space-y-2">
                <img src={r.previewUrl} alt="Generated" className="w-full aspect-square object-contain rounded bg-white" />
                <a
                  href={r.previewUrl}
                  download={`design-${r.id}.png`}
                  className="btn-ghost text-xs w-full text-center block"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-center text-[10px] text-zinc-600 pt-2 pb-1 select-none">
        © SaiedPod — All Rights Reserved
      </div>
    </div>
  );
}
