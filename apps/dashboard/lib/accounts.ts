const STORAGE_KEY = "teepublic_accounts";

export interface TeePublicAccount {
  id: string;
  email: string;
  password: string;
  storeName: string;
  active: boolean;
  notes: string;
  createdAt: string;
}

export function loadAccounts(): TeePublicAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveAccounts(accounts: TeePublicAccount[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function addAccount(account: Omit<TeePublicAccount, "id" | "createdAt">): TeePublicAccount[] {
  const accounts = loadAccounts();
  const newAccount: TeePublicAccount = {
    ...account,
    id: crypto.randomUUID?.() ?? Date.now().toString(36),
    createdAt: new Date().toISOString(),
  };
  accounts.push(newAccount);
  saveAccounts(accounts);
  return accounts;
}

export function updateAccount(id: string, updates: Partial<TeePublicAccount>): TeePublicAccount[] {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], ...updates };
    saveAccounts(accounts);
  }
  return accounts;
}

export function deleteAccount(id: string): TeePublicAccount[] {
  const accounts = loadAccounts().filter((a) => a.id !== id);
  saveAccounts(accounts);
  return accounts;
}

export async function exportAccountsToXlsx(accounts: TeePublicAccount[]): Promise<Blob> {
  const XLSX = await import("xlsx");
  const data = accounts.map((a, i) => ({
    "#": i + 1,
    Email: a.email,
    Password: a.password,
    "Store Name": a.storeName,
    Status: a.active ? "Active" : "Closed",
    Notes: a.notes,
    Created: new Date(a.createdAt).toLocaleDateString(),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Accounts");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], { type: "application/octet-stream" });
}
