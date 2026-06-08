"use client";

import type { ValidationIssue } from "@teepublic/shared";

export function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="surface p-4 text-success-500 flex items-center gap-2">
        <span className="chip-ok">All checks passed</span>
        <span className="text-sm text-zinc-300">Every matched row is ready to upload.</span>
      </div>
    );
  }

  return (
    <details className="surface p-4" open>
      <summary className="cursor-pointer font-medium select-none flex items-center gap-2">
        <span className="chip-warn">{issues.length} issue{issues.length === 1 ? "" : "s"}</span>
        <span className="text-sm text-zinc-300">Click to review</span>
      </summary>
      <div className="mt-3 max-h-72 overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400">
            <tr className="text-left">
              <th className="py-2 pr-4">Row</th>
              <th className="py-2 pr-4">Field</th>
              <th className="py-2 pr-4">Level</th>
              <th className="py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i, idx) => (
              <tr key={idx} className="border-t border-white/5">
                <td className="py-2 pr-4 stat">{i.row}</td>
                <td className="py-2 pr-4">{i.field}</td>
                <td className="py-2 pr-4">
                  <span className={i.level === "error" ? "chip-err" : "chip-warn"}>{i.level}</span>
                </td>
                <td className="py-2">{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
