"""
Live Scraper for TeePublic — fetches fresh products from search/category pages.

Strategy:
- Uses Jina Reader API (r.jina.ai) to bypass Cloudflare and get rendered Markdown.
- Extracts product data (name, design_id, artist, price, product_url).
- Downloads images from the open CDN (images.teepublic.com).

URL patterns:
- Search:   https://www.teepublic.com/t-shirts?q={query}
- Category: https://www.teepublic.com/t-shirts/{slug}
- CDN image: https://images.teepublic.com/derived/production/designs/{id}_0/{ts}/i_p:c_{bg},s_630,q_90.jpg
"""

import json
import os
import re
import requests

# ─── Configuration ────────────────────────────────────────────────────────────
IMAGES_DIR = "./images_v2"
CDN_BG_COLORS = ["2e2e2e", "ffffff", "191919", "eae0c7"]
CDN_TIMESTAMP = "1748016039"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://www.teepublic.com/",
}
JINA_READER_BASE = "https://r.jina.ai/"


def construct_image_url(design_id, bg_color="2e2e2e"):
    """Construct CDN image URL from design ID (the clean design artwork)."""
    return (
        f"https://images.teepublic.com/derived/production/designs/"
        f"{design_id}_0/{CDN_TIMESTAMP}/i_p:c_{bg_color},s_630,q_90.jpg"
    )


def download_image(design_id, filename):
    """Download product image from CDN with fallback bg colors. Returns filepath or None."""
    os.makedirs(IMAGES_DIR, exist_ok=True)
    filepath = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(filepath):
        return filepath

    for bg in CDN_BG_COLORS:
        url = construct_image_url(design_id, bg)
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20, stream=True)
            if resp.status_code == 404:
                continue
            resp.raise_for_status()
            with open(filepath, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            return filepath
        except Exception:
            continue
    return None


def parse_markdown_products(markdown_text):
    """Parse Jina Reader Markdown output to extract products.

    The Markdown structure per product is:
        [![Image N: Product Name T-Shirt](https://images.teepublic.com/.../designs/{ID}_.../...)]
        (https://www.teepublic.com/t-shirt/{ID}-{slug} "Title")
        ...
        ## Product Name T-Shirt
        by ArtistName
        $sale $full
    """
    products = []
    seen_ids = set()

    # Pattern: image link containing a design_id, wrapped in a link to the product page.
    # Markdown: [![alt](design_image_url)](product_url "title")
    # design_image_url has the form: .../designs/{ID}_{variant}/{ts}/i_m:...
    card_pattern = re.compile(
        r'\[!\[([^\]]*)\]\((https://images\.teepublic\.com/[^)]*?/designs/(\d+)_[^)]+)\)'
        r'\]\((https://www\.teepublic\.com/t-shirt/(\d+)-[^)\s]+)(?:\s+"[^"]*")?\)'
    )

    for match in card_pattern.finditer(markdown_text):
        alt_text = match.group(1).strip()
        design_image_url = match.group(2)
        design_id = match.group(3)
        product_url = match.group(4)

        if design_id in seen_ids:
            continue
        seen_ids.add(design_id)

        # Extract context AFTER this match (up to next product card) for artist + price
        start = match.end()
        next_match = card_pattern.search(markdown_text, start)
        end = next_match.start() if next_match else min(start + 800, len(markdown_text))
        block = markdown_text[start:end]

        # Product name: prefer the heading "## Name" in the block, fall back to alt text
        name = alt_text.replace("Image", "").strip(": ").strip()
        # Strip stray markdown/bracket chars from alt text
        name = re.sub(r'^\[+\s*', '', name).strip()
        heading_match = re.search(r'##\s*(.+?T-Shirt)', block)
        if heading_match:
            name = heading_match.group(1).strip()

        # Artist: "by ArtistName" on its own line
        artist = "Unknown"
        artist_match = re.search(r'^by\s+(.+?)$', block, re.MULTILINE)
        if artist_match:
            artist = artist_match.group(1).strip()
            artist = re.sub(r'\s*⭐+\s*$', '', artist)

        # Price: "$sale $full" (e.g. "$16 $24") → take the FULL price (second).
        # TeePublic shows sale price first, then original. We want the original.
        price = "24"
        price_match = re.search(r'\$(\d+(?:\.\d+)?)\s+\$(\d+(?:\.\d+)?)', block)
        if price_match:
            price = price_match.group(2)
        elif re.search(r'\$(\d+)', block):
            price = re.search(r'\$(\d+)', block).group(1)

        products.append({
            "product_name": name,
            "artist": artist,
            "price": price,
            "product_url": product_url,
            "design_id": design_id,
            "cdn_image_url": design_image_url,
        })

    return products


def fetch_from_teepublic(slug_or_query, max_results=20, is_search=False):
    """Fetch products from TeePublic via Jina Reader.

    Args:
        slug_or_query: e.g. "bigfoot" or "funny cat"
        is_search: if True, use ?q= search URL; else use category URL
    Returns list of product dicts.
    """
    if is_search:
        target_url = f"https://www.teepublic.com/t-shirts?q={requests.utils.quote(slug_or_query)}"
    else:
        target_url = f"https://www.teepublic.com/t-shirts/{slug_or_query.lower().replace(' ', '-')}"

    reader_url = JINA_READER_BASE + target_url

    try:
        resp = requests.get(
            reader_url,
            headers={
                "Accept": "application/json",
                "X-Return-Format": "markdown",
                "X-With-Images-Summary": "true",
            },
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"    [fetch] Jina returned {resp.status_code}")
            return []

        data = resp.json()
        markdown = data.get("data", {}).get("content", "")
        if not markdown:
            print("    [fetch] Empty content from Jina")
            return []

        products = parse_markdown_products(markdown)
        # Fallback: if category page didn't yield products, try the search endpoint
        if not products and not is_search:
            print(f"    [fetch] No products from category, trying search...")
            return fetch_from_teepublic(slug_or_query, max_results, is_search=True)

        return products[:max_results]

    except Exception as e:
        print(f"    [fetch] Error: {e}")
        return []


def clean_filename(name, design_id, max_length=50):
    """Create a safe filename for a live-scraped product."""
    clean = re.sub(r'[^\w\s-]', '', name)
    clean = re.sub(r'\s+', '_', clean.strip())
    clean = clean[:max_length].lower()
    return f"live_{clean}_{design_id}.jpg"


# ─── Quick test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    query = "bigfoot"
    print(f"Fetching TeePublic products for: {query}")
    print("=" * 60)

    products = fetch_from_teepublic(query, max_results=8)

    print(f"\nFound {len(products)} products:\n")
    for i, p in enumerate(products):
        print(f"  [{i+1}] {p['product_name']}")
        print(f"      Artist: {p['artist']}  |  Price: ${p['price']}  |  ID: {p['design_id']}")
        print(f"      URL: {p['product_url']}")

    # Test image download for first 2
    if products:
        print("\n" + "=" * 60)
        print("Testing image downloads...")
        for p in products[:2]:
            fname = clean_filename(p["product_name"], p["design_id"])
            fp = download_image(p["design_id"], fname)
            if fp:
                size = os.path.getsize(fp)
                print(f"  ✅ {fname} ({size // 1024} KB)")
            else:
                print(f"  ❌ Failed: {p['design_id']}")
