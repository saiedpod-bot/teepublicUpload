import type { QueueBatch, QueueItem, QueueItemStatus } from "./types";

// Wire protocol between the dashboard (web page) and the Chrome extension.
// Sent via chrome.runtime.sendMessage(extensionId, ...) from the dashboard,
// received by the extension's onMessageExternal listener.

export type DashboardToExtensionMessage =
  | { type: "PING" }
  | { type: "QUEUE_INIT"; batch: QueueBatch }
  | { type: "QUEUE_START" }
  | { type: "QUEUE_PAUSE" }
  | { type: "ITEM_RETRY"; itemId: string };

export type ExtensionToDashboardResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

// Internal — runtime messages within the extension itself.
export type InternalMessage =
  | { type: "QUEUE_STATE_REQUEST" }
  | { type: "QUEUE_STATE_UPDATE"; batch: QueueBatch | null }
  | { type: "ITEM_STATUS"; itemId: string; status: QueueItemStatus; error?: string; publishedUrl?: string }
  | { type: "RUN_NEXT" }
  | { type: "AUTOMATION_START_ITEM"; item: QueueItem; imageDataUrl: string }
  | { type: "AUTOMATION_LOG"; itemId: string; message: string };
