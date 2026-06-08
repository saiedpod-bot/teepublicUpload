// Sends messages from the dashboard (web page) to the Chrome extension
// using chrome.runtime.sendMessage(extensionId, msg).
// The extension's manifest.json declares this origin in "externally_connectable".

import type { DashboardToExtensionMessage, ExtensionToDashboardResponse } from "@teepublic/shared";

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: unknown,
          callback?: (response: ExtensionToDashboardResponse) => void
        ) => void;
        lastError?: { message: string };
      };
    };
  }
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
  return typeof window !== "undefined" && !!window.chrome?.runtime?.sendMessage;
}

export function sendToExtension(
  message: DashboardToExtensionMessage,
  extensionId?: string
): Promise<ExtensionToDashboardResponse> {
  return new Promise((resolve, reject) => {
    const id = extensionId ?? getExtensionId();
    if (!id) return reject(new Error("Extension ID not configured"));
    if (!window.chrome?.runtime?.sendMessage) return reject(new Error("chrome.runtime is unavailable — open this page in Chrome and install the extension"));

    try {
      window.chrome.runtime.sendMessage(id, message, (response) => {
        const err = window.chrome?.runtime?.lastError;
        if (err) return reject(new Error(err.message));
        if (!response) return reject(new Error("no response from extension (is it installed and the ID correct?)"));
        resolve(response);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export async function pingExtension(extensionId?: string): Promise<boolean> {
  try {
    const r = await sendToExtension({ type: "PING" }, extensionId);
    return r.ok === true;
  } catch {
    return false;
  }
}
