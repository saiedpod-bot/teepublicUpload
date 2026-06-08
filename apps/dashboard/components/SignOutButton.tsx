"use client";

import { useState } from "react";

export function SignOutButton({ className = "btn-ghost" }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch {
      setBusy(false);
    }
  }

  return (
    <button className={className} onClick={signOut} disabled={busy}>
      {busy ? "…" : "Sign out"}
    </button>
  );
}
