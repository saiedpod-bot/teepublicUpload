/* ════ TeePublic Intelligence — Frontend Logic ════ */

const $ = (id) => document.getElementById(id);

// ─── State ───
let catalogPage = 1;
let catalogTotalPages = 1;
let uploadedFile = null;

// ─── Init ───
document.addEventListener("DOMContentLoaded", () => {
  checkStatus();
  loadStats();
  loadCatalog();
  bindTabs();
  bindSearch();
  bindImageSearch();
  bindChips();
  bindCatalog();
  bindLiveSearch();
});

// ─── Status check ───
async function checkStatus() {
  const pill = $("status-pill");
  try {
    const r = await fetch("/api/status");
    const d = await r.json();
    if (d.qdrant === "ok") {
      pill.className = "status ok";
      pill.textContent = `🟢 متصل · ${d.points} تصميم`;
      $("stat-total").textContent = d.points;
    } else {
      pill.className = "status error";
      pill.textContent = "🔴 Qdrant غير متصل";
    }
  } catch (e) {
    pill.className = "status error";
    pill.textContent = "🔴 خطأ في الاتصال";
  }
}

// ─── Tabs ───
function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $("tab-" + tab.dataset.tab).classList.add("active");
    });
  });
}

// ─── Quick chips ───
function bindChips() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $("text-query").value = chip.dataset.q;
      doTextSearch();
    });
  });
}

// ─── Text Search ───
function bindSearch() {
  $("btn-text-search").addEventListener("click", doTextSearch);
  $("text-query").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doTextSearch();
  });
}

async function doTextSearch() {
  const q = $("text-query").value.trim();
  const category = $("category-search").value;
  if (!q) return;

  const grid = $("search-results");
  $("search-loading").hidden = false;
  grid.innerHTML = "";

  try {
    const url = `/api/search?q=${encodeURIComponent(q)}&top_k=12&category=${encodeURIComponent(category)}`;
    const r = await fetch(url);
    const d = await r.json();
    renderResults(grid, d.results, d.mode === "text" ? q : null, d.error);
  } catch (e) {
    grid.innerHTML = `<div class="empty">❌ خطأ: ${e.message}</div>`;
  } finally {
    $("search-loading").hidden = true;
  }
}

// ─── Live Search (fetch NEW products from TeePublic) ───
function bindLiveSearch() {
  $("btn-live-search").addEventListener("click", doLiveSearch);
  $("live-query").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLiveSearch();
  });
}

function showLiveStatus(html, isError = false) {
  const el = $("live-status");
  el.className = "live-status show" + (isError ? " error" : "");
  el.innerHTML = html;
}

function hideLiveStatus() {
  $("live-status").className = "live-status";
}

