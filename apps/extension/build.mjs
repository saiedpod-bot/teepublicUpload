// Tiny build script: esbuild bundles TS entries, copy static manifest + HTML.
// `node build.mjs` for one-shot, `node build.mjs --watch` for dev.

import { build, context } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "src");
const DIST = path.join(__dirname, "dist");
const STATIC_DIRS = ["popup", "queue"]; // dirs that contain HTML + CSS to copy
const watch = process.argv.includes("--watch");

const entries = {
  "background/index":    path.join(SRC, "background/index.ts"),
  "content/teepublic":   path.join(SRC, "content/teepublic.ts"),
  "popup/main":          path.join(SRC, "popup/main.ts"),
  "queue/main":          path.join(SRC, "queue/main.ts"),
};

const sharedOpts = {
  entryPoints: entries,
  outdir: DIST,
  bundle: true,
  format: "esm",
  target: ["chrome120"],
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
};

async function copyStatic() {
  await fs.mkdir(DIST, { recursive: true });
  await fs.copyFile(path.join(__dirname, "manifest.json"), path.join(DIST, "manifest.json"));
  for (const dir of STATIC_DIRS) {
    const from = path.join(SRC, dir);
    const to = path.join(DIST, dir);
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from)) {
      if (entry.endsWith(".html") || entry.endsWith(".css")) {
        await fs.copyFile(path.join(from, entry), path.join(to, entry));
      }
    }
  }
  // Icons
  const iconsFrom = path.join(SRC, "icons");
  if (await exists(iconsFrom)) {
    const iconsTo = path.join(DIST, "icons");
    await fs.mkdir(iconsTo, { recursive: true });
    for (const entry of await fs.readdir(iconsFrom)) {
      await fs.copyFile(path.join(iconsFrom, entry), path.join(iconsTo, entry));
    }
  }
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

if (watch) {
  const ctx = await context(sharedOpts);
  await ctx.watch();
  await copyStatic();
  console.log("[extension] watching for changes");
  chokidar.watch([
    path.join(__dirname, "manifest.json"),
    path.join(SRC, "**/*.{html,css}"),
    path.join(SRC, "icons/**/*"),
  ]).on("change", async () => {
    await copyStatic();
    console.log("[extension] static assets refreshed");
  });
} else {
  await build(sharedOpts);
  await copyStatic();
  console.log("[extension] built ->", DIST);
}
