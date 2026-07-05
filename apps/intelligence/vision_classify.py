"""
Deep Niche Classification using Google Gemini 1.5 Flash Vision
Analyzes each t-shirt image and extracts full niche hierarchy.

Uses the new google-genai SDK.
Respects Gemini free-tier rate limits (15 RPM → 5s delay between calls).

Outputs per image:
- category, macro_niche, micro_niche, nano_niche
- title_subject, keywords, design_style, reason
"""

import json
import os
import sys
import time
import PIL.Image
from dotenv import load_dotenv
from google import genai
from google.genai.types import GenerateContentConfig, ThinkingConfig

load_dotenv()

# ─── Configuration ────────────────────────────────────────────────────────────
IMAGES_DIRS = ["./images_v2", "./images"]  # Check both directories
METADATA_FILE = "metadata_v2.json"
RESULTS_FILE = "vision_results.json"
TAXONOMY_FILE = "niche_taxonomy_prompt.txt"

MODEL = "gemini-2.5-flash"
# Gemini free tier: appears to allow ~10 RPM for 2.5-flash with images.
# Using 10s gap = 6 RPM (safe). On 429, we wait and retry the same item.
DELAY_BETWEEN_CALLS = 10.0
TEST_MODE = False  # Set to False for full run
TEST_LIMIT = 3  # For quota check

# ─── Load taxonomy ────────────────────────────────────────────────────────────
with open(TAXONOMY_FILE, "r", encoding="utf-8") as f:
    TAXONOMY_TEXT = f.read()

# ─── Prompt template ──────────────────────────────────────────────────────────
PROMPT_TEMPLATE = """You are an expert t-shirt design analyst and niche classifier for a print-on-demand intelligence system.

Your job: Given a t-shirt design image plus its product title and artist name, classify it into our niche taxonomy and extract structured metadata.

## NICHE TAXONOMY (choose from these where possible):
{taxonomy}

## RULES:
1. Choose the BEST matching Category, Macro Niche, Micro Niche from the taxonomy above.
2. For Nano Niche: be specific to the actual design subject (e.g. "Capybara Illustration", "Jordan Silhouette Dunk", "Retro Record Store Logo").
3. If nothing in the taxonomy is a close match, pick the closest Category/Macro and suggest your own Micro/Nano that fits the pattern.
4. Keywords should be what a buyer would search for to find this design (5-10 terms).
5. Design style options: vintage, retro, typography, illustration, minimal, cartoon, pop-art, streetwear, hand-drawn, photographic, abstract, graphic, badge/logo, distressed, Japanese/ukiyo-e, pixel-art, or a combo.
6. Be concise. The "reason" field should be ONE sentence.

## PRODUCT INFO:
Product Title: "{product_name}"
Artist/Designer: "{artist}"

## OUTPUT FORMAT:
Return ONLY valid JSON. No markdown fences, no extra text:
{{"category": "...", "macro_niche": "...", "micro_niche": "...", "nano_niche": "...", "title_subject": "...", "keywords": ["keyword1", "keyword2", ...], "design_style": "...", "reason": "..."}}"""


def classify_image(client, filepath, product_name, artist):
    """Send image to Gemini and get niche classification."""
    img = PIL.Image.open(filepath)

    prompt = PROMPT_TEMPLATE.format(
        taxonomy=TAXONOMY_TEXT,
        product_name=product_name,
        artist=artist,
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=[prompt, img],
        config=GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=1024,
            thinking_config=ThinkingConfig(thinking_budget=0),
        ),
    )

    content = response.text.strip()

    # Strip markdown code fences if present
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    result = json.loads(content)
    return result


def load_existing_results():
    """Load previously saved results for resume capability."""
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_results(results):
    """Save results incrementally."""
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


