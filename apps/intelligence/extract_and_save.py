"""
Parse rendered page content and add to catalog.
Usage: python extract_and_save.py <page_file.txt> <category_name>
Or: imported and called directly with text content.
"""
import sys
import json
from build_catalog import parse_rendered_page, load_existing_catalog, merge_products, save_catalog

def add_page_content(text, category):
    """Parse a rendered page and add to catalog."""
    catalog = load_existing_catalog()
    new_products = parse_rendered_page(text, source_category=category)
    print(f"  Parsed {len(new_products)} products from '{category}' page")
    merged, added = merge_products(catalog, new_products)
    print(f"  Added {added} new (deduplicated)")
    save_catalog(merged)
    return added

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python extract_and_save.py <page_file.txt> <category>")
        sys.exit(1)
    
    page_file = sys.argv[1]
    category = sys.argv[2]
    
    with open(page_file, "r", encoding="utf-8") as f:
        text = f.read()
    
    add_page_content(text, category)
