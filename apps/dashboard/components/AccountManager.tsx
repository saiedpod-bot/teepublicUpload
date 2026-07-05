"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type TeePublicAccount,
  loadAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  exportAccountsToXlsx,
} from "@/lib/accounts";

const emptyForm = { email: "", password: "", storeName: "", active: true, notes: "" };

export function AccountManager() {
  const [accounts, setAccounts] = useState<TeePublicAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPasswords, setShowPasswords] = useState(false);

  const refresh = useCallback(() => setAccounts(loadAccounts()), []);

  useEffect(() => { refresh(); }, [refresh]);

  function openAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(acc: TeePublicAccount) {
    setForm({ email: acc.email, password: acc.password, storeName: acc.storeName, active: acc.active, notes: acc.notes });
    setEditingId(acc.id);
    setShowForm(true);
  }

  function save() {
    if (!form.email || !form.password) return;
    if (editingId) {
      setAccounts(updateAccount(editingId, form));
    } else {
      setAccounts(addAccount(form));
    }
    setShowForm(false);
  }

  function remove(id: string) {
    if (!confirm("Delete this account?")) return;
    setAccounts(deleteAccount(id));
  }

  function toggleStatus(id: string, current: boolean) {
    setAccounts(updateAccount(id, { active: !current }));
  }

  async function handleExport() {
    const blob = await exportAccountsToXlsx(accounts);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teepublic_accounts_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold">Account Manager</h2>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary text-sm" onClick={openAdd}>+ Add Account</button>
          <button type="button" className="btn-ghost text-sm" onClick={handleExport} disabled={accounts.length === 0}>
            Export to Excel
          </button>
          <button
            type="button"
            className={`text-xs px-2 py-1 rounded ${showPasswords ? "bg-accent-500/20 text-accent-400" : "text-zinc-500"}`}
            onClick={() => setShowPasswords((p) => !p)}
          >
            {showPasswords ? "Hide" : "Show"} Passwords
          </button>
        </div>
      </div>

      {showForm && (
        <div className="surface p-5 space-y-3">
          <h3 className="text-sm font-semibold">{editingId ? "Edit" : "Add"} Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="input" placeholder="Email" type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <input className="input" placeholder="Password" type="text" value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <input className="input" placeholder="Store Name" value={form.storeName}
              onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))} />
            <input className="input" placeholder="Notes (optional)" value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              Active
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-primary text-sm" onClick={save}>Save</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="surface p-8 text-center text-zinc-500">No accounts yet. Click &quot;+ Add Account&quot; to begin.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left p-2 w-8">#</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Password</th>
                <th className="text-left p-2">Store Name</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Notes</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc, i) => (
                <tr key={acc.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                  <td className="p-2 text-zinc-500">{i + 1}</td>
                  <td className="p-2 font-mono text-xs">{acc.email}</td>
                  <td className="p-2 font-mono text-xs">
                    {showPasswords ? acc.password : "••••••••"}
                  </td>
                  <td className="p-2">{acc.storeName || "—"}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border cursor-pointer ${
                        acc.active
                          ? "border-green-600 text-green-400 bg-green-900/20"
                          : "border-red-600 text-red-400 bg-red-900/20"
                      }`}
                      onClick={() => toggleStatus(acc.id, acc.active)}
                      title="Click to toggle"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.active ? "bg-green-400" : "bg-red-400"}`} />
                      {acc.active ? "Active" : "Closed"}
                    </button>
                  </td>
                  <td className="p-2 text-xs text-zinc-500 max-w-[150px] truncate">{acc.notes || "—"}</td>
                  <td className="p-2 text-right">
                    <button type="button" className="text-xs text-accent-400 hover:underline mr-2" onClick={() => openEdit(acc)}>Edit</button>
                    <button type="button" className="text-xs text-danger-500 hover:underline" onClick={() => remove(acc.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-center text-[10px] text-zinc-600 pt-2 pb-1 select-none">
        © SaiedPod — All Rights Reserved
      </div>
    </div>
  );
}