def main():
    print("=" * 70)
    print("Deep Niche Classification — Gemini 1.5 Flash Vision")
    print(f"Model: {MODEL} | Mode: {'TEST (' + str(TEST_LIMIT) + ' images)' if TEST_MODE else 'FULL (192 images)'}")
    print(f"Delay: {DELAY_BETWEEN_CALLS}s between calls ({60/DELAY_BETWEEN_CALLS:.0f} RPM)")
    print("=" * 70)

    # Check API key
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("\nERROR: GOOGLE_API_KEY not set in .env!")
        sys.exit(1)

    # Configure Gemini client
    client = genai.Client(api_key=api_key)
    print(f"  Gemini client configured")

    # Load metadata
    with open(METADATA_FILE, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    print(f"  Loaded {len(metadata)} products from metadata")

    # Load existing results (resume support)
    results = load_existing_results()
    print(f"  Existing results: {len(results)} (will skip these)")

    # Filter to items needing processing
    items = []
    for fn, data in metadata.items():
        if fn in results:
            continue
        # Search both image directories
        filepath = None
        for img_dir in IMAGES_DIRS:
            candidate = os.path.join(img_dir, fn)
            if os.path.exists(candidate):
                filepath = candidate
                break
        if filepath:
            items.append((fn, data, filepath))

    if TEST_MODE:
        items = items[:TEST_LIMIT]

    print(f"  To process: {len(items)} images")
    if not TEST_MODE:
        est_time = len(items) * DELAY_BETWEEN_CALLS / 60
        print(f"  Estimated time: ~{est_time:.1f} minutes")
    print()

    # Process each image with retry logic
    success = 0
    errors = 0
    start_time = time.time()

    for i, (filename, product_info, filepath) in enumerate(items):
        product_name = product_info.get("product_name", "")
        artist = product_info.get("artist", "Unknown")

        print(f"  [{i+1:>3}/{len(items)}] {product_name[:50]:<50}", end="")

        # Retry up to 3 times on rate limit
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = classify_image(client, filepath, product_name, artist)
                results[filename] = result
                success += 1
                macro = result.get('macro_niche', '?')
                micro = result.get('micro_niche', '?')
                print(f" ✓ [{macro} / {micro}]")

                # Save incrementally every 10 items
                if success % 10 == 0:
                    save_results(results)
                break  # Success, exit retry loop

            except json.JSONDecodeError as e:
                print(f" ✗ JSON parse error")
                errors += 1
                break  # Don't retry parse errors

            except Exception as e:
                is_rate_limit = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
                if is_rate_limit and attempt < max_retries - 1:
                    wait_time = 65 * (attempt + 1)
                    print(f" ⏳ rate limit, wait {wait_time}s...", end="")
                    time.sleep(wait_time)
                    print(" retry", end="")
                else:
                    print(f" ✗ {str(e)[:60]}")
                    errors += 1
                    break

        # Rate limit delay between successful calls
        if i < len(items) - 1:
            time.sleep(DELAY_BETWEEN_CALLS)

    # Final save
    save_results(results)
    elapsed = time.time() - start_time

    print(f"\n{'=' * 70}")
    print(f"RESULTS: {success} success, {errors} errors in {elapsed:.1f}s")
    print(f"Results saved to: {RESULTS_FILE}")
    if success > 0:
        avg = elapsed / success
        print(f"Average: {avg:.1f}s per image")
        if TEST_MODE:
            projected = avg * 192
            print(f"Projected time for full 192: ~{projected/60:.1f} minutes")
    print(f"{'=' * 70}")

    # ─── Show results ─────────────────────────────────────────────────────
    if success > 0:
        print(f"\n{'=' * 70}")
        print(f"{'TEST' if TEST_MODE else 'FULL'} RESULTS — Structured Output")
        print(f"{'=' * 70}")

        shown = 0
        for fn, r in results.items():
            if shown >= (TEST_LIMIT if TEST_MODE else 10):
                break
            m = metadata.get(fn, {})
            print(f"\n{'─' * 65}")
            print(f"  Image:        {fn}")
            print(f"  Product:      {m.get('product_name', fn)}")
            print(f"  Artist:       {m.get('artist', 'Unknown')}")
            print(f"  {'─' * 55}")
            print(f"  Category:     {r.get('category', 'N/A')}")
            print(f"  Macro Niche:  {r.get('macro_niche', 'N/A')}")
            print(f"  Micro Niche:  {r.get('micro_niche', 'N/A')}")
            print(f"  Nano Niche:   {r.get('nano_niche', 'N/A')}")
            print(f"  Subject:      {r.get('title_subject', 'N/A')}")
            print(f"  Keywords:     {r.get('keywords', [])}")
            print(f"  Style:        {r.get('design_style', 'N/A')}")
            print(f"  Reason:       {r.get('reason', 'N/A')}")
            shown += 1

        # Raw JSON for first result
        print(f"\n{'─' * 65}")
        print("RAW JSON (first result):")
        first_key = list(results.keys())[0]
        print(json.dumps(results[first_key], indent=2))


if __name__ == "__main__":
    main()
