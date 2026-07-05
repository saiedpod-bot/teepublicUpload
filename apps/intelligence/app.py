"""
TeePublic Intelligence — Web Dashboard
Flask backend serving an interactive search & browse UI.

Key design: the CLIP model and Qdrant client are loaded ONCE at startup
(eliminating the ~30s per-query load time of the CLI scripts).
"""

import io
import json
import os
import torch
from PIL import Image
from flask import Flask, render_template, request, jsonify, send_from_directory

from transformers import CLIPModel, CLIPProcessor, CLIPTokenizer
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

import live_scraper

# ─── Configuration ────────────────────────────────────────────────────────────
IMAGES_DIR = "./images_v2"
METADATA_FILE = "metadata_v2.json"
COLLECTION_NAME = "tshirts"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"

# 18 top-level categories from classify_tshirts.py
CATEGORIES = [
    "Animals", "Anime", "Art", "Family", "Food", "Gaming", "Humor",
    "Lifestyle", "Music", "Nature", "Pets", "Pop Culture", "Professions",
    "Seasonal", "Spiritual", "Sports", "Travel", "Vintage",
]

# Zero-shot classification prompt for live-fetched products
CLASSIFY_PROMPT_TEMPLATE = "a t-shirt design about {}"

app = Flask(__name__, static_folder="static", template_folder="templates")


# ─── Singleton: load model + clients ONCE at startup ──────────────────────────
class ModelStore:
    """Holds the CLIP model, processor, tokenizer, and Qdrant client.
    Instantiated once globally so every request reuses them."""
    model = None
    processor = None
    tokenizer = None
    qdrant = None
    ready = False


def init_model():
    """Load CLIP model and connect to Qdrant. Called once at first use."""
    if ModelStore.ready:
        return
    print("[startup] Loading CLIP model and connecting to Qdrant...")
    ModelStore.model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
    ModelStore.processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
    ModelStore.tokenizer = CLIPTokenizer.from_pretrained(CLIP_MODEL_NAME)
    ModelStore.model.eval()
    ModelStore.qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    ModelStore.ready = True
    print("[startup] Ready.")


def load_metadata():
    """Load metadata file (cached on the app object)."""
    if not hasattr(app, "_metadata"):
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            app._metadata = json.load(f)
    return app._metadata


