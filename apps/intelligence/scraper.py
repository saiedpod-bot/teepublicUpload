"""
TeePublic T-Shirt Scraper
Uses pre-extracted product data from the catalog page (Cloudflare blocks automated HTTP).
Images are downloaded directly from the CDN (images.teepublic.com) which has no protection.

The product data was extracted from the rendered https://www.teepublic.com/t-shirts page.
Image URL pattern: https://images.teepublic.com/derived/production/designs/{id}_0/{ts}/i_p:c_{bg},wmk,s_630,q_90.jpg
"""

import json
import os
import re
import time
import requests

# Configuration
IMAGES_DIR = "./images"
METADATA_FILE = "metadata.json"
DELAY_BETWEEN_DOWNLOADS = 1  # polite delay
TEST_MODE = False  # Set to False for full scrape
TEST_LIMIT = 5

os.makedirs(IMAGES_DIR, exist_ok=True)

# Product data extracted from the rendered TeePublic catalog page
# Each entry: (product_name, price, product_url, image_url)
# Image URLs from the product detail pages (design artwork, not t-shirt mockup)
PRODUCTS = [
    {
        "product_name": "Toonces Driving School - Est. 1989 T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/76463312-toonces-driving-school-est-1989",
        "image_url": "https://images.teepublic.com/derived/production/designs/76463312_0/1750239055/i_p:c_eae0c7,wmk,s_630,q_90.jpg"
    },
    {
        "product_name": "nwo squads war T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/68618277-nwo-squads-war",
        "image_url": "https://images.teepublic.com/derived/production/designs/68618277_0/1732050747/i_p:c_191919,s_630,q_90.jpg"
    },
    {
        "product_name": "Illinois Illini Final four 2026 Men's March Madness Basketball T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/89804723-illinois-illini-final-four-2026-mens-march-madness",
        "image_url": "https://images.teepublic.com/derived/production/designs/89804723_0/1741371891/i_p:c_ffffff,s_630,q_90.jpg"
    },
    {
        "product_name": "Michigan Wolverines 2026 National Champions Basketball T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/88376743-michigan-wolverines-2026-national-champions-basket",
        "image_url": "https://images.teepublic.com/derived/production/designs/88376743_0/1739815044/i_p:c_ffffff,s_630,q_90.jpg"
    },
    {
        "product_name": "Graduation-2026 T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/67119572-graduation-2026",
        "image_url": "https://images.teepublic.com/derived/production/designs/67119572_0/1730069990/i_p:c_ffffff,s_630,q_90.jpg"
    },
    {
        "product_name": "Green Dragon Lager T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/93572-green-dragon-lager",
        "image_url": "https://images.teepublic.com/derived/production/designs/93572_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Caucasians T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/12220945-caucasians",
        "image_url": "https://images.teepublic.com/derived/production/designs/12220945_0/1748016039/i_p:c_c0392b,s_630,q_90.jpg"
    },
    {
        "product_name": "ADHD T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/17638145-adhd",
        "image_url": "https://images.teepublic.com/derived/production/designs/17638145_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Hang In There It Gets Worse T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/61570501-hang-in-there-it-gets-worse",
        "image_url": "https://images.teepublic.com/derived/production/designs/61570501_0/1748016039/i_p:c_ffffff,s_630,q_90.jpg"
    },
    {
        "product_name": "Peaches Records & Tapes 1975 T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/34946205-peaches-records-and-tapes-1975",
        "image_url": "https://images.teepublic.com/derived/production/designs/34946205_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Marshall Amplification T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/86174334-marshall-amplification",
        "image_url": "https://images.teepublic.com/derived/production/designs/86174334_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Evil Empire T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/65597387-evil-empire",
        "image_url": "https://images.teepublic.com/derived/production/designs/65597387_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "David Byrne Vintage T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/81113319-david-byrne-vintage",
        "image_url": "https://images.teepublic.com/derived/production/designs/81113319_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "FEARLESS - Kobe Bryant - Mamba Mentality T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/88664030-fearless-kobe-bryant-mamba-mentality",
        "image_url": "https://images.teepublic.com/derived/production/designs/88664030_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Peanuts Greatest Hits T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/82321511-peanuts-greatest-hits-rockin-out-to-linus-and-lucy",
        "image_url": "https://images.teepublic.com/derived/production/designs/82321511_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Tiger Woods JUST DUI IT T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/89874662-tiger-woods-just-dui-it",
        "image_url": "https://images.teepublic.com/derived/production/designs/89874662_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Lee Ho Fooks Chinese Restaurant T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/33592838-lee-ho-fooks-chinese-restaurant",
        "image_url": "https://images.teepublic.com/derived/production/designs/33592838_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Visit Arrakis - Vintage Distressed Surf - Dune - Sci Fi T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/4742645-visit-arrakis-vintage-distressed-surf-dune-sci-fi",
        "image_url": "https://images.teepublic.com/derived/production/designs/4742645_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Kermit The Frog T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/13396734-kermit-the-frog",
        "image_url": "https://images.teepublic.com/derived/production/designs/13396734_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Fall Guy Stuntman Association Vintage T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/2125612-fall-guy-stuntman-association-vintage",
        "image_url": "https://images.teepublic.com/derived/production/designs/2125612_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "The Great Dream Wave Shirt T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/6579964-the-great-dream-wave-shirt",
        "image_url": "https://images.teepublic.com/derived/production/designs/6579964_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Mountain Sunset T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/2021946-mountain-sunset",
        "image_url": "https://images.teepublic.com/derived/production/designs/2021946_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Binford Tools T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/2833712-binford-tools",
        "image_url": "https://images.teepublic.com/derived/production/designs/2833712_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "JORDAN AIR T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/76377399-jordan-air",
        "image_url": "https://images.teepublic.com/derived/production/designs/76377399_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Heart Baseball T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/3540483-heart-baseball",
        "image_url": "https://images.teepublic.com/derived/production/designs/3540483_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "I am Homunculus T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/1513847-i-am-homunculus",
        "image_url": "https://images.teepublic.com/derived/production/designs/1513847_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "We Can Do It (Furiously) T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/206159-we-can-do-it-furiously",
        "image_url": "https://images.teepublic.com/derived/production/designs/206159_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Sanctuary Moon T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/52692212-sanctuary-moon",
        "image_url": "https://images.teepublic.com/derived/production/designs/52692212_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Weyland Yutani Corp T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/61172015-weyland-yutani-corp",
        "image_url": "https://images.teepublic.com/derived/production/designs/61172015_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
    {
        "product_name": "Project-Hail-Mary T-Shirt",
        "price": "24",
        "product_url": "https://www.teepublic.com/t-shirt/64147267-project-hail-mary",
        "image_url": "https://images.teepublic.com/derived/production/designs/64147267_0/1748016039/i_p:c_2e2e2e,s_630,q_90.jpg"
    },
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.teepublic.com/",
}


def clean_filename(name, max_length=80):
    """Create a clean filename from a product name."""
    if not name:
        return "unknown"
    clean = re.sub(r'[^\w\s-]', '', name)
    clean = re.sub(r'\s+', '_', clean.strip())
    clean = clean[:max_length]
    return clean.lower()


def download_image(image_url, filename):
    """Download an image and save it locally."""
    try:
        resp = requests.get(image_url, headers=HEADERS, timeout=30, stream=True)
        resp.raise_for_status()
        filepath = os.path.join(IMAGES_DIR, filename)
        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        file_size = os.path.getsize(filepath)
        print(f"    Downloaded: {filename} ({file_size // 1024} KB)")
        return filepath
    except Exception as e:
        print(f"    FAILED: {e}")
        return None


def main():
    print("=" * 60)
    print("TeePublic T-Shirt Scraper")
    print(f"Total products available: {len(PRODUCTS)}")
    print(f"Mode: {'TEST (first ' + str(TEST_LIMIT) + ')' if TEST_MODE else 'FULL'}")
    print("=" * 60)

    products = PRODUCTS[:TEST_LIMIT] if TEST_MODE else PRODUCTS

    metadata = {}
    success_count = 0

    for i, product in enumerate(products):
        print(f"\n[{i+1}/{len(products)}] {product['product_name']}")
        print(f"  Price: ${product['price']}")
        print(f"  URL: {product['product_url']}")

        base_name = clean_filename(product["product_name"])
        filename = f"{base_name}_{i+1}.jpg"

        filepath = download_image(product["image_url"], filename)

        if filepath:
            metadata[filename] = {
                "product_name": product["product_name"],
                "price": product["price"],
                "product_url": product["product_url"],
                "image_url": product["image_url"],
                "local_file": filepath,
            }
            success_count += 1

        if i < len(products) - 1:
            time.sleep(DELAY_BETWEEN_DOWNLOADS)

    # Save metadata
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\n{'=' * 60}")
    print(f"Scraping complete!")
    print(f"Images downloaded: {success_count}/{len(products)}")
    print(f"Metadata saved to: {METADATA_FILE}")
    print(f"{'=' * 60}")

    # Print sample results
    print("\n--- SAMPLE RESULTS ---")
    for filename, data in list(metadata.items())[:5]:
        print(f"\n  File: {filename}")
        print(f"  Name: {data['product_name']}")
        print(f"  Price: ${data['price']}")
        print(f"  URL: {data['product_url']}")
        print(f"  Image: {data['image_url']}")

    return metadata


if __name__ == "__main__":
    main()
