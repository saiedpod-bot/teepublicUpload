// Sends messages from the dashboard (web page) to the Chrome extension
// using chrome.runtime.sendMessage(extensionId, msg).
// The extension's manifest.json declares this origin in "externally_connectable".

import type { DashboardToExtensionMessage, ExtensionToDashboardResponse, QueueBatch } from "@teepublic/shared";

// Minimal shape of the chrome.runtime API we use. Declared locally (not as a
// global Window augmentation) to avoid colliding with @types/chrome, which is
// pulled in elsewhere in the monorepo.
type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback?: (response: ExtensionToDashboardResponse) => void
  ) => void;
  lastError?: { message: string };
};

function chromeRuntime(): ChromeRuntime | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
}

const STORAGE_KEY = "teepublic.extensionId";

export function getExtensionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setExtensionId(id: string) {
  window.localStorage.setItem(STORAGE_KEY, id.trim());
}

export function clearExtensionId() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isExtensionAvailable(): boolean {
  return !!chromeRuntime()?.sendMessage;
}

export function sendToExtension(
  message: DashboardToExtensionMessage,
  extensionId?: string
): Promise<ExtensionToDashboardResponse> {
  return new Promise((resolve, reject) => {
    const id = extensionId ?? getExtensionId();
    if (!id) return reject(new Error("Extension ID not configured"));
    const runtime = chromeRuntime();
    if (!runtime?.sendMessage) return reject(new Error("chrome.runtime is unavailable — open this page in Chrome and install the extension"));

    try {
      runtime.sendMessage(id, message, (response) => {
        const err = runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!response) return reject(new Error("no response from extension (is it installed and the ID correct?)"));
        resolve(response);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Send a queue to the extension WITHOUT exceeding Chrome's 64 MiB per-message
 *  limit. Local designs carry their image as a multi-MB base64 data URL, so a
 *  whole batch in one QUEUE_INIT can blow the cap. Instead: send QUEUE_INIT with
 *  images stripped (metadata only), then each image in its own QUEUE_IMAGE. */
export async function sendQueueToExtension(
  batch: QueueBatch,
  extensionId?: string,
): Promise<void> {
  const lightBatch: QueueBatch = {
    ...batch,
    items: batch.items.map((it) => ({ ...it, imageUrl: "" })),
  };
  const init = await sendToExtension({ type: "QUEUE_INIT", batch: lightBatch }, extensionId);
  if (!init.ok) throw new Error(init.error);

  for (const it of batch.items) {
    if (!it.imageUrl) continue;
    const res = await sendToExtension(
      { type: "QUEUE_IMAGE", itemId: it.id, imageUrl: it.imageUrl },
      extensionId,
    );
    if (!res.ok) throw new Error(`image for ${it.metadata.filename || it.id}: ${res.error}`);
  }
}

export async function pingExtension(extensionId?: string): Promise<boolean> {
  try {
    const r = await sendToExtension({ type: "PING" }, extensionId);
    return r.ok === true;
  } catch {
    return false;
  }
}
