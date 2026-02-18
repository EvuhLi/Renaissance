"""
Loom Recommendation Engine — Hybrid NCF + Tag Affinity
=======================================================
FastAPI service exposing:
  POST /recommend    — generate a personalised FYP feed
  POST /interaction  — record a like/comment and update NCF weights
  GET  /health       — liveness check

User identity: username string (no auth required yet).
Persistence:   NCF model weights saved to MongoDB as base64 numpy arrays.
"""

import numpy as np
import random
import math
import base64
import io
import os
import logging
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from pymongo import MongoClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("recommendation")

app = FastAPI(title="Loom Recommendation Service")

# ==========================================
# MONGODB CONNECTION
# ==========================================
MONGO_URI = os.getenv("MONGODB_URI", "")
_db = None

def get_db():
    global _db
    if _db is None and MONGO_URI:
        try:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
            _db = client.get_default_database()
            logger.info("[NCF] MongoDB connected for model persistence")
        except Exception as e:
            logger.warning(f"[NCF] MongoDB unavailable — running without persistence: {e}")
    return _db


# ==========================================
# CONSTANTS
# ==========================================
EMBEDDING_DIM       = 32
LEARNING_RATE       = 0.01
REGULARIZATION      = 0.001
MIN_INTERACTIONS    = 5
MAX_NCF_WEIGHT      = 0.65
SERENDIPITY_RATIO   = 0.10
TAG_DECAY_FACTOR    = 0.5
DIVERSITY_THRESHOLD = 0.45

INTERACTION_WEIGHTS = {
    "like":    1.0,
    "comment": 0.85,
}

FOLLOW_BOOST = 0.12
MAX_BEHAVIOR_PENALTY = 0.22

CATEGORY_WEIGHTS = {
    "medium":             0.15,
    "subject":            0.25,
    "style":              0.25,
    "mood":               0.15,
    "color_palette":      0.10,
    "aesthetic_features": 0.10,
}


