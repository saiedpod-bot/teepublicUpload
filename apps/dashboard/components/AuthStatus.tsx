"use client";

import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";

interface Me {
  email: string;
  isAdmin: boolean;
}

export function AuthStatus() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.ok) setMe({ email: d.email, isAdmin: !!d.isAdmin });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!me) return null;

  return (
    <div className="flex items-center gap-2">
      {me.isAdmin && (
        <a href="/admin" className="btn-ghost">
          Admin
        </a>
      )}
      <span className="chip-mute font-mono" title={me.email}>
        {me.email}
      </span>
      <SignOutButton />
    </div>
  );
}
