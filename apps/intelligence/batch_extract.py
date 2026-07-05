"""
Batch extract: parses page content files and builds the catalog.
Saves all pages to pages/ dir, then processes them.
"""
import json
import os
import re
from build_catalog import parse_rendered_page, load_existing_catalog, merge_products, save_catalog


def process_page_file(filepath, category):
    """Process a single page file."""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()
    products = parse_rendered_page(text, source_category=category)
    return products


def build_full_catalog():
    """Process all page files in pages/ directory."""
    pages_dir = "./pages"
    if not os.path.exists(pages_dir):
        print("No pages/ directory found. Save page content there first.")
        return
    
    all_products = []
    seen_urls = set()
    
    for fname in sorted(os.listdir(pages_dir)):
        if fname.endswith(".txt"):
            category = fname.replace(".txt", "").replace("_", " ").title()
            filepath = os.path.join(pages_dir, fname)
            products = process_page_file(filepath, category)
            
            # Deduplicate
            new_count = 0
            for p in products:
                if p["product_url"] not in seen_urls:
                    seen_urls.add(p["product_url"])
                    all_products.append(p)
                    new_count += 1
            
            print(f"  {fname}: {len(products)} found, {new_count} new → total: {len(all_products)}")
    
    save_catalog(all_products)
    return all_products


if __name__ == "__main__":
    build_full_catalog()
