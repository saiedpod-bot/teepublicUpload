"""
Build the product catalog by parsing rendered page content.
Processes multiple category page texts and deduplicates into catalog_data.json.
"""

import json
import re
import os

CATALOG_FILE = "catalog_data.json"


def parse_page(text, source_category="general"):
    """Parse products from rendered TeePublic category page text."""
    products = []
    seen_urls = set()
    lines = text.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Match product links - two patterns:
        # 1. [Product Name T-Shirt](url) 
        # 2. [Go to Product T-Shirt's page](url)
        product_name = None
        product_url = None
        design_id = None
        
        # Pattern 1: Direct link
        m = re.match(
            r'\[(.+?)\]\((https://www\.teepublic\.com/t-shirt/(\d+)-[^\)]+)\)',
            line
        )
        if m:
            product_name = m.group(1)
            product_url = m.group(2)
            design_id = m.group(3)
        
        # Pattern 2: "Go to" link
        if not m:
            m = re.match(
                r'\[Go to (.+?) T-Shirt\'?s?\s*(?:page)?\]\((https://www\.teepublic\.com/t-shirt/(\d+)-[^\)]+)\)',
                line
            )
            if m:
                product_name = m.group(1) + " T-Shirt"
                product_url = m.group(2)
                design_id = m.group(3)
        
        if product_name and product_url and design_id:
            # Skip if it's a navigation-only "Go to" without actual product content following
            # Real products have "by Artist" and "$XX" following them
            
            # Skip duplicates
            if product_url in seen_urls:
                i += 1
                continue
            
            # Clean up product name
            product_name = product_name.strip()
            if product_name.endswith("'s page"):
                product_name = product_name[:-7].strip()
            
            # Look for artist and price in next lines
            artist = ""
            price = ""
            for j in range(i + 1, min(i + 10, len(lines))):
                l = lines[j].strip()
                if l.startswith("by ") and not artist:
                    artist = l[3:].strip()
                    # Remove star ratings
                    artist = re.sub(r'\s*⭐+\s*$', '', artist)
                elif re.match(r'^\$\d+', l) and not price:
                    price_match = re.match(r'\$(\d+(?:\.\d+)?)', l)
                    if price_match:
                        price = price_match.group(1)
                        break
            
            # Only add if we found artist OR price (confirms it's a real product listing)
            if artist or price:
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


def build_catalog(page_texts):
    """
    Build catalog from multiple page texts.
    page_texts: list of (text_content, category_name) tuples
    """
    all_products = []
    seen_urls = set()
    
    for text, category in page_texts:
        products = parse_page(text, source_category=category)
        new_count = 0
        for p in products:
            if p["product_url"] not in seen_urls:
                seen_urls.add(p["product_url"])
                all_products.append(p)
                new_count += 1
        print(f"  {category}: {len(products)} parsed, {new_count} new unique")
    
    print(f"\n  TOTAL: {len(all_products)} unique products")
    
    with open(CATALOG_FILE, "w", encoding="utf-8") as f:
        json.dump(all_products, f, indent=2, ensure_ascii=False)
    
    return all_products


if __name__ == "__main__":
    # Load page files from pages/ directory
    pages_dir = "./pages"
    page_texts = []
    
    if os.path.exists(pages_dir):
        for fname in sorted(os.listdir(pages_dir)):
            if fname.endswith(".txt"):
                category = fname.replace(".txt", "").replace("_", " ").title()
                with open(os.path.join(pages_dir, fname), "r", encoding="utf-8") as f:
                    page_texts.append((f.read(), category))
    
    if page_texts:
        build_catalog(page_texts)
    else:
        print("No page files found in pages/ directory")
