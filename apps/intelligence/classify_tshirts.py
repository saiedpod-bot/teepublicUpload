"""
Classify t-shirt images into top-level Categories using CLIP zero-shot classification.

Improvements:
1. Confidence threshold: if top category score < 0.30, mark as "Uncertain - needs review"
2. Hybrid approach: combines CLIP image prediction with text-based keyword matching
   on the product name to improve accuracy for text-heavy designs.

Categories extracted from Niche_Database.xlsx (Sheet4):
Animals, Anime, Art, Family, Food, Gaming, Humor, Lifestyle, Music,
Nature, Pets, Pop Culture, Professions, Seasonal, Spiritual, Sports, Travel, Vintage
"""

import json
import os
import csv
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor, CLIPTokenizer
from qdrant_client import QdrantClient

# Configuration
IMAGES_DIR = "./images_v2"
METADATA_FILE = "metadata_v2.json"
OUTPUT_CSV = "tshirts_intelligence.csv"
COLLECTION_NAME = "tshirts"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"

CONFIDENCE_THRESHOLD = 0.30  # Below this → "Uncertain - needs review"
UNCERTAIN_LABEL = "Uncertain - needs review"

# Weight for combining image score and text-name score
IMAGE_WEIGHT = 0.6
TEXT_WEIGHT = 0.4

# Top-level Categories from Niche_Database.xlsx Sheet4
CATEGORIES = [
    "Animals",
    "Anime",
    "Art",
    "Family",
    "Food",
    "Gaming",
    "Humor",
    "Lifestyle",
    "Music",
    "Nature",
    "Pets",
    "Pop Culture",
    "Professions",
    "Seasonal",
    "Spiritual",
    "Sports",
    "Travel",
    "Vintage",
]

# Keyword mapping: product name keywords → category
# Used to boost text-based signals for text-heavy designs
CATEGORY_KEYWORDS = {
    "Animals": ["animal", "dog", "cat", "bird", "fish", "wolf", "bear", "lion",
                "tiger", "elephant", "whale", "shark", "dinosaur", "dragon",
                "fox", "owl", "deer", "horse", "monkey", "penguin", "rabbit"],
    "Anime": ["anime", "manga", "otaku", "kawaii", "senpai", "waifu", "naruto",
              "dragon ball", "one piece", "studio ghibli", "totoro", "sailor moon",
              "attack on titan", "demon slayer", "jujutsu", "my hero academia"],
    "Art": ["art", "painting", "abstract", "artistic", "gallery", "canvas",
            "watercolor", "sketch", "illustration", "surreal", "pop art"],
    "Family": ["family", "mom", "dad", "father", "mother", "parent", "grandpa",
               "grandma", "son", "daughter", "brother", "sister", "baby",
               "graduation", "graduate", "class of"],
    "Food": ["food", "pizza", "burger", "taco", "sushi", "coffee", "beer",
             "wine", "restaurant", "chef", "cook", "kitchen", "ramen",
             "donut", "cake", "bbq", "grill", "fries", "lager", "ale",
             "brewery", "pub", "bar", "diner", "chinese food"],
    "Gaming": ["gaming", "gamer", "video game", "console", "controller",
               "pixel", "retro game", "esports", "rpg", "dungeon",
               "quest", "level up", "respawn", "8-bit", "nintendo",
               "playstation", "xbox", "pc gaming"],
    "Humor": ["funny", "humor", "joke", "laugh", "sarcasm", "sarcastic",
              "meme", "pun", "silly", "weird", "dumb", "worse", "adhd",
              "introvert", "awkward", "adulting", "procrastination", "dui"],
    "Lifestyle": ["lifestyle", "fitness", "gym", "yoga", "meditation",
                  "vegan", "organic", "minimalist", "motivation", "hustle",
                  "entrepreneur", "tools", "workshop", "handyman", "binford"],
    "Music": ["music", "band", "guitar", "rock", "metal", "jazz", "hip hop",
              "rap", "punk", "vinyl", "record", "concert", "amplification",
              "amp", "marshall", "singer", "dj", "musician", "records",
              "tapes", "byrne", "album", "greatest hits", "peaches records"],
    "Nature": ["nature", "mountain", "forest", "ocean", "beach", "sunset",
               "sunrise", "landscape", "tree", "flower", "wave", "river",
               "lake", "sky", "cloud", "wilderness", "earth", "planet",
               "moon", "stars", "aurora", "volcano"],
    "Pets": ["pet", "puppy", "kitten", "goldfish", "hamster", "parrot",
             "paw", "frog", "kermit", "toonces", "driving cat"],
    "Pop Culture": ["pop culture", "movie", "film", "tv", "television",
                    "superhero", "marvel", "dc", "star wars", "disney",
                    "peanuts", "empire", "evil empire", "muppet", "kermit",
                    "wolverines", "stuntman", "fall guy", "arrakis", "dune",
                    "sci fi", "alien", "weyland", "yutani", "hail mary",
                    "project hail", "sanctuary", "sorcerer", "homunculus",
                    "caucasians", "nwo"],
    "Professions": ["profession", "doctor", "nurse", "engineer", "teacher",
                    "lawyer", "firefighter", "police", "pilot", "scientist",
                    "programmer", "developer", "mechanic", "plumber",
                    "electrician", "carpenter", "accountant"],
    "Seasonal": ["christmas", "halloween", "easter", "thanksgiving",
                 "valentine", "4th of july", "independence day", "new year",
                 "spring", "summer", "fall", "winter", "holiday", "seasonal",
                 "graduation", "fathers day", "mothers day"],
    "Spiritual": ["spiritual", "meditation", "zen", "buddha", "chakra",
                  "mandala", "om", "yin yang", "karma", "soul", "faith",
                  "prayer", "angel", "divine", "sacred", "mystical",
                  "sanctuary", "moon ritual"],
    "Sports": ["sports", "basketball", "football", "baseball", "soccer",
               "hockey", "tennis", "golf", "boxing", "mma", "wrestling",
               "nba", "nfl", "mlb", "champion", "tournament", "final four",
               "march madness", "slam dunk", "jordan", "kobe", "mamba",
               "air jordan", "wolverines", "illini", "spurs", "lakers",
               "bulls", "heart baseball", "fearless"],
    "Travel": ["travel", "adventure", "explore", "wanderlust", "vacation",
               "passport", "airplane", "road trip", "camping", "hiking",
               "backpack", "destination", "tourist", "globe", "world"],
    "Vintage": ["vintage", "retro", "classic", "old school", "nostalgia",
                "throwback", "1970", "1980", "1990", "est.", "established",
                "since", "distressed", "faded", "worn", "antique",
                "driving school", "stuntman association"],
}

