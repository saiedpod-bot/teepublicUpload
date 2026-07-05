"""
Build catalog_data.json by parsing pre-fetched rendered page content.
This script processes the text content saved from web_fetch calls.
Run once to build the catalog, then use scraper_v2.py to download images.
"""

import json
import re
import os

CATALOG_FILE = "catalog_data.json"


def parse_rendered_page(text, source_category="general"):
    """Parse products from rendered TeePublic page text."""
    products = []
    seen_urls = set()
    
    lines = text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Look for product links matching TeePublic t-shirt URL pattern
        match = re.match(
            r'\[(.+?T-Shirt.*?)\]\((https://www\.teepublic\.com/t-shirt/(\d+)-[^\)]+)\)',
            line
        )
        if not match:
            # Also try "Go to X T-Shirt's page" pattern
            match = re.match(
                r'\[Go to (.+?) T-Shirt\'?s? page\]\((https://www\.teepublic\.com/t-shirt/(\d+)-[^\)]+)\)',
                line
            )
        
        if match:
            product_name = match.group(1)
            product_url = match.group(2)
            design_id = match.group(3)
            
            # Clean up product name
            if product_name.startswith("Go to "):
                product_name = product_name[6:]
            if product_name.endswith("'s page"):
                product_name = product_name[:-7]
            if not product_name.endswith("T-Shirt"):
                product_name = product_name + " T-Shirt"
            
            # Skip duplicates
            if product_url in seen_urls:
                i += 1
                continue
            
            # Look for artist and price in next lines
            artist = ""
            price = ""
            for j in range(i + 1, min(i + 8, len(lines))):
                l = lines[j].strip()
                if l.startswith("by ") and not artist:
                    artist = l[3:].strip()
                    artist = re.sub(r'\s*⭐+\s*$', '', artist)
                elif l.startswith("$") and not price:
                    price_match = re.match(r'\$(\d+(?:\.\d+)?)', l)
                    if price_match:
                        price = price_match.group(1)
                        break
            
            if product_url not in seen_urls:
                seen_urls.add(product_url)
                products.append({
                    "product_name": product_name,
                    "artist": artist if artist else "Unknown",
                    "price": price if price else "24",
                    "product_url": product_url,
                    "design_id": design_id,
                    "source_category": source_category,
                })
        
        i += 1
    
    return products


def load_existing_catalog():
    """Load existing catalog if it exists."""
    if os.path.exists(CATALOG_FILE):
        with open(CATALOG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def merge_products(existing, new_products):
    """Merge new products into existing, deduplicating by URL."""
    seen = {p["product_url"] for p in existing}
    merged = list(existing)
    added = 0
    for p in new_products:
        if p["product_url"] not in seen:
            seen.add(p["product_url"])
            merged.append(p)
            added += 1
    return merged, added


def save_catalog(products):
    """Save catalog to JSON."""
    with open(CATALOG_FILE, "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)
    print(f"Catalog saved: {len(products)} products → {CATALOG_FILE}")


if __name__ == "__main__":
    # This file is designed to be imported and called with page content
    # from the web_fetch tool output
    catalog = load_existing_catalog()
    print(f"Existing catalog: {len(catalog)} products")