async function doLiveSearch() {
  const q = $("live-query").value.trim();
  if (!q) return;

  const grid = $("search-results");
  const btn = $("btn-live-search");
  btn.disabled = true;
  btn.textContent = "⏳ جارٍ الجلب...";
  grid.innerHTML = "";
  showLiveStatus(`🌐 جارٍ جلب تصاميم "<strong>${escapeHtml(q)}</strong>" من TeePublic... هذا قد يستغرق 30-60 ثانية.`);

  try {
    const url = `/api/live-search?q=${encodeURIComponent(q)}&max=15`;
    const r = await fetch(url);
    const d = await r.json();

    if (d.error) {
      showLiveStatus(`❌ خطأ: ${d.error}`, true);
      grid.innerHTML = `<div class="empty">❌ ${d.error}</div>`;
    } else if (d.count === 0 && d.fetched === 0) {
      showLiveStatus(`⚠️ ${d.message || "لا توجد نتائج من TeePublic"}`, true);
      grid.innerHTML = `<div class="empty">لم يتم العثور على تصاميم لـ "${escapeHtml(q)}" على TeePublic</div>`;
    } else if (d.new === 0) {
      showLiveStatus(`✅ جميع التصاميم موجودة مسبقاً (${d.skipped} تصميم). استخدم البحث المحلي لإيجادها.`);
      // Auto-run local search to show the existing ones
      $("text-query").value = q;
      doTextSearch();
    } else {
      showLiveStatus(`✅ ${d.message} — ${d.new} جديد، ${d.skipped} موجود مسبقاً`);
      renderLiveResults(grid, d.results, q);
    }
    // Refresh stats + status since we added new designs
    loadStats();
    checkStatus();
  } catch (e) {
    showLiveStatus(`❌ خطأ: ${e.message}`, true);
    grid.innerHTML = `<div class="empty">❌ خطأ: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "🚀 جلب جديد";
  }
}

function renderLiveResults(grid, results, heading) {
  if (!results || !results.length) {
    grid.innerHTML = `<div class="empty">لا توجد نتائج جديدة</div>`;
    return;
  }
  grid.innerHTML =
    `<div class="empty" style="padding:14px">🆕 ${results.length} تصميم جديد أُضيف من TeePublic لـ "<strong>${escapeHtml(heading)}</strong>"</div>` +
    results.map((item) => {
      const cat = item.category || "Uncertain";
      const catClass = "cat-" + cat.replace(/[^a-zA-Z]/g, (m) => (m === " " ? "\\ " : ""));
      const artist = item.artist && item.artist !== "Unknown" ? item.artist : "";
      return `
      <div class="card">
        <div class="card-img-wrap">
          <img src="/image/${encodeURIComponent(item.local_file)}" alt="${escapeHtml(item.product_name)}" loading="lazy">
          <span class="new-badge">🆕 جديد</span>
        </div>
        <div class="card-body">
          <div class="card-name">${escapeHtml(item.product_name)}</div>
          ${artist ? `<div class="card-artist">🎨 ${escapeHtml(artist)}</div>` : ""}
          <div class="card-footer">
            <span class="cat-badge ${catClass}">${cat}</span>
            ${item.price ? `<span class="price">${item.price}</span>` : ""}
          </div>
        </div>
        <a class="card-link" href="${item.product_url}" target="_blank" rel="noopener">عرض على TeePublic ↗</a>
      </div>`;
    }).join("");
}

// ─── Image Search ───
function bindImageSearch() {
  const dz = $("dropzone");
  const input = $("image-input");
  const btn = $("btn-image-search");

  dz.addEventListener("click", () => input.click());

  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  input.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  btn.addEventListener("click", doImageSearch);
}

function handleFile(file) {
  if (!file.type.startsWith("image/")) { alert("الرجاء اختيار صورة"); return; }
  uploadedFile = file;
  const prev = $("preview");
  prev.src = URL.createObjectURL(file);
  prev.hidden = false;
  document.querySelector(".dropzone-content").style.display = "none";
  $("btn-image-search").disabled = false;
}

async function doImageSearch() {
  if (!uploadedFile) return;
  const grid = $("search-results");
  const category = $("category-search").value;
  $("search-loading").hidden = false;
  grid.innerHTML = "";

  const fd = new FormData();
  fd.append("image", uploadedFile);
  fd.append("top_k", "12");
  fd.append("category", category);

  try {
    const r = await fetch("/api/search/image", { method: "POST", body: fd });
    const d = await r.json();
    renderResults(grid, d.results, `صورة: ${d.filename}`, d.error);
  } catch (e) {
    grid.innerHTML = `<div class="empty">❌ خطأ: ${e.message}</div>`;
  } finally {
    $("search-loading").hidden = true;
  }
}

// ─── Render results grid ───
function renderResults(grid, results, heading, error) {
  if (error) {
    grid.innerHTML = `<div class="empty">❌ ${error}</div>`;
    return;
  }
  if (!results || !results.length) {
    grid.innerHTML = `<div class="empty">لا توجد نتائج مطابقة</div>`;
    return;
  }

  const head = heading ? `<div class="empty" style="padding:14px">📌 ${results.length} نتيجة لـ "<strong>${heading}</strong>"</div>` : "";
  grid.innerHTML =
    head +
    results
      .map((item) => {
        const cat = item.category || "Uncertain";
        const catClass = "cat-" + cat.replace(/[^a-zA-Z]/g, (m, o) => (m === " " ? "\\ " : ""));
        const score = item.score != null ? `<span class="score-badge">${(item.score * 100).toFixed(0)}%</span>` : "";
        const artist = item.artist && item.artist !== "Unknown" ? item.artist : "";
        return `
        <div class="card">
          <div class="card-img-wrap">
            <img src="/image/${encodeURIComponent(item.local_file)}" alt="${escapeHtml(item.product_name)}" loading="lazy">
            ${score}
          </div>
          <div class="card-body">
            <div class="card-name">${escapeHtml(item.product_name)}</div>
            ${artist ? `<div class="card-artist">🎨 ${escapeHtml(artist)}</div>` : ""}
            <div class="card-footer">
              <span class="cat-badge ${catClass}">${cat}</span>
              ${item.price ? `<span class="price">${item.price}</span>` : ""}
            </div>
          </div>
          <a class="card-link" href="${item.product_url}" target="_blank" rel="noopener">عرض على TeePublic ↗</a>
        </div>`;
      })
      .join("");
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ─── Catalog ───
function bindCatalog() {
  $("category-catalog").addEventListener("change", () => {
    catalogPage = 1;
    loadCatalog();
  });
  $("pg-prev").addEventListener("click", () => {
    if (catalogPage > 1) { catalogPage--; loadCatalog(); }
  });
  $("pg-next").addEventListener("click", () => {
    if (catalogPage < catalogTotalPages) { catalogPage++; loadCatalog(); }
  });
}

async function loadCatalog() {
  const category = $("category-catalog").value;
  const grid = $("catalog-grid");
  grid.innerHTML = `<div class="empty">جارٍ التحميل…</div>`;

  try {
    const r = await fetch(`/api/catalog?page=${catalogPage}&per_page=24&category=${encodeURIComponent(category)}`);
    const d = await r.json();
    catalogTotalPages = d.total_pages || 1;
    $("catalog-info").textContent = `${d.total} تصميم`;
    $("pg-info").textContent = `صفحة ${d.page} من ${d.total_pages}`;
    $("pg-prev").disabled = d.page <= 1;
    $("pg-next").disabled = d.page >= d.total_pages;

    if (!d.items.length) {
      grid.innerHTML = `<div class="empty">لا توجد عناصر</div>`;
      return;
    }
    grid.innerHTML = d.items
      .map((item) => {
        const cat = item.predicted_category || "Uncertain";
        const catClass = "cat-" + cat.replace(/[^a-zA-Z]/g, (m, o) => (m === " " ? "\\ " : ""));
        const artist = item.artist && item.artist !== "Unknown" ? item.artist : "";
        return `
        <div class="card">
          <div class="card-img-wrap">
            <img src="/image/${encodeURIComponent(item.local_file)}" alt="${escapeHtml(item.product_name)}" loading="lazy">
          </div>
          <div class="card-body">
            <div class="card-name">${escapeHtml(item.product_name)}</div>
            ${artist ? `<div class="card-artist">🎨 ${escapeHtml(artist)}</div>` : ""}
            <div class="card-footer">
              <span class="cat-badge ${catClass}">${cat}</span>
              ${item.price ? `<span class="price">${item.price}</span>` : ""}
            </div>
          </div>
          <a class="card-link" href="${item.product_url}" target="_blank" rel="noopener">عرض على TeePublic ↗</a>
        </div>`;
      })
      .join("");
  } catch (e) {
    grid.innerHTML = `<div class="empty">❌ خطأ: ${e.message}</div>`;
  }
}

// ─── Stats ───
async function loadStats() {
  try {
    const r = await fetch("/api/stats");
    const d = await r.json();
    const max = Math.max(...d.distribution.map((x) => x.count));
    $("stat-total").textContent = d.total;
    $("stats-list").innerHTML = d.distribution
      .map((row) => {
        const pct = (row.count / max) * 100;
        const catClass = "cat-" + row.category.replace(/[^a-zA-Z]/g, (m, o) => (m === " " ? "\\ " : ""));
        return `
        <div class="stat-row">
          <span class="stat-label"><span class="cat-badge ${catClass}">${row.category}</span></span>
          <div class="stat-bar-wrap">
            <div class="stat-bar" style="width:${pct}%">${row.count}</div>
          </div>
          <span class="stat-count">${row.count}</span>
        </div>`;
      })
      .join("");
  } catch (e) {
    $("stats-list").innerHTML = `<div class="empty">❌ خطأ: ${e.message}</div>`;
  }
}
