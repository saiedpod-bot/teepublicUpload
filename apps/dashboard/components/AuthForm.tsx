"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { isBypassValid, setBypassCode } from "@/lib/bypassAuth";

type Mode = "login" | "register";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bypassCode, setBypassCode_] = useState("");
  const [bypassError, setBypassError] = useState<string | null>(null);

  const isRegister = mode === "register";

  function handleBypass() {
    if (isBypassValid(bypassCode)) {
      setBypassCode(bypassCode);
      window.location.assign(next);
    } else {
      setBypassError("Invalid code. Try again.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      if (data.needsConfirmation) {
        // Email confirmation is on — there's no session yet, so don't navigate.
        setNotice(`Check ${email} for a confirmation link, then sign in.`);
        setMode("login");
        setPassword("");
        return;
      }
      // Full navigation so middleware re-evaluates with the fresh cookie.
      window.location.assign(next);
    } catch {
      setError("Network error. Is the dashboard still running?");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  return (
    <div className="surface p-6 w-full max-w-md">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-accent-400">
          {isRegister ? "Create account" : "Sign in"}
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          <span className="text-accent-700">$</span>{" "}
          {isRegister
            ? "set up local access to the uploader"
            : "access your local upload manager"}
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input font-mono"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            spellCheck={false}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input font-mono"
            placeholder={isRegister ? "at least 8 characters" : "••••••••"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            required
          />
        </div>

        {notice && (
          <div className="chip-mute w-full justify-center py-2">{notice}</div>
        )}

        {error && (
          <div className="chip-err w-full justify-center py-2">{error}</div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Working…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 text-center text-xs text-zinc-400">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className={clsx("text-accent-400 hover:text-accent-300 underline underline-offset-2")}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            No account yet?{" "}
            <button
              type="button"
              className={clsx("text-accent-400 hover:text-accent-300 underline underline-offset-2")}
              onClick={() => switchMode("register")}
            >
              Create one
            </button>
          </>
        )}
      </div>

      <hr className="my-6 border-zinc-700/50" />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300">Quick Access</h3>
        <p className="text-xs text-zinc-500">
          Enter bypass code for direct access (no account required).
        </p>
        <div className="flex items-center gap-2">
          <input
            type="password"
            className="input font-mono flex-1"
            placeholder="Enter code"
            value={bypassCode}
            onChange={(e) => { setBypassCode_(e.target.value); setBypassError(null); }}
            autoComplete="off"
          />
          <button type="button" className="btn-primary" onClick={handleBypass}>
            Access
          </button>
        </div>
        {bypassError && (
          <div className="chip-err w-full justify-center py-2">{bypassError}</div>
        )}
      </div>
    </div>
  );
}
