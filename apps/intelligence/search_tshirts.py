"""
T-Shirt Similarity Search
Searches the Qdrant 'tshirts' collection using either:
- A text query (e.g., "black graphic t-shirt") 
- An image file path

Uses CLIP model for both text and image embeddings to enable cross-modal search.
"""

import sys
import os
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor, CLIPTokenizer
from qdrant_client import QdrantClient

# Configuration
COLLECTION_NAME = "tshirts"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"
TOP_K = 5


def load_model():
    """Load CLIP model and processor."""
    print("Loading CLIP model...")
    model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
    tokenizer = CLIPTokenizer.from_pretrained(CLIP_MODEL_NAME)
    model.eval()
    return model, processor, tokenizer


def get_text_embedding(model, tokenizer, text):
    """Generate a CLIP embedding for a text query."""
    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        text_outputs = model.text_model(**inputs)
        pooled = text_outputs.pooler_output
        text_embeds = model.text_projection(pooled)
    text_embeds = torch.nn.functional.normalize(text_embeds, p=2, dim=-1)
    return text_embeds.squeeze().tolist()


def get_image_embedding(model, processor, image_path):
    """Generate a CLIP embedding for an image."""
    img = Image.open(image_path).convert("RGB")
    inputs = processor(images=img, return_tensors="pt")
    with torch.no_grad():
        vision_outputs = model.vision_model(pixel_values=inputs["pixel_values"])
        pooled = vision_outputs.pooler_output
        image_embeds = model.visual_projection(pooled)
    image_embeds = torch.nn.functional.normalize(image_embeds, p=2, dim=-1)
    return image_embeds.squeeze().tolist()


def search(client, query_vector, top_k=TOP_K):
    """Search Qdrant for similar t-shirts."""
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=top_k,
    )
    return results


def display_results(results, query_type, query_value):
    """Display search results in a formatted way."""
    print(f"\n{'=' * 60}")
    print(f"Search Results for {query_type}: \"{query_value}\"")
    print(f"{'=' * 60}")
    print(f"Top {len(results.points)} most similar t-shirts:\n")

    for i, point in enumerate(results.points):
        payload = point.payload
        score = point.score
        print(f"  #{i+1} (similarity: {score:.4f})")
        print(f"     Name:  {payload['product_name']}")
        print(f"     Price: ${payload['price']}")
        print(f"     URL:   {payload['product_url']}")
        print(f"     File:  {payload['local_file']}")
        print()


def main():
    # Parse command line arguments
    if len(sys.argv) < 2:
        print("Usage:")
        print('  python search_tshirts.py "your text query"')
        print('  python search_tshirts.py --image path/to/image.jpg')
        print()
        print("Examples:")
        print('  python search_tshirts.py "black graphic t-shirt"')
        print('  python search_tshirts.py "sports basketball design"')
        print('  python search_tshirts.py "vintage retro music"')
        print('  python search_tshirts.py --image ./images/adhd_t-shirt_8.jpg')
        sys.exit(1)

    # Determine query type
    if sys.argv[1] == "--image":
        if len(sys.argv) < 3:
            print("ERROR: Please provide an image path after --image")
            sys.exit(1)
        query_type = "image"
        query_value = sys.argv[2]
        if not os.path.exists(query_value):
            print(f"ERROR: Image file not found: {query_value}")
            sys.exit(1)
    else:
        query_type = "text"
        query_value = " ".join(sys.argv[1:])

    # Load model
    model, processor, tokenizer = load_model()

    # Generate query embedding
    print(f"Generating {query_type} embedding...")
    if query_type == "text":
        query_vector = get_text_embedding(model, tokenizer, query_value)
    else:
        query_vector = get_image_embedding(model, processor, query_value)

    # Connect to Qdrant and search
    print("Searching Qdrant...")
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    results = search(client, query_vector)

    # Display results
    display_results(results, query_type, query_value)


if __name__ == "__main__":
    main()
