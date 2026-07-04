# 🧩 TeePublic Uploader

**رفع وتحميل جماعي لتصاميم TeePublic مع الذكاء الاصطناعي**  
AI-powered batch upload manager for [TeePublic](https://www.teepublic.com) — from images to published listings automatically.

![Architecture](screenshots/architecture.svg)

---

## 📋 Overview | نظرة عامة

This project automates the entire workflow of uploading designs to TeePublic:

| Step | Description |
|:----:|-------------|
| **①** | Drop your PNG designs |
| **②** | Gemini AI generates title, description & tags from each image |
| **③** | Chrome extension uploads & publishes on TeePublic automatically |
| **④** | Randomized delays (8-18s) between uploads to avoid detection |

---

## 📸 Screenshots | صور الواجهة

### Dashboard Interface | واجهة التحكم
![Dashboard](screenshots/dashboard.svg)
*Main dashboard at localhost:3030 — drop images, AI generates, send to extension*

### Extension Popup | نافذة الإضافة
![Extension](screenshots/extension.svg)
*Chrome extension showing queue progress, retries, and publish status*

### Workflow | سير العمل
![Workflow](screenshots/workflow.svg)
*Complete 6-step automated workflow from images to published listings*

---

## 🚀 Quick Start | البداية السريعة

### Prerequisites | المتطلبات

- Node.js 20+
- pnpm 9+
- Chrome browser
- TeePublic account(s)
- Gemini API key ([get free](https://aistudio.google.com/apikey))

### 1️⃣ Install & Run | التثبيت والتشغيل

```bash
# Install dependencies
pnpm install

# Build the extension
pnpm build:extension

# Start the dashboard (http://localhost:3030)
pnpm dev:dashboard
```

### 2️⃣ Load Extension in Chrome | تحميل الإضافة

1. Open **chrome://extensions**
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked** → select `apps/extension/dist`
4. Copy the **Extension ID** shown on the card

### 3️⃣ Use It | الاستخدام

![Step-by-step](screenshots/workflow.svg)

| Step | Action | Details |
|:----:|--------|---------|
| **1** | **Get API key** | Get free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — use **AI Studio key** (not Google Cloud Console) |
| **2** | **Open dashboard** | Go to `http://localhost:3030`, paste extension ID |
| **3** | **Drop images** | Drag & drop all `.png` files from your design folder |
| **4** | **AI generates** | Gemini automatically creates title, description, tags for each image |
| **5** | **Review (optional)** | Edit metadata, colors, products per design |
| **6** | **Send to extension** | Click "Send to extension" — queue is transferred |
| **7** | **Auto-publish** | Extension opens TeePublic, uploads artwork, fills fields, clicks Publish |

---

## 📁 Project Structure | هيكل المشروع

```
teepublic-uploader/
├── apps/
│   ├── dashboard/          Next.js 15 + React 19 + Tailwind — UI at localhost:3030
│   │   ├── components/     GenerationApp, Dropzone, DesignConfigCard, ColorsEditor
│   │   ├── lib/
│   │   │   ├── gemini.ts   Gemini API client — image→listing generation
│   │   │   ├── aiSettings.ts  localStorage for API key, model, prompt
│   │   │   └── bridge.ts   Chrome extension messaging
│   │   └── middleware.ts   Supabase session gate (bypassed locally)
│   └── extension/          MV3 Chrome extension — queue processing + TeePublic automation
│       ├── src/
│       │   ├── content/    teepublic.ts — upload, fill, publish automation
│       │   ├── lib/        dom.ts (React-aware form fillers), selectors.ts
│       │   └── services/   automationEngine.ts, queueStore.ts
│       └── manifest.json
├── packages/shared/        Shared types + wire protocol (DesignMetadata, QueueBatch)
├── standalone/             Simple Node.js server (no pnpm needed)
│   ├── server.js           HTTP server on port 3031
│   └── index.html          Uploader UI — CSV + PNG + extension bridge
├── screenshots/            SVG illustrations of the system
├── designs_metadata.csv    Sample metadata for 49 designs
└── README.md               This file
```

---

## 🧠 AI Metadata Generation | توليد البيانات بالذكاء الاصطناعي

The dashboard uses **Gemini 2.5 Flash-Lite** to generate complete listings:

- **Title**: 30-70 chars, marketable and specific
- **Description**: 2-3 sentences, customer-facing
- **Primary Tag**: Single most relevant tag
- **Supporting Tags**: Exactly 8 tags, 1-3 words each
- **Mature Content**: Auto-detected

**Leave the prompt empty** — Gemini derives everything from the image automatically.

---

## 🔧 Standalone Mode (No Dashboard) | وضع مستقل بدون لوحة التحكم

If you don't want to run Next.js/Supabase:

```bash
node "standalone/server.js"
```

Then open `http://localhost:3031` — upload CSV + PNGs, the page bridges directly to the extension.

---

## ⚙️ Configuration | الإعدادات

| Setting | Default | Description |
|---------|---------|-------------|
| `betweenItemsMinMs` | 8,000 | Min delay between uploads (ms) |
| `betweenItemsMaxMs` | 18,000 | Max delay between uploads (ms) |
| `retryMax` | 2 | Max retries per failed design |

Edit in `apps/extension/src/services/queueStore.ts`.

---

## 📝 Notes | ملاحظات

- **Use AI Studio API keys**, not Google Cloud Console keys (AI Studio keys work immediately)
- Each design is uploaded to a **separate TeePublic account**
- Each account can only have **one draft at a time**
- Login uses `form.requestSubmit(btn)` — standard `click()` is unreliable
- All processing is **local** — no data leaves your machine except to Gemini API and TeePublic

---

## 📄 License | الترخيص

MIT — Free to use, modify, and distribute.
