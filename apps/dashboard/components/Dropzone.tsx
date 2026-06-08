"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

interface Props {
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  badge?: string;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ title, hint, accept, multiple, badge, onFiles }: Props) {
  const [active, setActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }, [onFiles]);

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold tracking-tight">{title}</h3>
        {badge && <span className="chip-info">{badge}</span>}
      </div>
      <div
        className={clsx("dropzone", active && "dropzone-active")}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setActive(true); }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
            e.target.value = "";
          }}
        />
        <div className="text-sm text-zinc-200 font-medium">Drop files here, or click to browse</div>
        <div className="text-xs text-zinc-400 mt-1">{hint}</div>
      </div>
    </div>
  );
}
