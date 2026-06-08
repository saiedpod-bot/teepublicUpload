"use client";

interface Props {
  chromePresent: boolean;
  extensionId: string;
  onChange: (v: string) => void;
  onPing: () => void;
  ok: boolean | null;
}

export function ExtensionStatus({ chromePresent, extensionId, onChange, onPing, ok }: Props) {
  return (
    <div className="surface p-4 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex items-center gap-3">
        <span className={chromePresent ? "chip-ok" : "chip-err"}>
          {chromePresent ? "Chrome detected" : "Chrome required"}
        </span>
        {ok === true && <span className="chip-ok">Extension reachable</span>}
        {ok === false && <span className="chip-err">Extension not responding</span>}
      </div>
      <div className="flex-1 flex gap-2">
        <input
          className="flex-1 surface-soft px-3 py-2 text-sm font-mono outline-none focus:border-accent-500/60"
          placeholder="Paste your extension ID (chrome://extensions → toggle Developer mode)"
          value={extensionId}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
        <button className="btn-ghost" onClick={onPing}>Test connection</button>
      </div>
    </div>
  );
}
