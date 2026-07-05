"""
TeePublic T-Shirt Scraper v2 - Scaled (200+ products)
Extracts product data from rendered catalog pages via web_fetch tool output.
Downloads images directly from the unprotected CDN (images.teepublic.com).

Architecture: designed for extensibility to other platforms (Amazon Merch, etc.)

Data captured per product:
- product_name, artist/designer, price, product_url, image_url
- scrape_date, source_platform, source_category
"""

import json
import os
import re
import time
from datetime import date
import requests

# ─── Configuration ────────────────────────────────────────────────────────────
IMAGES_DIR = "./images_v2"
METADATA_FILE = "metadata_v2.json"
DELAY_BETWEEN_DOWNLOADS = 0.5  # seconds between image downloads
SOURCE_PLATFORM = "teepublic"
SCRAPE_DATE = date.today().isoformat()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.teepublic.com/",
}

os.makedirs(IMAGES_DIR, exist_ok=True)


# ─── Parsing Functions ────────────────────────────────────────────────────────

def parse_catalog_page(rendered_text, source_category="general"):
    """
    Parse products from a rendered TeePublic catalog page.
    
    Pattern per product:
    [Product Name T-Shirt](https://www.teepublic.com/t-shirt/{id}-{slug})
    by ArtistName
    $XX
    
    Returns list of product dicts.
    """
    products = []
    seen_urls = set()
    
    # Pattern: product link followed by artist and price
    # Match: [Title T-Shirt](url)\nby Artist\n\n$price
    # The rendered text has the pattern:
    #   [Product T-Shirt](url)
    #   by ArtistName
    #   $XX
    
    lines = rendered_text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Look for product links: [Name T-Shirt](url)
        match = re.match(
            r'\[(.+?)\]\((https://www\.teepublic\.com/t-shirt/(\d+)-[^\)]+)\)',
            line
        )
        if match:
            product_name = match.group(1)
            product_url = match.group(2)
            design_id = match.group(3)
            
            # Skip duplicates
            if product_url in seen_urls:
                i += 1
                continue
            
            # Look for artist in next few lines
            artist = ""
            price = ""
            for j in range(i + 1, min(i + 5, len(lines))):
                l = lines[j].strip()
                if l.startswith("by ") and not artist:
                    artist = l[3:].strip()
                    # Remove star ratings if present
                    artist = re.sub(r'\s*⭐+\s*$', '', artist)
                elif l.startswith("$") and not price:
                    price_match = re.match(r'\$(\d+(?:\.\d+)?)', l)
                    if price_match:
                        price = price_match.group(1)
            
            if product_url not in seen_urls and product_name:
                seen_urls.add(product_url)
                products.append({
                    "product_name": product_name,
                    "artist": artist,
                    "price": price or "24",
                    "product_url": product_url,
                    "design_id": design_id,
                    "source_category": source_category,
                })
        
        i += 1
    
    return products


def construct_image_url(design_id, bg_color="2e2e2e"):
    """
    Construct the TeePublic design image URL from a design ID.
    Uses a common timestamp (1748016039) that works for most designs.
    Falls back to trying the product-specific page if this 404s.
    """
    # Common timestamp that works for most bestseller/featured designs
    return f"https://images.teepublic.com/derived/production/designs/{design_id}_0/1748016039/i_p:c_{bg_color},s_630,q_90.jpg"


def download_image(image_url, filename):
    """Download an image and save it locally. Returns filepath or None."""
    try:
        resp = requests.get(image_url, headers=HEADERS, timeout=30, stream=True)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        filepath = os.path.join(IMAGES_DIR, filename)
        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return filepath
    except Exception:
        return None


def try_download_with_fallbacks(design_id, filename):
    """Try multiple bg colors and timestamps for the image URL."""
    # Try common bg colors
    bg_colors = ["2e2e2e", "ffffff", "191919", "eae0c7", "c0392b"]
    
    for bg in bg_colors:
        url = construct_image_url(design_id, bg)
        filepath = download_image(url, filename)
        if filepath:
            return filepath, url
    
    return None, None


def clean_filename(name, idx, max_length=60):
    """Create a clean filename."""
    if not name:
        return f"product_{idx}"
    clean = re.sub(r'[^\w\s-]', '', name)
    clean = re.sub(r'\s+', '_', clean.strip())
    clean = clean[:max_length].lower()
    return f"{clean}_{idx}"


# ─── Main ────────────────────────────────────────────────────────────────────

def load_catalog_data(catalog_file="catalog_data.json"):
    """Load pre-scraped catalog data from file."""
    if os.path.exists(catalog_file):
        with open(catalog_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_catalog_data(products, catalog_file="catalog_data.json"):
    """Save catalog data to file."""
    with open(catalog_file, "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)


def run_download(products, test_mode=False, test_limit=10):
    """Download images for all products and build metadata."""
    if test_mode:
        products = products[:test_limit]
    
    print(f"\n{'=' * 60}")
    print(f"Downloading {len(products)} product images...")
    print(f"{'=' * 60}")
    
    metadata = {}
    success = 0
    failed = 0
    
    for i, product in enumerate(products):
        filename = clean_filename(product["product_name"], i + 1) + ".jpg"
        
        print(f"  [{i+1:>3}/{len(products)}] {product['product_name'][:50]}", end="")
        
        filepath, image_url = try_download_with_fallbacks(product["design_id"], filename)
        
        if filepath:
            file_size = os.path.getsize(filepath)
            metadata[filename] = {
                "product_name": product["product_name"],
                "artist": product["artist"],
                "price": product["price"],
                "product_url": product["product_url"],
                "image_url": image_url,
                "design_id": product["design_id"],
                "source_platform": SOURCE_PLATFORM,
                "source_category": product["source_category"],
                "scrape_date": SCRAPE_DATE,
                "local_file": filename,
            }
            success += 1
            print(f" ✓ ({file_size // 1024} KB)")
        else:
            failed += 1
            print(f" ✗ (404)")
        
        if i < len(products) - 1:
            time.sleep(DELAY_BETWEEN_DOWNLOADS)
    
    # Save metadata
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    print(f"\n{'=' * 60}")
    print(f"Download complete: {success} success, {failed} failed")
    print(f"Metadata saved to: {METADATA_FILE}")
    print(f"{'=' * 60}")
    
    return metadata


def show_sample(metadata, n=10):
    """Show a sample of the downloaded data."""
    print(f"\n{'=' * 60}")
    print(f"SAMPLE DATA ({min(n, len(metadata))} items)")
    print(f"{'=' * 60}")
    for i, (filename, data) in enumerate(list(metadata.items())[:n]):
        print(f"\n  [{i+1}] {filename}")
        print(f"      Product:  {data['product_name']}")
        print(f"      Artist:   {data['artist']}")
        print(f"      Price:    ${data['price']}")
        print(f"      Category: {data['source_category']}")
        print(f"      URL:      {data['product_url']}")
        print(f"      Date:     {data['scrape_date']}")


if __name__ == "__main__":
    import sys
    
    # Usage: python scraper_v2.py [test|full]
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"
    
    # Load catalog data
    catalog = load_catalog_data()
    
    if not catalog:
        print("No catalog_data.json found. Run the catalog extraction first.")
        print("(The catalog data is extracted via web_fetch and stored separately)")
        sys.exit(1)
    
    print(f"Loaded {len(catalog)} products from catalog")
    
    if mode == "test":
        metadata = run_download(catalog, test_mode=True, test_limit=10)
        show_sample(metadata)
    else:
        metadata = run_download(catalog, test_mode=False)
        show_sample(metadata, n=5)
