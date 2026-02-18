from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel
import io
import os
import re
import json
import base64
import urllib.request
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
        "human face",
        "person",
        "group of people",
        "child",
        "elderly person",
        "character design",
        "figure study",
        "full body figure",
        "hands study",
        "eyes close-up",
        "landscape",
        "urban landscape",
        "cityscape",
        "architecture",
        "street scene",
        "interior design",
        "room interior",
        "seascape",
        "nature",
        "forest",
        "mountain",
        "desert",
        "river",
        "flower",
        "botanical illustration",
        "wildlife",
        "animal",
        "dog",
        "cat",
        "bird",
        "horse",
        "fish",
        "insect",
        "mythical creature",
        "still life",
        "food",
        "coffee",
        "coffee cup",
        "coffee mug",
        "latte art",
        "tea cup",
        "beverage",
        "fruit still life",
        "tabletop objects",
        "vehicle",
        "car",
        "motorcycle",
        "bicycle",
        "train",
        "airplane",
        "boat",
        "space scene",
        "planet",
        "moon",
        "abstract art",
        "geometric abstract",
        "fantasy scene",
        "sci-fi scene",
        "mythological scene",
        "historical scene",
        "interior scene",
        "daily life scene",
        "sports scene",
        "music scene",
        "dance scene",
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
    "subject":            0.25,
    "style":              0.20,
    "mood":               0.19,
    "color_palette":      0.22,
    "aesthetic_features": 0.20,
}

# -------- OPTIONAL GPT SUBJECT PRIMER -------- #
# GPT can provide a small set of broad subjects that we then map to
# existing art-specific subject labels. CLIP remains the scorer so the
# output format stays identical for downstream recommendation logic.
SUBJECT_KEYWORD_HINTS = {
    "person": ["portrait", "figure study", "full body figure"],
    "people": ["group of people", "daily life scene", "street scene"],
    "face": ["human face", "portrait", "self portrait"],
    "animal": ["animal", "wildlife", "mythical creature"],
    "dog": ["dog", "animal"],
    "cat": ["cat", "animal"],
    "bird": ["bird", "wildlife", "animal"],
    "food": ["food", "still life", "fruit still life"],
    "drink": ["food", "still life", "tabletop objects"],
    "coffee": ["food", "still life", "tabletop objects"],
    "tea": ["food", "still life", "tabletop objects"],
    "cup": ["still life", "tabletop objects", "food"],
    "mug": ["still life", "tabletop objects", "food"],
    "vehicle": ["vehicle", "car", "motorcycle", "bicycle", "train", "airplane", "boat"],
    "building": ["architecture", "cityscape", "interior design"],
    "city": ["cityscape", "urban landscape", "street scene"],
    "landscape": ["landscape", "nature", "seascape"],
    "nature": ["nature", "forest", "mountain", "river"],
    "flower": ["flower", "botanical illustration", "nature"],
    "tree": ["forest", "nature", "landscape"],
    "mountain": ["mountain", "landscape", "nature"],
    "ocean": ["seascape", "river", "nature"],
    "sky": ["landscape", "seascape", "space scene"],
    "indoor": ["room interior", "interior scene", "interior design"],
    "street": ["street scene", "urban landscape", "cityscape"],
    "abstract": ["abstract art", "geometric abstract"],
}

MIN_TOTAL_TAGS = 6
MIN_CATEGORY_TAGS = {
    "subject": 2,
    "style": 1,
    "medium": 1,
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

def infer_subjects_with_gpt(image_bytes):
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return []

    try:
        data_url = f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode('ascii')}"
        prompt = (
            "Identify up to 6 concrete visual subjects in this image. "
            "Prefer nouns or short noun phrases like 'coffee cup', 'cat', 'street', "
            "'portrait', 'flower bouquet'. Return JSON only in the exact form: "
            '{"subjects":["item1","item2"]}.'
        )

        payload = {
            "model": os.getenv("OPENAI_SUBJECT_MODEL", "gpt-4o-mini"),
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": data_url},
                    ],
                }
            ],
            "max_output_tokens": 80,
        }

        req = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = json.loads(resp.read().decode("utf-8"))

        text = str(raw.get("output_text") or "").lower()
        if not text:
            chunks = []
            for block in raw.get("output", []):
                for item in block.get("content", []):
                    if item.get("type") in ("output_text", "text"):
                        chunks.append(item.get("text", ""))
            text = " ".join(chunks).lower()

        # Parse structured JSON first, fallback to token extraction.
        parsed_subjects = []
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, dict) and isinstance(parsed.get("subjects"), list):
                    parsed_subjects = [
                        str(s).strip().lower()
                        for s in parsed["subjects"]
                        if str(s).strip()
                    ]
            except Exception:
                parsed_subjects = []

        if not parsed_subjects:
            parsed_subjects = [
                s.strip().lower()
                for s in re.split(r"[,\n]", text)
                if s.strip()
            ]

        # Keep short, unique phrases only.
        deduped = []
        seen = set()
        for phrase in parsed_subjects:
            normalized = re.sub(r"[^a-z0-9\s\-]", "", phrase).strip()
            if not normalized:
                continue
            if len(normalized.split()) > 4:
                continue
            if normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
            if len(deduped) >= 6:
                break
        return deduped
    except Exception as e:
        logger.warning(f"GPT subject primer unavailable, continuing with CLIP-only subjects: {e}")
        return []

