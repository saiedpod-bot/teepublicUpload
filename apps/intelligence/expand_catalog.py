"""
Expand the catalog with new products from freshly-fetched category pages.
Deduplicates against existing metadata_v2.json using design_id.
Downloads images and ingests into Qdrant.
"""

import json
import os
import re
import time
from datetime import date
import requests
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from build_catalog import parse_rendered_page

# ─── Configuration ────────────────────────────────────────────────────────────
IMAGES_DIR = "./images_v2"
METADATA_FILE = "metadata_v2.json"
CATALOG_FILE = "catalog_data.json"
PAGES_DIR = "./pages"
COLLECTION_NAME = "tshirts"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
SOURCE_PLATFORM = "teepublic"
SCRAPE_DATE = date.today().isoformat()
DELAY = 0.3
TEST_MODE = False  # Set True for test of 10
TEST_LIMIT = 10

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.teepublic.com/",
}

os.makedirs(IMAGES_DIR, exist_ok=True)


def load_existing_ids():
    """Load existing design_ids from metadata to skip duplicates."""
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        return set(d.get("design_id", "") for d in metadata.values()), metadata
    return set(), {}


def clean_filename(name, idx, max_length=60):
    if not name:
        return f"product_{idx}"
    clean = re.sub(r'[^\w\s-]', '', name)
    clean = re.sub(r'\s+', '_', clean.strip())
    clean = clean[:max_length].lower()
    return f"{clean}_{idx}"


def construct_image_url(design_id, bg_color="2e2e2e"):
    return f"https://images.teepublic.com/derived/production/designs/{design_id}_0/1748016039/i_p:c_{bg_color},s_630,q_90.jpg"


def try_download(design_id, filename):
    bg_colors = ["2e2e2e", "ffffff", "191919", "eae0c7", "c0392b"]
    for bg in bg_colors:
        url = construct_image_url(design_id, bg)
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20, stream=True)
            if resp.status_code == 200:
                filepath = os.path.join(IMAGES_DIR, filename)
                with open(filepath, "wb") as f:
                    for chunk in resp.iter_content(8192):
                        f.write(chunk)
                return filepath, url
        except Exception:
            pass
    return None, None


def parse_all_new_pages(existing_ids):
    """Parse page files and return only new products (not in existing_ids)."""
    new_products = []
    seen_in_batch = set()

    for fname in sorted(os.listdir(PAGES_DIR)):
        if not fname.endswith(".txt"):
            continue
        category = fname.replace(".txt", "").replace("_", " ").title()
        filepath = os.path.join(PAGES_DIR, fname)

        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()
        products = parse_rendered_page(text, source_category=category)

        new_count = 0
        for p in products:
            did = p["design_id"]
            if did not in existing_ids and did not in seen_in_batch:
                seen_in_batch.add(did)
                new_products.append(p)
                new_count += 1

        print(f"  {fname}: {len(products)} total, {new_count} new")

    return new_products


def main():
    print("=" * 70)
    print("EXPAND CATALOG — Scrape New Products + Deduplicate")
    print(f"Date: {SCRAPE_DATE}")
    print("=" * 70)

    # Load existing data
    existing_ids, metadata = load_existing_ids()
    print(f"\n[1] Existing products: {len(metadata)} ({len(existing_ids)} unique design_ids)")

    # Parse new pages
    print(f"\n[2] Parsing page files for new products...")
    new_products = parse_all_new_pages(existing_ids)
    print(f"    → {len(new_products)} genuinely new products found")

    if TEST_MODE:
        new_products = new_products[:TEST_LIMIT]
        print(f"    TEST MODE: limiting to {TEST_LIMIT}")

    if not new_products:
        print("    No new products to add!")
        return

    # Download images
    print(f"\n[3] Downloading {len(new_products)} new product images...")
    next_idx = len(metadata) + 1
    downloaded = []
    skipped = 0

    for i, product in enumerate(new_products):
        filename = clean_filename(product["product_name"], next_idx + i) + ".jpg"
        filepath, image_url = try_download(product["design_id"], filename)

        if filepath:
            entry = {
                "product_name": product["product_name"],
                "artist": product.get("artist", "Unknown"),
                "price": product.get("price", "24"),
                "product_url": product["product_url"],
                "image_url": image_url,
                "design_id": product["design_id"],
                "source_platform": SOURCE_PLATFORM,
                "source_category": product.get("source_category", ""),
                "scrape_date": SCRAPE_DATE,
                "local_file": filename,
            }
            downloaded.append((filename, entry))
            print(f"  [{i+1:>3}/{len(new_products)}] {product['product_name'][:45]:<45} ✓")
        else:
            skipped += 1
            print(f"  [{i+1:>3}/{len(new_products)}] {product['product_name'][:45]:<45} ✗ 404")

        time.sleep(DELAY)

    print(f"    Downloaded: {len(downloaded)}, Failed: {skipped}")

    # Merge into metadata
    print(f"\n[4] Merging into metadata...")
    for filename, entry in downloaded:
        metadata[filename] = entry

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"    Metadata updated: {len(metadata)} total products")

    # Ingest new images into Qdrant
    print(f"\n[5] Generating CLIP embeddings for {len(downloaded)} new images...")
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()

    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # Get current max point ID
    info = client.get_collection(COLLECTION_NAME)
    current_count = info.points_count
    print(f"    Current Qdrant points: {current_count}")

    points = []
    for idx, (filename, entry) in enumerate(downloaded):
        filepath = os.path.join(IMAGES_DIR, filename)
        try:
            img = Image.open(filepath).convert("RGB")
            inputs = processor(images=img, return_tensors="pt")
            with torch.no_grad():
                vision_outputs = model.vision_model(pixel_values=inputs["pixel_values"])
                pooled = vision_outputs.pooler_output
                image_embeds = model.visual_projection(pooled)
            image_embeds = torch.nn.functional.normalize(image_embeds, p=2, dim=-1)
            embedding = image_embeds.squeeze().tolist()

            point = PointStruct(
                id=current_count + idx + 1,
                vector=embedding,
                payload={
                    "product_name": entry["product_name"],
                    "artist": entry["artist"],
                    "price": entry["price"],
                    "product_url": entry["product_url"],
                    "image_url": entry["image_url"],
                    "design_id": entry["design_id"],
                    "source_platform": entry["source_platform"],
                    "source_category": entry["source_category"],
                    "scrape_date": entry["scrape_date"],
                    "local_file": filename,
                },
            )
            points.append(point)
        except Exception as e:
            print(f"    ERROR embedding {filename}: {e}")

    if points:
        client.upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"    Upserted {len(points)} new points to Qdrant")

    # Verify
    info = client.get_collection(COLLECTION_NAME)
    print(f"    Qdrant total: {info.points_count} points")

    # Summary
    print(f"\n{'=' * 70}")
    print(f"SUMMARY")
    print(f"  New products added: {len(downloaded)}")
    print(f"  Duplicates skipped: {len(new_products) - len(downloaded) - skipped} (already in metadata)")
    print(f"  Download failures:  {skipped} (404)")
    print(f"  Total in metadata:  {len(metadata)}")
    print(f"  Total in Qdrant:    {info.points_count}")
    print(f"{'=' * 70}")

    # Show sample of new products
    print(f"\nSAMPLE — First 5 new products:")
    for fn, entry in downloaded[:5]:
        print(f"  • {entry['product_name'][:50]}")
        print(f"    Artist: {entry['artist']}, Category: {entry['source_category']}")


if __name__ == "__main__":
    main()
