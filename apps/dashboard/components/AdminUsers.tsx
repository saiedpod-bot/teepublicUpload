"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface AdminUser {
  id: string;
  email: string | null;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to load users.");
        return;
      }
      setUsers(data.users as AdminUser[]);
    } catch {
      setError("Network error loading users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = useMemo(() => users.filter((u) => !u.approved && !u.is_admin), [users]);

  async function setApproved(id: string, approved: boolean) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approved }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Update failed.");
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, approved } : u)));
    } catch {
      setError("Network error.");
    } finally {
      setPendingId(null);
    }
  }

  async function remove(id: string, email: string | null) {
    if (!confirm(`Delete ${email ?? "this user"}? This permanently removes their account.`)) {
      return;
    }
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Delete failed.");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setError("Network error.");
    } finally {
      setPendingId(null);
    }
  }

  if (loading) {
    return <div className="surface p-6 text-sm text-zinc-400">Loading users…</div>;
  }

  return (
    <div className="space-y-4">
      {error && <div className="chip-err w-full justify-center py-2">{error}</div>}

      <div className="flex items-center gap-3 text-sm">
        <span className="chip-mute">{users.length} total</span>
        {pending.length > 0 ? (
          <span className="chip-err">{pending.length} pending approval</span>
        ) : (
          <span className="chip-ok">no pending approvals</span>
        )}
        <button className="btn-ghost ml-auto" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-zinc-700/60">
              <th className="px-4 py-3 label">Email</th>
              <th className="px-4 py-3 label">Status</th>
              <th className="px-4 py-3 label">Joined</th>
              <th className="px-4 py-3 label text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const busy = pendingId === u.id;
              return (
                <tr key={u.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-zinc-700 dark:text-zinc-200">{u.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {u.is_admin ? (
                      <span className="chip-ok">admin</span>
                    ) : u.approved ? (
                      <span className="chip-mute">approved</span>
                    ) : (
                      <span className="chip-err">pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {!u.is_admin && !u.approved && (
                        <button
                          className="btn-primary"
                          disabled={busy}
                          onClick={() => setApproved(u.id, true)}
                        >
                          {busy ? "…" : "Approve"}
                        </button>
                      )}
                      {!u.is_admin && u.approved && (
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => setApproved(u.id, false)}
                        >
                          {busy ? "…" : "Revoke"}
                        </button>
                      )}
                      {!u.is_admin && (
                        <button
                          className="btn-ghost text-danger-500"
                          disabled={busy}
                          onClick={() => remove(u.id, u.email)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