# Prompt template for zero-shot classification
PROMPT_TEMPLATE = "a t-shirt design about {}"


def classify_image_clip(model, processor, tokenizer, image, categories):
    """
    Zero-shot classify an image against category labels using CLIP.
    Returns sorted list of (category, score) tuples.
    """
    text_labels = [PROMPT_TEMPLATE.format(cat.lower()) for cat in categories]
    text_inputs = tokenizer(text_labels, return_tensors="pt", padding=True, truncation=True)
    image_inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        vision_outputs = model.vision_model(pixel_values=image_inputs["pixel_values"])
        image_embeds = model.visual_projection(vision_outputs.pooler_output)
        image_embeds = torch.nn.functional.normalize(image_embeds, p=2, dim=-1)

        text_outputs = model.text_model(**text_inputs)
        text_embeds = model.text_projection(text_outputs.pooler_output)
        text_embeds = torch.nn.functional.normalize(text_embeds, p=2, dim=-1)

    similarity = (image_embeds @ text_embeds.T).squeeze(0)
    probs = torch.softmax(similarity * 100, dim=0)

    results = {categories[i]: probs[i].item() for i in range(len(categories))}
    return results


def classify_text_keywords(product_name, categories):
    """
    Score categories based on keyword matches in the product name.
    Returns dict of {category: score} where score is based on keyword hit strength.
    """
    name_lower = product_name.lower()
    scores = {}

    for cat in categories:
        keywords = CATEGORY_KEYWORDS.get(cat, [])
        match_count = 0
        for kw in keywords:
            if kw.lower() in name_lower:
                match_count += 1

        # Normalize: give a strong signal if any keyword matches
        if match_count > 0:
            # More matches = higher confidence, cap at 1.0
            scores[cat] = min(1.0, match_count * 0.5)
        else:
            scores[cat] = 0.0

    # Normalize to sum to 1.0 (if any matches exist)
    total = sum(scores.values())
    if total > 0:
        scores = {cat: score / total for cat, score in scores.items()}
    else:
        # No keyword matches — uniform prior (no text signal)
        scores = {cat: 1.0 / len(categories) for cat in categories}

    return scores


