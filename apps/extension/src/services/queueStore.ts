// Single-batch persistence in chrome.storage.local. Survives browser restart.
// The store does NOT contain business logic — it just reads/writes/notifies.

import type { QueueBatch, QueueItem, QueueItemStatus } from "@teepublic/shared";

const KEY = "teepublic.batch";
const SETTINGS_KEY = "teepublic.settings";

export interface ExtensionSettings {
  dashboardOrigin: string;        // where to fetch design files from
  betweenItemsMinMs: number;      // min wait between items
  betweenItemsMaxMs: number;      // max wait between items
  retryMax: number;               // attempts per item
  paused: boolean;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  dashboardOrigin: "http://localhost:3030",
  betweenItemsMinMs: 8_000,
  betweenItemsMaxMs: 18_000,
  retryMax: 2,
  paused: false,
};

type Listener = (batch: QueueBatch | null) => void;
const listeners = new Set<Listener>();

export const QueueStore = {
  async get(): Promise<QueueBatch | null> {
    const all = await chrome.storage.local.get(KEY);
    return (all[KEY] as QueueBatch | undefined) ?? null;
  },

  async set(batch: QueueBatch | null): Promise<void> {
    if (batch == null) {
      await chrome.storage.local.remove(KEY);
    } else {
      await chrome.storage.local.set({ [KEY]: batch });
    }
    for (const l of listeners) l(batch);
  },

  async updateItem(itemId: string, patch: Partial<QueueItem>): Promise<QueueBatch | null> {
    const batch = await this.get();
    if (!batch) return null;
    const idx = batch.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return batch;
    batch.items[idx] = { ...batch.items[idx], ...patch, updatedAt: Date.now() };
    await this.set(batch);
    return batch;
  },

  async setItemStatus(itemId: string, status: QueueItemStatus, extra: Partial<QueueItem> = {}) {
    return this.updateItem(itemId, { status, ...extra });
  },

  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Watch storage so popup/queue pages get live updates from the service worker.
  installCrossPageListener(fn: Listener) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !(KEY in changes)) return;
      fn((changes[KEY].newValue as QueueBatch | undefined) ?? null);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  },
};

export const SettingsStore = {
  async get(): Promise<ExtensionSettings> {
    const all = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...((all[SETTINGS_KEY] as Partial<ExtensionSettings>) ?? {}) };
  },
  async set(patch: Partial<ExtensionSettings>) {
    const next = { ...(await this.get()), ...patch };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  },
};
