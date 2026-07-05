"""
Ingest t-shirt images into Qdrant vector database using CLIP embeddings.
- Loads images from ./images/
- Generates embeddings using openai/clip-vit-base-patch32 (512 dimensions)
- Creates a 'tshirts' collection in local Qdrant (localhost:6333)
- Upserts each image with its embedding + metadata payload
"""

import json
import os
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# Configuration
IMAGES_DIR = "./images_v2"
METADATA_FILE = "metadata_v2.json"
COLLECTION_NAME = "tshirts"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"
EMBEDDING_DIM = 512


def get_image_embedding(model, processor, image):
    """Generate a CLIP embedding for an image."""
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        vision_outputs = model.vision_model(pixel_values=inputs["pixel_values"])
        pooled = vision_outputs.pooler_output
        image_embeds = model.visual_projection(pooled)
    # Normalize the embedding
    image_embeds = torch.nn.functional.normalize(image_embeds, p=2, dim=-1)
    return image_embeds.squeeze().tolist()


def main():
    print("=" * 60)
    print("Qdrant Ingestion - T-Shirt Image Embeddings")
    print("=" * 60)

    # Step 1: Load metadata
    print("\n[1] Loading metadata...")
    with open(METADATA_FILE, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    print(f"    Found {len(metadata)} products in metadata")

    # Step 2: Load CLIP model
    print(f"\n[2] Loading CLIP model ({CLIP_MODEL_NAME})...")
    model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
    model.eval()
    print(f"    Model loaded. Embedding dimension: {EMBEDDING_DIM}")

    # Step 3: Connect to Qdrant
    print(f"\n[3] Connecting to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}...")
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    collections = client.get_collections().collections
    print(f"    Connected! Existing collections: {[c.name for c in collections]}")

    # Step 4: Create/recreate collection
    print(f"\n[4] Creating collection '{COLLECTION_NAME}'...")
    existing_names = [c.name for c in collections]
    if COLLECTION_NAME in existing_names:
        client.delete_collection(COLLECTION_NAME)
        print(f"    Deleted existing '{COLLECTION_NAME}' collection")

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=EMBEDDING_DIM,
            distance=Distance.COSINE,
        ),
    )
    print(f"    Collection '{COLLECTION_NAME}' created (size={EMBEDDING_DIM}, distance=COSINE)")

    # Step 5: Generate embeddings and upsert
    print(f"\n[5] Generating embeddings and upserting to Qdrant...")
    points = []
    skipped = 0

    for idx, (filename, product_info) in enumerate(metadata.items()):
        filepath = os.path.join(IMAGES_DIR, filename)

        if not os.path.exists(filepath):
            print(f"    [{idx+1}] SKIPPED (file not found): {filename}")
            skipped += 1
            continue

        try:
            # Load image
            img = Image.open(filepath).convert("RGB")

            # Generate CLIP embedding
            embedding = get_image_embedding(model, processor, img)

            # Create point
            point = PointStruct(
                id=idx + 1,
                vector=embedding,
                payload={
                    "product_name": product_info["product_name"],
                    "artist": product_info.get("artist", "Unknown"),
                    "price": product_info.get("price", "24"),
                    "product_url": product_info["product_url"],
                    "image_url": product_info.get("image_url", ""),
                    "design_id": product_info.get("design_id", ""),
                    "source_platform": product_info.get("source_platform", "teepublic"),
                    "source_category": product_info.get("source_category", ""),
                    "scrape_date": product_info.get("scrape_date", ""),
                    "local_file": filename,
                },
            )
            points.append(point)
            print(f"    [{idx+1}] Embedded: {filename}")

        except Exception as e:
            print(f"    [{idx+1}] ERROR: {filename} - {e}")
            skipped += 1

    # Upsert all points in batch
    if points:
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=points,
        )
        print(f"\n    Upserted {len(points)} points to '{COLLECTION_NAME}'")

    # Step 6: Verify
    print(f"\n[6] Verifying collection...")
    info = client.get_collection(COLLECTION_NAME)
    print(f"    Collection '{COLLECTION_NAME}': {info.points_count} points, "
          f"vector_size={info.config.params.vectors.size}, "
          f"distance={info.config.params.vectors.distance}")

    print(f"\n{'=' * 60}")
    print(f"Ingestion complete!")
    print(f"  Successfully embedded: {len(points)}")
    print(f"  Skipped: {skipped}")
    print(f"  Collection: {COLLECTION_NAME} @ {QDRANT_HOST}:{QDRANT_PORT}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