# ─── Embedding helpers (logic from search_tshirts.py) ─────────────────────────
def text_embedding(text):
    init_model()
    inputs = ModelStore.tokenizer(text, return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        out = ModelStore.model.text_model(**inputs)
        emb = ModelStore.model.text_projection(out.pooler_output)
    emb = torch.nn.functional.normalize(emb, p=2, dim=-1)
    return emb.squeeze().tolist()


def image_embedding_from_bytes(byte_data):
    """Generate embedding for an image received as raw bytes."""
    init_model()
    img = Image.open(io.BytesIO(byte_data)).convert("RGB")
    inputs = ModelStore.processor(images=img, return_tensors="pt")
    with torch.no_grad():
        out = ModelStore.model.vision_model(pixel_values=inputs["pixel_values"])
        emb = ModelStore.model.visual_projection(out.pooler_output)
    emb = torch.nn.functional.normalize(emb, p=2, dim=-1)
    return emb.squeeze().tolist()


def image_embedding_from_path(filepath):
    """Generate embedding for a local image file."""
    init_model()
    img = Image.open(filepath).convert("RGB")
    inputs = ModelStore.processor(images=img, return_tensors="pt")
    with torch.no_grad():
        out = ModelStore.model.vision_model(pixel_values=inputs["pixel_values"])
        emb = ModelStore.model.visual_projection(out.pooler_output)
    emb = torch.nn.functional.normalize(emb, p=2, dim=-1)
    return emb.squeeze().tolist()


def classify_with_clip(image_path):
    """Zero-shot classify a local image into the 18 categories using CLIP.
    Returns (best_category, confidence_score)."""
    init_model()
    img = Image.open(image_path).convert("RGB")
    labels = [CLASSIFY_PROMPT_TEMPLATE.format(c.lower()) for c in CATEGORIES]
    text_inputs = ModelStore.tokenizer(labels, return_tensors="pt", padding=True, truncation=True)
    image_inputs = ModelStore.processor(images=img, return_tensors="pt")

    with torch.no_grad():
        vision_out = ModelStore.model.vision_model(pixel_values=image_inputs["pixel_values"])
        img_emb = ModelStore.model.visual_projection(vision_out.pooler_output)
        img_emb = torch.nn.functional.normalize(img_emb, p=2, dim=-1)

        text_out = ModelStore.model.text_model(**text_inputs)
        txt_emb = ModelStore.model.text_projection(text_out.pooler_output)
        txt_emb = torch.nn.functional.normalize(txt_emb, p=2, dim=-1)

    sim = (img_emb @ txt_emb.T).squeeze(0)
    probs = torch.softmax(sim * 100, dim=0)
    best_idx = int(probs.argmax())
    return CATEGORIES[best_idx], float(probs[best_idx])


def is_design_indexed(design_id):
    """Check whether a design_id already exists in Qdrant (avoid duplicates)."""
    init_model()
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    res, _ = ModelStore.qdrant.scroll(
        collection_name=COLLECTION_NAME,
        scroll_filter=Filter(
            must=[FieldCondition(key="design_id", match=MatchValue(value=design_id))]
        ),
        limit=1,
        with_payload=False,
        with_vectors=False,
    )
    return len(res) > 0


def get_next_qdrant_id():
    """Get the next available integer ID for a new Qdrant point."""
    init_model()
    info = ModelStore.qdrant.get_collection(COLLECTION_NAME)
    return (info.points_count or 0) + 1


def ingest_live_product(product, image_path):
    """Embed, classify, and upsert a single live-scraped product into Qdrant + metadata.

    Returns the formatted result dict (same shape as format_point output).
    """
    init_model()
    # 1. Classify
    category, confidence = classify_with_clip(image_path)

    # 2. Embed
    embedding = image_embedding_from_path(image_path)

    # 3. Filename
    filename = os.path.basename(image_path)

    # 4. Upsert to Qdrant
    point_id = get_next_qdrant_id()
    payload = {
        "product_name": product["product_name"],
        "artist": product.get("artist", "Unknown"),
        "price": product.get("price", "24"),
        "product_url": product["product_url"],
        "image_url": product.get("cdn_image_url", ""),
        "design_id": product["design_id"],
        "source_platform": "teepublic",
        "source_category": "live-search",
        "scrape_date": __import__("datetime").date.today().isoformat(),
        "local_file": filename,
        "predicted_category": category,
        "confidence": round(confidence, 4),
        "classification_method": "clip-zeroshot",
    }
    ModelStore.qdrant.upsert(
        collection_name=COLLECTION_NAME,
        points=[PointStruct(id=point_id, vector=embedding, payload=payload)],
    )

    # 5. Update metadata_v2.json
    metadata = load_metadata()
    metadata[filename] = payload.copy()
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    return {
        "id": point_id,
        "score": 1.0,
        "product_name": payload["product_name"],
        "artist": payload["artist"],
        "price": payload["price"],
        "product_url": payload["product_url"],
        "image_url": payload["image_url"],
        "local_file": filename,
        "category": category,
        "confidence": round(confidence, 4),
        "design_id": payload["design_id"],
        "is_new": True,
    }


def query_qdrant(vector, top_k=12, category=None):
    """Search Qdrant; optionally filter by predicted category."""
    init_model()
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    query_filter = None
    if category and category != "All":
        query_filter = Filter(
            must=[FieldCondition(key="predicted_category", match=MatchValue(value=category))]
        )
    results = ModelStore.qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=vector,
        limit=top_k,
        query_filter=query_filter,
        with_payload=True,
        with_vectors=False,
    )
    return results.points


def format_point(point):
    """Turn a Qdrant point into a JSON-friendly dict for the UI."""
    return {
        "id": point.id,
        "score": round(point.score, 4),
        "product_name": point.payload.get("product_name", ""),
        "artist": point.payload.get("artist", ""),
        "price": point.payload.get("price", ""),
        "product_url": point.payload.get("product_url", ""),
        "image_url": point.payload.get("image_url", ""),
        "local_file": point.payload.get("local_file", ""),
        "category": point.payload.get("predicted_category", ""),
        "confidence": round(point.payload.get("confidence", 0), 4) if point.payload.get("confidence") else None,
        "design_id": point.payload.get("design_id", ""),
    }


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html", categories=CATEGORIES)


@app.route("/api/search", methods=["GET"])
def api_search():
    """Text search: /api/search?q=funny+dog&top_k=12&category=Animals"""
    q = request.args.get("q", "").strip()
    top_k = int(request.args.get("top_k", 12))
    category = request.args.get("category", "All")

    if not q:
        return jsonify({"error": "empty query", "results": []})

    try:
        vec = text_embedding(q)
        points = query_qdrant(vec, top_k=top_k, category=category)
        return jsonify({
            "query": q,
            "mode": "text",
            "count": len(points),
            "results": [format_point(p) for p in points],
        })
    except Exception as e:
        return jsonify({"error": str(e), "results": []}), 500