# ==========================================
# NCF MODEL
# ==========================================
class LoomNCF:
    def __init__(self, embedding_dim=EMBEDDING_DIM, lr=LEARNING_RATE, reg=REGULARIZATION):
        self.embedding_dim = embedding_dim
        self.lr = lr
        self.reg = reg
        self.user_embeddings: Dict[str, np.ndarray] = {}
        self.post_embeddings: Dict[str, np.ndarray] = {}
        self.W1 = np.random.randn(embedding_dim * 2, embedding_dim) * 0.01
        self.b1 = np.zeros(embedding_dim)
        self.W2 = np.random.randn(embedding_dim, 1) * 0.01
        self.b2 = np.zeros(1)
        self.user_interaction_counts: Dict[str, int] = defaultdict(int)

    def _get_user_emb(self, uid: str) -> np.ndarray:
        if uid not in self.user_embeddings:
            self.user_embeddings[uid] = np.random.randn(self.embedding_dim) * 0.01
        return self.user_embeddings[uid]

    def _get_post_emb(self, pid: str) -> np.ndarray:
        if pid not in self.post_embeddings:
            self.post_embeddings[pid] = np.random.randn(self.embedding_dim) * 0.01
        return self.post_embeddings[pid]

    def _forward(self, user_emb, post_emb):
        x  = np.concatenate([user_emb, post_emb])
        h1 = np.tanh(x @ self.W1 + self.b1)
        out = h1 @ self.W2 + self.b2
        score = 1 / (1 + np.exp(-out[0]))
        return score, h1, x

    def predict(self, user_id: str, post_id: str) -> float:
        score, _, _ = self._forward(self._get_user_emb(user_id), self._get_post_emb(post_id))
        return float(score)

    def update(self, user_id: str, post_id: str, interaction_type: str,
               negative_post_ids: Optional[List[str]] = None):
        label    = INTERACTION_WEIGHTS.get(interaction_type, 1.0)
        user_emb = self._get_user_emb(user_id)
        post_emb = self._get_post_emb(post_id)

        pos_score, h1, x = self._forward(user_emb, post_emb)
        err  = label - pos_score
        d_out = err * pos_score * (1 - pos_score)

        d_W2   = np.outer(h1, [d_out])
        d_b2   = np.array([d_out])
        d_h1   = (self.W2 * d_out).flatten()
        d_tanh = (1 - h1 ** 2) * d_h1
        d_W1   = np.outer(x, d_tanh)
        d_b1   = d_tanh
        d_x    = d_tanh @ self.W1.T
        d_user = d_x[:self.embedding_dim]
        d_post = d_x[self.embedding_dim:]

        self.W2     += self.lr * (d_W2   - self.reg * self.W2)
        self.b2     += self.lr * d_b2
        self.W1     += self.lr * (d_W1   - self.reg * self.W1)
        self.b1     += self.lr * d_b1
        user_emb    += self.lr * (d_user - self.reg * user_emb)
        post_emb    += self.lr * (d_post - self.reg * post_emb)

        if negative_post_ids:
            neg_id  = random.choice(negative_post_ids)
            neg_emb = self._get_post_emb(neg_id)
            neg_score, _, _ = self._forward(user_emb, neg_emb)
            bpr_grad = -1 / (1 + np.exp(pos_score - neg_score))
            post_emb += self.lr * (-bpr_grad * d_post)
            neg_emb  -= self.lr * (-bpr_grad * d_post)

        self.user_interaction_counts[user_id] = \
            self.user_interaction_counts.get(user_id, 0) + 1

    def ncf_weight(self, user_id: str) -> float:
        count = self.user_interaction_counts.get(user_id, 0)
        if count < MIN_INTERACTIONS:
            return 0.0
        alpha = MAX_NCF_WEIGHT * (1 - 1 / (1 + math.log(count - MIN_INTERACTIONS + 1)))
        return min(alpha, MAX_NCF_WEIGHT)

    # ---- Persistence ----
    def to_dict(self) -> dict:
        def enc(arr):
            buf = io.BytesIO(); np.save(buf, arr)
            return base64.b64encode(buf.getvalue()).decode()
        return {
            "embedding_dim": self.embedding_dim,
            "lr": self.lr, "reg": self.reg,
            "W1": enc(self.W1), "b1": enc(self.b1),
            "W2": enc(self.W2), "b2": enc(self.b2),
            "user_embeddings": {k: enc(v) for k, v in self.user_embeddings.items()},
            "post_embeddings": {k: enc(v) for k, v in self.post_embeddings.items()},
            "user_interaction_counts": dict(self.user_interaction_counts),
            "saved_at": datetime.utcnow().isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict):
        def dec(s):
            buf = io.BytesIO(base64.b64decode(s)); return np.load(buf, allow_pickle=False)
        m = cls(data["embedding_dim"], data["lr"], data["reg"])
        m.W1 = dec(data["W1"]); m.b1 = dec(data["b1"])
        m.W2 = dec(data["W2"]); m.b2 = dec(data["b2"])
        m.user_embeddings = {k: dec(v) for k, v in data["user_embeddings"].items()}
        m.post_embeddings = {k: dec(v) for k, v in data["post_embeddings"].items()}
        m.user_interaction_counts = defaultdict(
            int, data.get("user_interaction_counts", {}))
        return m


# Global model instance
_model = LoomNCF()


# ==========================================
# PERSISTENCE HELPERS
# ==========================================
def save_model():
    db = get_db()
    if db is None:
        return
    try:
        db["ncf_model"].update_one(
            {"_id": "loom_ncf_v1"},
            {"$set": _model.to_dict()},
            upsert=True,
        )
        logger.info("[NCF] Model saved to MongoDB")
    except Exception as e:
        logger.warning(f"[NCF] Save failed: {e}")


def load_model():
    global _model
    db = get_db()
    if db is None:
        return
    try:
        doc = db["ncf_model"].find_one({"_id": "loom_ncf_v1"})
        if doc:
            _model = LoomNCF.from_dict(doc)
            logger.info(
                f"[NCF] Loaded from MongoDB — "
                f"users: {len(_model.user_embeddings)}, "
                f"posts: {len(_model.post_embeddings)}"
            )
        else:
            logger.info("[NCF] No saved model — starting fresh")
    except Exception as e:
        logger.warning(f"[NCF] Load failed: {e}")


@app.on_event("startup")
def startup():
    load_model()


# ==========================================
# TAG AFFINITY
# ==========================================
def build_user_affinity(interaction_history: List[dict]) -> dict:
    affinity = defaultdict(lambda: defaultdict(float))
    for interaction in interaction_history:
        weight = interaction.get("weight", 1.0)
        for category, tags in interaction.get("tags", {}).items():
            if not isinstance(tags, list):
                continue
            for tag in tags:
                if isinstance(tag, dict) and "label" in tag:
                    affinity[category][tag["label"]] += tag.get("confidence", 0.5) * weight
    for category, tag_scores in affinity.items():
        total = sum(tag_scores.values())
        if total > 0:
            for label in tag_scores:
                affinity[category][label] /= total
    return affinity