def combine_scores(image_scores, text_scores, categories):
    """
    Combine image-based CLIP scores with text-based keyword scores.
    Returns sorted list of (category, combined_score) tuples.
    """
    combined = {}
    for cat in categories:
        img_score = image_scores.get(cat, 0.0)
        txt_score = text_scores.get(cat, 0.0)

        # If text has strong signal (any keyword matched), use weighted combo
        # If no keywords matched, rely more on image
        has_text_signal = any(text_scores[c] > (1.0 / len(categories) + 0.01) for c in categories)

        if has_text_signal:
            combined[cat] = IMAGE_WEIGHT * img_score + TEXT_WEIGHT * txt_score
        else:
            # No text signal available — use image only
            combined[cat] = img_score

    # Sort by combined score
    results = sorted(combined.items(), key=lambda x: x[1], reverse=True)
    return results


def main():
    print("=" * 60)
    print("T-Shirt Category Classification (Hybrid: CLIP + Keywords)")
    print(f"Categories: {len(CATEGORIES)} top-level labels")
    print(f"Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print(f"Weighting: image={IMAGE_WEIGHT}, text={TEXT_WEIGHT}")
    print("=" * 60)

    # Load metadata
    print("\n[1] Loading metadata...")
    with open(METADATA_FILE, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    print(f"    {len(metadata)} products loaded")

    # Load CLIP model
    print(f"\n[2] Loading CLIP model ({CLIP_MODEL_NAME})...")
    model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
    tokenizer = CLIPTokenizer.from_pretrained(CLIP_MODEL_NAME)
    model.eval()
    print("    Model loaded.")

    # Classify each image
    print(f"\n[3] Classifying {len(metadata)} images (hybrid: image + product name)...")
    classifications = {}
    category_counts = {}
    uncertain_items = []

    for idx, (filename, product_info) in enumerate(metadata.items()):
        filepath = os.path.join(IMAGES_DIR, filename)
        if not os.path.exists(filepath):
            print(f"    [{idx+1}] SKIPPED (file missing): {filename}")
            continue

        product_name = product_info["product_name"]

        # Image-based CLIP classification
        img = Image.open(filepath).convert("RGB")
        image_scores = classify_image_clip(model, processor, tokenizer, img, CATEGORIES)

        # Text-based keyword classification from product name
        text_scores = classify_text_keywords(product_name, CATEGORIES)

        # Combine scores
        combined_results = combine_scores(image_scores, text_scores, CATEGORIES)

        top_category = combined_results[0][0]
        top_score = combined_results[0][1]
        top3 = combined_results[:3]

        # Apply confidence threshold
        if top_score < CONFIDENCE_THRESHOLD:
            final_category = UNCERTAIN_LABEL
            uncertain_items.append(filename)
            status = "⚠️  UNCERTAIN"
        else:
            final_category = top_category
            status = f"✓"

        classifications[filename] = {
            "predicted_category": final_category,
            "top3": [(cat, round(score, 4)) for cat, score in top3],
            "confidence": round(top_score, 4),
            "method": "hybrid (image+text)" if any(
                text_scores[c] > (1.0 / len(CATEGORIES) + 0.01) for c in CATEGORIES
            ) else "image only",
        }

        # Count categories
        category_counts[final_category] = category_counts.get(final_category, 0) + 1

        print(f"    [{idx+1:>2}] {product_name[:45]:<45} → {final_category:<20} ({top_score:.3f}) {status}")

    # Update metadata.json
    print(f"\n[4] Updating metadata.json...")
    for filename, cls_data in classifications.items():
        if filename in metadata:
            metadata[filename]["predicted_category"] = cls_data["predicted_category"]
            metadata[filename]["confidence"] = cls_data["confidence"]
            metadata[filename]["classification_method"] = cls_data["method"]
            metadata[filename]["category_scores_top3"] = [
                {"category": cat, "score": score} for cat, score in cls_data["top3"]
            ]

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"    metadata.json updated")

    # Export CSV
    print(f"\n[5] Exporting CSV to {OUTPUT_CSV}...")
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "filename", "product_name", "artist", "price", "predicted_category",
            "confidence", "method", "source_category", "scrape_date",
            "product_url", "image_url",
            "top1_category", "top1_score",
            "top2_category", "top2_score",
            "top3_category", "top3_score",
        ])
        for filename, cls_data in classifications.items():
            m = metadata[filename]
            top3 = cls_data["top3"]
            writer.writerow([
                filename,
                m["product_name"],
                m.get("artist", "Unknown"),
                m.get("price", "24"),
                cls_data["predicted_category"],
                f"{cls_data['confidence']:.4f}",
                cls_data["method"],
                m.get("source_category", ""),
                m.get("scrape_date", ""),
                m.get("product_url", ""),
                m.get("image_url", ""),
                top3[0][0], f"{top3[0][1]:.4f}",
                top3[1][0], f"{top3[1][1]:.4f}",
                top3[2][0], f"{top3[2][1]:.4f}",
            ])
    print(f"    CSV exported: {OUTPUT_CSV}")

    # Update Qdrant payloads
    print(f"\n[6] Updating Qdrant payloads...")
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    all_points = client.scroll(
        collection_name=COLLECTION_NAME,
        limit=100,
        with_payload=True,
        with_vectors=False,
    )[0]

    updated = 0
    for point in all_points:
        local_file = point.payload.get("local_file", "")
        if local_file in classifications:
            cls_data = classifications[local_file]
            client.set_payload(
                collection_name=COLLECTION_NAME,
                payload={
                    "predicted_category": cls_data["predicted_category"],
                    "confidence": cls_data["confidence"],
                    "classification_method": cls_data["method"],
                    "category_scores_top3": [
                        {"category": cat, "score": score}
                        for cat, score in cls_data["top3"]
                    ],
                },
                points=[point.id],
            )
            updated += 1

    print(f"    Updated {updated} Qdrant points")

    # ─── Summary ─────────────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print("CATEGORY DISTRIBUTION SUMMARY")
    print(f"{'=' * 60}")
    sorted_counts = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
    for cat, count in sorted_counts:
        bar = "█" * count
        marker = " ⚠️" if cat == UNCERTAIN_LABEL else ""
        print(f"  {cat:<28} {count:>2} {bar}{marker}")
    print(f"  {'─' * 40}")
    print(f"  {'TOTAL':<28} {sum(category_counts.values()):>2}")

    # Uncertain items detail
    if uncertain_items:
        print(f"\n{'=' * 60}")
        print(f"UNCERTAIN ITEMS ({len(uncertain_items)} items below {CONFIDENCE_THRESHOLD} threshold)")
        print(f"{'=' * 60}")
        for fn in uncertain_items:
            cls = classifications[fn]
            name = metadata[fn]["product_name"]
            top3 = cls["top3"]
            print(f"\n  File: {fn}")
            print(f"  Product: {name}")
            print(f"  Confidence: {cls['confidence']:.4f} (below {CONFIDENCE_THRESHOLD})")
            print(f"  Top 3 candidates:")
            for cat, score in top3:
                print(f"    • {cat:<15} {score:.4f}")

    # Example classifications
    print(f"\n{'=' * 60}")
    print("EXAMPLE CLASSIFICATIONS (6 samples)")
    print(f"{'=' * 60}")
    for i, (filename, cls_data) in enumerate(list(classifications.items())[:6]):
        product_name = metadata[filename]["product_name"]
        top3 = cls_data["top3"]
        is_uncertain = cls_data["predicted_category"] == UNCERTAIN_LABEL
        print(f"\n  Image: {filename}")
        print(f"  Product: {product_name}")
        print(f"  Category: {cls_data['predicted_category']}")
        print(f"  Confidence: {cls_data['confidence']:.4f} {'⚠️ BELOW THRESHOLD' if is_uncertain else '✓'}")
        print(f"  Method: {cls_data['method']}")
        print(f"  Top 3:")
        for cat, score in top3:
            print(f"    • {cat:<15} {score:.4f} {'●' * int(score * 20)}")

    print(f"\n{'=' * 60}")
    print("Classification complete!")
    print(f"  Confident: {len(classifications) - len(uncertain_items)}")
    print(f"  Uncertain: {len(uncertain_items)}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