def build_subject_hints(subject_phrases):
    hints = set()
    for phrase in subject_phrases:
        for keyword, labels in SUBJECT_KEYWORD_HINTS.items():
            if keyword in phrase:
                for label in labels:
                    hints.add(label)
    return hints


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
        gpt_subjects = infer_subjects_with_gpt(contents)
        subject_hints = build_subject_hints(gpt_subjects)

        # 2. Get image embedding
        inputs = processor(images=img, return_tensors="pt").to(device)
        with torch.no_grad():
            raw = model.get_image_features(**inputs)
            img_emb = extract_tensor(raw)
            img_emb = F.normalize(img_emb.float(), p=2, dim=-1)

        # 3. Score against each taxonomy category
        results = {}
        all_candidates = []
        for category, text_emb in TEXT_EMBEDDINGS.items():
            # Cosine similarity: [1, 512] @ [512, N] -> [1, N]
            scores = (img_emb @ text_emb.T).squeeze(0)
            threshold = CATEGORY_THRESHOLDS.get(category, 0.21)
            labels = ART_TAXONOMY[category]

            category_tags = []
            for i, score in enumerate(scores):
                conf = float(score.item())
                # Optional GPT hints only nudge subject confidence slightly;
                # CLIP scoring still determines all final tags.
                if category == "subject" and labels[i] in subject_hints:
                    conf += 0.035
                all_candidates.append({
                    "category": category,
                    "label": labels[i],
                    "confidence": round(min(conf, 1.0), 3),
                })
                if conf >= threshold:
                    category_tags.append({
                        "label": labels[i],
                        "confidence": round(min(conf, 1.0), 3),
                    })

            # Sort by confidence descending — all above threshold are returned
            category_tags.sort(key=lambda x: x["confidence"], reverse=True)

            min_for_category = MIN_CATEGORY_TAGS.get(category, 0)
            if min_for_category > 0 and len(category_tags) < min_for_category:
                existing = {t.get("label", "").strip().lower() for t in category_tags}
                ranked = sorted(
                    [
                        {
                            "label": labels[i],
                            "confidence": round(min(float(scores[i].item()), 1.0), 3),
                        }
                        for i in range(len(labels))
                    ],
                    key=lambda x: x["confidence"],
                    reverse=True,
                )
                for item in ranked:
                    key = item["label"].strip().lower()
                    if not key or key in existing:
                        continue
                    category_tags.append(item)
                    existing.add(key)
                    if len(category_tags) >= min_for_category:
                        break

            results[category] = category_tags

        # Add GPT subject phrases as low-confidence supplemental tags.
        if gpt_subjects:
            existing_subject_labels = {
                t.get("label", "").strip().lower()
                for t in results.get("subject", [])
                if isinstance(t, dict)
            }
            for phrase in gpt_subjects:
                normalized = phrase.strip().lower()
                if not normalized or normalized in existing_subject_labels:
                    continue
                results.setdefault("subject", []).append({
                    "label": normalized,
                    "confidence": 0.265,
                })
                existing_subject_labels.add(normalized)

        # Guarantee a minimum number of tags across the whole result.
        total_tags = sum(len(v) for v in results.values() if isinstance(v, list))
        if total_tags < MIN_TOTAL_TAGS:
            used = {
                (cat, tag.get("label", "").strip().lower())
                for cat, tags in results.items()
                if isinstance(tags, list)
                for tag in tags
                if isinstance(tag, dict)
            }
            for candidate in sorted(all_candidates, key=lambda x: x["confidence"], reverse=True):
                key = (candidate["category"], candidate["label"].strip().lower())
                if key in used:
                    continue
                results.setdefault(candidate["category"], []).append({
                    "label": candidate["label"],
                    "confidence": candidate["confidence"],
                })
                used.add(key)
                total_tags += 1
                if total_tags >= MIN_TOTAL_TAGS:
                    break

        # Keep categories sorted after supplemental additions.
        for category in results:
            if isinstance(results[category], list):
                results[category].sort(
                    key=lambda x: x.get("confidence", 0),
                    reverse=True
                )

        return results

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