@app.route("/api/search/image", methods=["POST"])
def api_search_image():
    """Visual search: upload an image file."""
    if "image" not in request.files:
        return jsonify({"error": "no image uploaded", "results": []}), 400

    file = request.files["image"]
    top_k = int(request.form.get("top_k", 12))
    category = request.form.get("category", "All")

    try:
        byte_data = file.read()
        vec = image_embedding_from_bytes(byte_data)
        points = query_qdrant(vec, top_k=top_k, category=category)
        return jsonify({
            "mode": "image",
            "filename": file.filename,
            "count": len(points),
            "results": [format_point(p) for p in points],
        })
    except Exception as e:
        return jsonify({"error": str(e), "results": []}), 500


@app.route("/api/live-search", methods=["GET", "POST"])
def api_live_search():
    """Live search: fetch NEW products from TeePublic, embed + classify + ingest them.

    GET  /api/live-search?q=bigfoot&max=15
    POST with form: q=bigfoot&max=15
    """
    q = (request.values.get("q") or "").strip()
    max_results = int(request.values.get("max", 15))

    if not q:
        return jsonify({"error": "empty query", "results": []})

    try:
        # 1. Fetch product list from TeePublic via Jina Reader
        print(f"[live-search] Fetching TeePublic for: '{q}'")
        products = live_scraper.fetch_from_teepublic(q, max_results=max_results)
        print(f"[live-search] Jina returned {len(products)} product cards")

        if not products:
            return jsonify({
                "query": q,
                "mode": "live",
                "fetched": 0,
                "new": 0,
                "results": [],
                "message": "لا توجد نتائج من TeePublic لهذا البحث",
            })

        # 2. For each product: skip if already indexed, else download + ingest
        results = []
        new_count = 0
        skipped = 0
        for i, product in enumerate(products):
            if is_design_indexed(product["design_id"]):
                skipped += 1
                print(f"[live-search] [{i+1}/{len(products)}] SKIP (exists): {product['design_id']}")
                continue

            filename = live_scraper.clean_filename(product["product_name"], product["design_id"])
            image_path = live_scraper.download_image(product["design_id"], filename)
            if not image_path:
                print(f"[live-search] [{i+1}/{len(products)}] NO IMAGE: {product['design_id']}")
                continue

            print(f"[live-search] [{i+1}/{len(products)}] Ingesting: {product['product_name'][:40]}")
            result = ingest_live_product(product, image_path)
            results.append(result)
            new_count += 1

        print(f"[live-search] Done: {new_count} new, {skipped} skipped")

        return jsonify({
            "query": q,
            "mode": "live",
            "fetched": len(products),
            "new": new_count,
            "skipped": skipped,
            "count": len(results),
            "results": results,
            "message": f"تم جلب {new_count} تصميم جديد من TeePublic" + (f" ({skipped} موجود مسبقاً)" if skipped else ""),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "results": []}), 500


@app.route("/api/catalog")
def api_catalog():
    """Browse the catalog with pagination + category filter.
    Reads from metadata_v2.json (which includes classification fields)."""
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 24))
    category = request.args.get("category", "All")

    metadata = load_metadata()
    items = list(metadata.values())

    # Optional category filter
    if category and category != "All":
        items = [it for it in items if it.get("predicted_category") == category]

    total = len(items)
    start = (page - 1) * per_page
    end = start + per_page
    page_items = items[start:end]

    return jsonify({
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": (total + per_page - 1) // per_page,
        "items": page_items,
    })


@app.route("/api/stats")
def api_stats():
    """Category distribution for the stats panel."""
    metadata = load_metadata()
    counts = {}
    for it in metadata.values():
        cat = it.get("predicted_category", "Uncertain")
        counts[cat] = counts.get(cat, 0) + 1
    sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    return jsonify({
        "total": len(metadata),
        "distribution": [{"category": c, "count": n} for c, n in sorted_counts],
    })


@app.route("/image/<path:filename>")
def serve_image(filename):
    """Serve a downloaded t-shirt image from images_v2/."""
    return send_from_directory(os.path.abspath(IMAGES_DIR), filename)


@app.route("/api/status")
def api_status():
    """Health check — is Qdrant reachable and how many points exist?"""
    try:
        init_model()
        info = ModelStore.qdrant.get_collection(COLLECTION_NAME)
        return jsonify({
            "qdrant": "ok",
            "collection": COLLECTION_NAME,
            "points": info.points_count,
            "model_loaded": ModelStore.ready,
        })
    except Exception as e:
        return jsonify({"qdrant": "error", "message": str(e)}), 500


if __name__ == "__main__":
    # Preload the model so the first search is instant.
    print("=" * 60)
    print("TeePublic Intelligence — Web Dashboard")
    print("=" * 60)
    init_model()
    print("[server] Starting Flask on http://localhost:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