def compute_tag_score(post_tags: dict, user_affinity: dict,
                      seen_tag_counts: dict, exploration: float = 0.10) -> float:
    score = 0.0
    for category, tags in post_tags.items():
        cat_weight = CATEGORY_WEIGHTS.get(category, 0.0)
        if not cat_weight or not isinstance(tags, list) or not tags:
            continue
        cat_affinity = user_affinity.get(category, {})
        cat_score = 0.0
        for tag in tags:
            if not isinstance(tag, dict):
                continue
            label = tag.get("label", "")
            conf  = tag.get("confidence", 0.5)
            aff   = cat_affinity.get(label, 0.0)
            novelty = 0.08 if label not in cat_affinity else 0.0
            t_score = conf * (0.6 + 0.4 * aff) + novelty
            times_seen = seen_tag_counts.get(label, 0)
            if times_seen > 0:
                t_score *= TAG_DECAY_FACTOR ** times_seen
            cat_score += t_score
        cat_score /= len(tags)
        score += cat_weight * cat_score
    score += random.uniform(0, exploration)
    return round(score, 4)


def compute_hybrid_score(user_id: Optional[str], post: dict,
                         user_affinity: dict, seen_tag_counts: dict,
                         exploration: float = 0.10,
                         followed_artist_ids: Optional[set] = None,
                         creator_behavior_stats: Optional[Dict[str, Dict[str, Any]]] = None) -> float:
    post_id   = str(post.get("_id", ""))
    artist_id = str(post.get("artistId", ""))
    post_tags = post.get("mlTags") or {}
    tag_score = compute_tag_score(post_tags, user_affinity, seen_tag_counts, exploration)

    # Keep recommendation complexity intact; this is a small additive preference.
    followed_boost = (
        FOLLOW_BOOST
        if followed_artist_ids and artist_id and artist_id in followed_artist_ids
        else 0.0
    )

    creator_stats = (creator_behavior_stats or {}).get(artist_id, {})
    features = creator_stats.get("behavior_features", {}) if isinstance(creator_stats, dict) else {}
    bot_score = creator_stats.get("bot_score", features.get("botScore", 0.0)) if isinstance(creator_stats, dict) else 0.0
    try:
        bot_score = float(bot_score)
    except Exception:
        bot_score = 0.0
    bot_score = min(1.0, max(0.0, bot_score))

    # Mild behavior-based downrank using already-computed telemetry features.
    # This preserves the existing recommendation complexity while using trust signals.
    try:
        fast_reply_pct = float(features.get("fastReplyPct", 0.0))
    except Exception:
        fast_reply_pct = 0.0
    try:
        circadian_flatness = float(features.get("circadianFlatness", 0.0))
    except Exception:
        circadian_flatness = 0.0
    try:
        interval_regularity = float(features.get("intervalRegularity", 0.0))
    except Exception:
        interval_regularity = 0.0

    fast_reply_pct = min(1.0, max(0.0, fast_reply_pct))
    circadian_flatness = min(1.0, max(0.0, circadian_flatness))
    interval_regularity = min(1.0, max(0.0, interval_regularity))

    suspiciousness = (
        0.60 * bot_score +
        0.15 * fast_reply_pct +
        0.15 * circadian_flatness +
        0.10 * interval_regularity
    )
    behavior_factor = 1.0 - (MAX_BEHAVIOR_PENALTY * suspiciousness)
    behavior_factor = min(1.0, max(1.0 - MAX_BEHAVIOR_PENALTY, behavior_factor))

    if not user_id or not post_id:
        return round(min(1.0, (tag_score + followed_boost) * behavior_factor), 4)

    alpha = _model.ncf_weight(user_id)
    if alpha == 0.0:
        return round(min(1.0, (tag_score + followed_boost) * behavior_factor), 4)

    ncf_score = _model.predict(user_id, post_id)
    base = alpha * ncf_score + (1 - alpha) * tag_score
    return round(min(1.0, (base + followed_boost) * behavior_factor), 4)


