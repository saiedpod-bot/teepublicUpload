import type { QueueBatch, QueueItem } from "@teepublic/shared";
import { QueueStore } from "../services/queueStore";

function $(id: string) { return document.getElementById(id) as HTMLElement; }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function tileHtml(item: QueueItem): string {
  const selected = item.selected !== false;
  return `
    <div class="tile ${selected ? "selected" : ""}" data-id="${item.id}" title="${escapeHtml(item.metadata.title)}">
      <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.metadata.title)}" onerror="this.style.opacity=0.2" />
      <div class="check">${selected ? "✓" : ""}</div>
      <div class="status ${item.status}">${item.status}</div>
    </div>
  `;
}

let lastBatch: QueueBatch | null = null;

function render(batch: QueueBatch | null) {
  lastBatch = batch;
  const total = batch?.items.length ?? 0;
  const picked = batch?.items.filter((i) => i.selected !== false).length ?? 0;
  const done = batch?.items.filter((i) => i.status === "succeeded").length ?? 0;
  const fail = batch?.items.filter((i) => i.status === "failed").length ?? 0;
  $("s-total").textContent  = String(total);
  $("s-picked").textContent = String(picked);
  $("s-done").textContent   = String(done);
  $("s-fail").textContent   = String(fail);
  ($("empty") as HTMLElement).style.display = batch ? "none" : "block";

  const grid = $("grid");
  grid.innerHTML = batch ? batch.items.map(tileHtml).join("") : "";
  $("picked-summary").textContent = batch ? `${picked} of ${total} selected for upload` : "";

  // Toggle button label flips based on current state.
  const allSelected = total > 0 && picked === total;
  $("btn-toggle-all").textContent = allSelected ? "Deselect all" : "Select all";

  wireTiles(grid);
}

function wireTiles(grid: HTMLElement) {
  grid.querySelectorAll<HTMLElement>(".tile").forEach((tile) => {
    tile.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = tile.dataset.id;
      if (!id) return;
      const wasSelected = tile.classList.contains("selected");
      tile.classList.toggle("selected", !wasSelected);
      const check = tile.querySelector<HTMLElement>(".check");
      if (check) check.textContent = !wasSelected ? "✓" : "";
      bumpPicked(!wasSelected ? +1 : -1);
      try {
        await chrome.runtime.sendMessage({ type: "ITEM_TOGGLE_SELECTED", itemId: id });
        setTimeout(async () => render(await QueueStore.get()), 250);
      } catch (err) {
        console.error("[popup] toggle failed:", err);
        tile.classList.toggle("selected", wasSelected);
        if (check) check.textContent = wasSelected ? "✓" : "";
        bumpPicked(wasSelected ? +1 : -1);
      }
    });
  });
}

function bumpPicked(delta: number): void {
  const el = $("s-picked");
  const n = parseInt(el.textContent || "0", 10) + delta;
  el.textContent = String(Math.max(0, n));
  const total = parseInt($("s-total").textContent || "0", 10);
  $("picked-summary").textContent = `${Math.max(0, n)} of ${total} selected for upload`;
  const allSelected = total > 0 && n === total;
  $("btn-toggle-all").textContent = allSelected ? "Deselect all" : "Select all";
}

async function init() {
  $("ext-id").textContent = `ID: ${chrome.runtime.id}`;
  render(await QueueStore.get());
  QueueStore.installCrossPageListener(render);

  // Stable controls (independent of grid contents).
  $("btn-toggle-all").onclick = async () => {
    if (!lastBatch) return;
    const total = lastBatch.items.length;
    const picked = lastBatch.items.filter((i) => i.selected !== false).length;
    const nextValue = picked < total; // if not all selected → select all; if all → deselect
    // Optimistic UI
    const grid = $("grid");
    grid.querySelectorAll<HTMLElement>(".tile").forEach((t) => {
      t.classList.toggle("selected", nextValue);
      const c = t.querySelector<HTMLElement>(".check");
      if (c) c.textContent = nextValue ? "✓" : "";
    });
    $("s-picked").textContent = String(nextValue ? total : 0);
    $("picked-summary").textContent = `${nextValue ? total : 0} of ${total} selected for upload`;
    $("btn-toggle-all").textContent = nextValue ? "Deselect all" : "Select all";
    await chrome.runtime.sendMessage({ type: "ITEMS_SELECT_ALL", value: nextValue });
    setTimeout(async () => render(await QueueStore.get()), 250);
  };

  $("btn-invert").onclick = async () => {
    if (!lastBatch) return;
    // Optimistic flip every tile.
    const grid = $("grid");
    grid.querySelectorAll<HTMLElement>(".tile").forEach((t) => {
      const cur = t.classList.contains("selected");
      t.classList.toggle("selected", !cur);
      const c = t.querySelector<HTMLElement>(".check");
      if (c) c.textContent = !cur ? "✓" : "";
    });
    await chrome.runtime.sendMessage({ type: "ITEMS_INVERT_SELECTED" });
    setTimeout(async () => render(await QueueStore.get()), 250);
  };

  $("btn-start").onclick = () => chrome.runtime.sendMessage({ type: "ENGINE_START" });
  $("btn-pause").onclick = () => chrome.runtime.sendMessage({ type: "ENGINE_PAUSE" });
  $("btn-open").onclick  = () => chrome.tabs.create({ url: chrome.runtime.getURL("queue/index.html") });
  $("btn-clear").onclick = async () => {
    if (confirm("Clear the queue? Any pending uploads will be discarded.")) {
      await chrome.runtime.sendMessage({ type: "QUEUE_CLEAR" });
    }
  };
}

init();
