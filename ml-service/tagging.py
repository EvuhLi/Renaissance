from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel
import io
import torch.nn.functional as F
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cpu"

# -------- MODEL LOADING -------- #
try:
    logger.info("Loading CLIP model...")
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()
except Exception as e:
    logger.error(f"Model failed to load: {e}")
    raise RuntimeError(e)


# -------- LOOM SYSTEM CONTEXT -------- #
# This prefix is prepended to every tag label before encoding.
# It anchors CLIP's embedding space to Loom's context — an art discovery
# platform for creatives — so scores reflect how artists and their audience
# would describe and find work, rather than generic image classification.
LOOM_CONTEXT = "On Loom, a social art platform for creatives, this artwork is tagged as:"


# -------- EXPANDED ART TAXONOMY -------- #
ART_TAXONOMY = {
    "medium": [
        "oil painting",
        "watercolor painting",
        "acrylic painting",
        "gouache painting",
        "digital art",
        "digital painting",
        "pixel art",
        "3D render",
        "charcoal drawing",
        "pencil sketch",
        "ink drawing",
        "ballpoint pen drawing",
        "linocut print",
        "screen print",
        "etching",
        "photography",
        "film photography",
        "long exposure photography",
        "mixed media artwork",
        "collage",
        "textile art",
        "sculpture",
        "ceramic art",
        "spray paint",
        "street art",
        "vector illustration",
        "concept art",
        "storyboard",
        "animation frame",
    ],
    "subject": [
        "portrait",
        "self portrait",
        "character design",
        "figure study",
        "landscape",
        "urban landscape",
        "cityscape",
        "architecture",
        "seascape",
        "nature",
        "botanical illustration",
        "wildlife",
        "animal",
        "still life",
        "food",
        "abstract art",
        "geometric abstract",
        "fantasy scene",
        "sci-fi scene",
        "mythological scene",
        "historical scene",
        "interior scene",
        "fashion illustration",
        "editorial illustration",
        "book cover art",
        "poster design",
        "typography art",
        "comic panel",
        "pattern design",
        "map illustration",
    ],
    "style": [
        "impressionism",
        "expressionism",
        "realism",
        "hyperrealism",
        "surrealism",
        "cubism",
        "abstract expressionism",
        "minimalism",
        "maximalism",
        "baroque",
        "art nouveau",
        "art deco",
        "pop art",
        "street art style",
        "flat design",
        "line art",
        "painterly",
        "sketchy",
        "retro",
        "vintage",
        "lo-fi aesthetic",
        "cottagecore",
        "dark fantasy",
        "cyberpunk",
        "vaporwave",
        "anime style",
        "manga style",
        "cartoon style",
        "children's book illustration style",
        "editorial style",
    ],
    "mood": [
        "peaceful",
        "dramatic",
        "melancholic",
        "joyful",
        "mysterious",
        "dark and moody",
        "romantic",
        "ethereal",
        "energetic",
        "nostalgic",
        "dreamlike",
        "unsettling",
        "whimsical",
        "serene",
        "intense",
        "hopeful",
        "lonely",
        "chaotic",
        "meditative",
        "playful",
    ],
    "color_palette": [
        "warm tones",
        "cool tones",
        "vibrant and saturated",
        "muted and desaturated",
        "monochromatic",
        "black and white",
        "pastel colors",
        "earthy tones",
        "neon colors",
        "complementary colors",
        "analogous color scheme",
        "high contrast",
        "low contrast",
        "golden hour palette",
        "duotone",
    ],
    "aesthetic_features": [
        "heavy texture",
        "smooth and clean",
        "detailed and intricate",
        "loose and gestural",
        "tight linework",
        "expressive brushstrokes",
        "soft gradients",
        "hard edges",
        "layered composition",
        "negative space",
        "symmetrical composition",
        "rule of thirds",
        "dynamic perspective",
        "flat perspective",
        "cinematic framing",
        "close-up crop",
        "wide angle view",
        "pattern-heavy",
        "collage-like",
        "glitch aesthetic",
    ],
}

# -------- DYNAMIC THRESHOLDS PER CATEGORY -------- #
# Each category has a tuned minimum cosine similarity score.
# Categories with more abstract or overlapping labels (style, mood)
# get lower thresholds so meaningful tags aren't suppressed.
# Categories with more visually distinct labels (medium, color_palette)
# use a higher bar.
CATEGORY_THRESHOLDS = {
    "medium":             0.24,
    "subject":            0.23,
    "style":              0.20,
    "mood":               0.19,
    "color_palette":      0.22,
    "aesthetic_features": 0.20,
}

# -------- HELPERS -------- #

def extract_tensor(output):
    """
    Safely extracts a plain torch.Tensor from either a raw tensor
    or a BaseModelOutputWithPooling object returned by some transformers versions.
    """
    if isinstance(output, torch.Tensor):
        return output
    if hasattr(output, "pooler_output") and output.pooler_output is not None:
        return output.pooler_output
    return output[0]


def compute_text_embeddings(labels):
    """
    Encodes a list of labels with the Loom system context prefix,
    anchoring CLIP's embedding space to an art-discovery social platform.
    """
    try:
        # Prepend context to every label
        contextualized = [f"{LOOM_CONTEXT} {label}" for label in labels]
        inputs = processor(text=contextualized, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            raw = model.get_text_features(**inputs)
            features = extract_tensor(raw)
        return F.normalize(features.float(), p=2, dim=-1)
    except Exception as e:
        logger.error(f"Text embedding error: {e}")
        return None


# -------- PRE-COMPUTE TAXONOMY EMBEDDINGS -------- #

TEXT_EMBEDDINGS = {}
logger.info("Pre-computing taxonomy embeddings for Loom...")
for category, labels in ART_TAXONOMY.items():
    emb = compute_text_embeddings(labels)
    if emb is not None:
        TEXT_EMBEDDINGS[category] = emb
        logger.info(f"Loaded {category}: {emb.shape}")
    else:
        logger.warning(f"Failed to compute embeddings for category: {category}")


# -------- ANALYZER -------- #

@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    if not TEXT_EMBEDDINGS:
        raise HTTPException(status_code=503, detail="Embeddings not initialized.")

    try:
        # 1. Load and convert image
        contents = await image.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")

        # 2. Get image embedding
        inputs = processor(images=img, return_tensors="pt").to(device)
        with torch.no_grad():
            raw = model.get_image_features(**inputs)
            img_emb = extract_tensor(raw)
            img_emb = F.normalize(img_emb.float(), p=2, dim=-1)

        # 3. Score against each taxonomy category
        results = {}
        for category, text_emb in TEXT_EMBEDDINGS.items():
            # Cosine similarity: [1, 512] @ [512, N] -> [1, N]
            scores = (img_emb @ text_emb.T).squeeze(0)
            threshold = CATEGORY_THRESHOLDS.get(category, 0.21)
            labels = ART_TAXONOMY[category]

            category_tags = []
            for i, score in enumerate(scores):
                conf = float(score.item())
                if conf >= threshold:
                    category_tags.append({
                        "label": labels[i],
                        "confidence": round(conf, 3),
                    })

            # Sort by confidence descending — all above threshold are returned
            category_tags.sort(key=lambda x: x["confidence"], reverse=True)
            results[category] = category_tags

        return results

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))