# ==========================================
# DIVERSITY & SERENDIPITY
# ==========================================
def tag_similarity(tags_a: Any, tags_b: Any) -> float:
    def labels(t):
        if isinstance(t, dict):
            return set(tag["label"] for v in t.values()
                       if isinstance(v, list)
                       for tag in v if isinstance(tag, dict) and "label" in tag)
        return set()
    a, b = labels(tags_a), labels(tags_b)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def assemble_feed(scored: List[dict], n: int) -> tuple:
    sorted_posts = sorted(scored, key=lambda x: x.get("score", 0), reverse=True)
    feed, seen_tag_counts = [], defaultdict(int)
    for post in sorted_posts:
        if len(feed) >= n:
            break
        tags = post.get("mlTags") or {}
        too_similar = any(
            tag_similarity(tags, fp.get("mlTags") or {}) > DIVERSITY_THRESHOLD
            for fp in feed
        )
        if too_similar:
            continue
        feed.append(post)
        if isinstance(tags, dict):
            for tag_list in tags.values():
                if isinstance(tag_list, list):
                    for tag in tag_list:
                        if isinstance(tag, dict) and "label" in tag:
                            seen_tag_counts[tag["label"]] += 1
    return feed, seen_tag_counts


def pick_serendipity(posts: List[dict], feed: List[dict], n: int) -> List[dict]:
    candidates = [p for p in posts if p not in feed]
    if not candidates:
        return []
    def dissimilarity(post):
        if not feed:
            return 1.0
        tags = post.get("mlTags") or {}
        return 1.0 - max(tag_similarity(tags, fp.get("mlTags") or {}) for fp in feed)
    candidates.sort(key=dissimilarity, reverse=True)
    return candidates[:n]


# ==========================================
# PYDANTIC SCHEMAS
# ==========================================
class RecommendRequest(BaseModel):
    posts: List[Dict[str, Any]]
    user_id: Optional[str] = None
    interaction_history: Optional[List[Dict[str, Any]]] = []
    followed_artist_ids: Optional[List[str]] = []
    viewer_behavior_stats: Optional[Dict[str, Any]] = {}
    creator_behavior_stats: Optional[Dict[str, Dict[str, Any]]] = {}
    top_n: Optional[int] = 20
    exploration_factor: Optional[float] = 0.15

class InteractionRequest(BaseModel):
    user_id: str
    post_id: str
    interaction_type: str          # "like" or "comment"
    all_post_ids: Optional[List[str]] = None


# ==========================================
# ENDPOINTS
# ==========================================
@app.get("/health")
def health():
    return {"status": "ok", "service": "loom-recommendation"}


@app.post("/recommend")
def recommend(req: RecommendRequest):
    posts      = req.posts
    user_id    = req.user_id
    top_n      = req.top_n or 20
    exploration = req.exploration_factor or 0.15

    if not posts:
        return []

    affinity = build_user_affinity(req.interaction_history or [])
    followed_artist_ids = set(req.followed_artist_ids or [])
    creator_behavior_stats = req.creator_behavior_stats or {}

    n_serendipity  = max(1, int(top_n * SERENDIPITY_RATIO))
    n_personalised = top_n - n_serendipity

    # First pass — score without tag decay
    empty_seen: dict = {}
    for post in posts:
        post["score"]      = compute_hybrid_score(
            user_id,
            post,
            affinity,
            empty_seen,
            exploration,
            followed_artist_ids,
            creator_behavior_stats,
        )
        post["ncf_weight"] = _model.ncf_weight(user_id) if user_id else 0.0

    personalised, seen_counts = assemble_feed(posts, n_personalised)

    # Second pass — re-score remainder with decay
    remaining = [p for p in posts if p not in personalised]
    for post in remaining:
        post["score"] = compute_hybrid_score(
            user_id,
            post,
            affinity,
            seen_counts,
            exploration,
            followed_artist_ids,
            creator_behavior_stats,
        )

    serendipity = pick_serendipity(remaining, personalised, n_serendipity)
    for post in serendipity:
        post["is_serendipity"] = True

    final = personalised + serendipity
    final.sort(key=lambda x: x.get("score", 0), reverse=True)
    return final


@app.post("/interaction")
def interaction(req: InteractionRequest):
    negatives = [pid for pid in (req.all_post_ids or []) if pid != req.post_id]
    _model.update(
        user_id=req.user_id,
        post_id=req.post_id,
        interaction_type=req.interaction_type,
        negative_post_ids=negatives or None,
    )
    save_model()
    logger.info(
        f"[NCF] interaction recorded — user={req.user_id}, "
        f"post={req.post_id}, type={req.interaction_type}, "
        f"total_interactions={_model.user_interaction_counts.get(req.user_id, 0)}"
    )
    return {"ok": True, "ncf_weight": _model.ncf_weight(req.user_id)}
