import type { QueueBatch, QueueItem } from "@teepublic/shared";
import { QueueStore } from "../services/queueStore";

function $(id: string) { return document.getElementById(id) as HTMLElement; }

function render(batch: QueueBatch | null) {
  const list = $("list");
  const empty = $("empty");

  if (!batch || batch.items.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    setStats(0, 0, 0, 0, 0);
    setMeta("");
    return;
  }
  empty.style.display = "none";

  const total  = batch.items.length;
  const picked = batch.items.filter((i) => i.selected !== false).length;
  const done   = batch.items.filter((i) => i.status === "succeeded").length;
  const fail   = batch.items.filter((i) => i.status === "failed").length;
  const left   = picked - done - fail;
  setStats(total, picked, done, fail, Math.max(0, left));
  ($("progress") as HTMLElement).style.width = `${picked > 0 ? Math.round(((done + fail) / picked) * 100) : 0}%`;
  setMeta(`Source: ${escapeHtml(batch.source.spreadsheetName)} • ${total} items • ${picked} selected • batch ${batch.id}`);

  list.innerHTML = batch.items.map(cardHtml).join("");

  list.querySelectorAll<HTMLButtonElement>("[data-retry]").forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); chrome.runtime.sendMessage({ type: "ITEM_RETRY", itemId: btn.dataset.retry }); };
  });
  list.querySelectorAll<HTMLAnchorElement>("[data-published]").forEach((a) => { a.target = "_blank"; a.rel = "noreferrer"; });
  list.querySelectorAll<HTMLElement>("[data-toggle-id]").forEach((el) => {
    el.onclick = (e) => {
      // Don't toggle when clicking the inner Retry / View buttons.
      if ((e.target as HTMLElement).closest("button, a")) return;
      const id = el.dataset.toggleId;
      if (id) chrome.runtime.sendMessage({ type: "ITEM_TOGGLE_SELECTED", itemId: id });
    };
  });
}

function cardHtml(item: QueueItem): string {
  const selected = item.selected !== false;
  const tags = item.metadata.tags.slice(0, 4).map((t) => `<span class="chip chip-pending">${escapeHtml(t)}</span>`).join(" ");
  const err  = item.lastError ? `<div class="err">${escapeHtml(item.lastError)}</div>` : "";
  const published = item.publishedUrl
    ? `<a class="chip chip-succeeded" href="${escapeHtml(item.publishedUrl)}" data-published>View ↗</a>`
    : "";
  return `
    <div class="card ${selected ? "" : "deselected"}" data-toggle-id="${item.id}">
      <div class="thumb">
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.metadata.title)}" onerror="this.outerHTML='<span class=meta>image unavailable</span>'" />
        <div class="select-mark">${selected ? "✓" : ""}</div>
      </div>
      <div class="row">
        <h3>${escapeHtml(item.metadata.title)}</h3>
        <span class="chip chip-${item.status}">${item.status}</span>
      </div>
      <div class="meta">${escapeHtml(item.metadata.filename)} • try ${item.attempts}</div>
      <div>${tags}</div>
      ${err}
      <div class="actions">
        ${item.status === "failed" || item.status === "queued" ? `<button data-retry="${item.id}">Retry</button>` : ""}
        ${published}
      </div>
    </div>
  `;
}

function setStats(total: number, picked: number, done: number, fail: number, left: number) {
  $("s-total").textContent  = String(total);
  $("s-picked").textContent = String(picked);
  $("s-done").textContent   = String(done);
  $("s-fail").textContent   = String(fail);
  $("s-left").textContent   = String(left);
}
function setMeta(text: string) { $("meta").textContent = text; }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function init() {
  render(await QueueStore.get());
  QueueStore.installCrossPageListener(render);

  $("btn-start").onclick   = () => chrome.runtime.sendMessage({ type: "ENGINE_START" });
  $("btn-pause").onclick   = () => chrome.runtime.sendMessage({ type: "ENGINE_PAUSE" });
  $("btn-all").onclick     = () => chrome.runtime.sendMessage({ type: "ITEMS_SELECT_ALL", value: true });
  $("btn-none").onclick    = () => chrome.runtime.sendMessage({ type: "ITEMS_SELECT_ALL", value: false });
  $("btn-clear").onclick   = async () => {
    if (confirm("Clear the queue? Any pending uploads will be discarded.")) {
      await chrome.runtime.sendMessage({ type: "QUEUE_CLEAR" });
    }
  };
}

init();
