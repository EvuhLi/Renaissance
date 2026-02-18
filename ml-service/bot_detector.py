"""
Comprehensive Bot Detection System for Loom
============================================

Combines:
- Neural network (2-layer MLP with dropout)
- Logistic regression baseline
- Rule-based heuristics
- Ensemble voting
- Honeypot feature detection
- Feature importance analysis
- Training data balancing (SMOTE-like)

This file is intentionally not wired into any API route yet.
Use it offline to train/evaluate and persist model params.

Usage:
    from bot_detection import EnsembleBotDetector, build_balanced_dataset
    
    # Training
    detector = EnsembleBotDetector()
    X, y = build_balanced_dataset(training_rows)
    metrics = detector.fit(X, y)
    detector.save("bot_model.json")
    
    # Inference
    detector = EnsembleBotDetector.load("bot_model.json")
    result = detector.predict(user_behavior_features)
    # result = {"bot_probability": 0.87, "confidence": 0.92, "flags": [...]}
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple
import json
import math
import pathlib

import numpy as np


# ==========================================
# FEATURE SCHEMA
# ==========================================

FEATURE_KEYS = [
    # ── Temporal patterns ──
    "eventCount",                 # Total interactions (log-scaled)
    "intervalMeanSec",            # Mean time between actions
    "temporalCV",                 # Coefficient of variation (std/mean) — humans are irregular
    "intervalRegularity",         # How machine-like the timing is (0-1)
    "circadianStrength",          # FFT-based circadian rhythm score
    "maxInactivityGapHours",      # Longest break (humans sleep)
    "midnightActivityRatio",      # Activity 1-5am / total (bots don't sleep)
    "weekendActivityRatio",       # Weekend / weekday ratio
    "burstinessScore",            # Sudden activity spikes (Gini coefficient)
    "sessionDurationMean",        # Average session length
    "sessionDurationStd",         # Session variance
    
    # ── Content interaction ──
    "avgTimeOnPost",              # Mean dwell time per post
    "stdTimeOnPost",              # Dwell time variance
    "rapidScrollPct",             # % posts viewed < 2 seconds (bot speed-scrolling)
    "completionRate",             # % posts scrolled to bottom
    "uniquePostRatio",            # Unique posts / total views (bots repeat)
    
    # ── Social patterns ──
    "replyCount",                 # Total replies (log-scaled)
    "fastReplyPct",               # % replies < 5 seconds
    "likeCommentRatio",           # Likes / comments (bots like more than comment)
    "repeatInteractionPct",       # % interactions with same users (bot farms)
    "diversityScore",             # Entropy of interaction targets
    "copyPasteCommentPct",        # % identical comments (requires text analysis)
    
    # ── Navigation patterns ──
    "directNavigationPct",        # % direct links vs organic feed browsing
    "backtrackRate",              # How often user goes back
    "depthOfBrowsing",            # Average page depth
    
    # ── Honeypot signals ──
    "invisibleInteractionCount",  # Clicked invisible elements (bots scrape DOM)
    "rapidFormFillCount",         # Filled forms < 1 sec (bots autofill)
    "cssHoneypotTriggers",        # Interacted with CSS-hidden elements
    "mouseMovementEntropy",       # Randomness of mouse movement (0 = bot)
    "keystrokeDynamicsScore",     # Typing rhythm score (requires frontend tracking)
    
    # ── Legacy/heuristic ──
    "botScore",                   # Existing heuristic score (kept as feature)
]


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def _safe_float(v: Any, default: float = 0.0) -> float:
    """Safely convert to float with fallback."""
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def behavior_features_to_vector(behavior_features: Dict[str, Any] | None) -> np.ndarray:
    """
    Convert behavior dict to fixed-length numpy vector for ML model.
    Applies log-scaling to count features and computes derived features.
    """
    f = behavior_features or {}
    
    # ── Raw counts (log-scaled) ──
    event_count = math.log1p(max(0.0, _safe_float(f.get("eventCount"), 0.0)))
    reply_count = math.log1p(max(0.0, _safe_float(f.get("replyCount"), 0.0)))
    
    # ── Derived: Coefficient of Variation (temporal irregularity) ──
    interval_mean = _safe_float(f.get("intervalMeanSec"), 1.0)
    interval_std = _safe_float(f.get("intervalStdSec"), 0.0)
    temporal_cv = interval_std / max(1.0, interval_mean)
    
    # ── Derived: Like/Comment ratio (bots like but don't comment) ──
    like_count = _safe_float(f.get("likeCount"), 0.0)
    comment_count = _safe_float(f.get("commentCount"), 1.0)
    like_comment_ratio = like_count / max(1.0, comment_count)
    
    vector = np.array([
        # Temporal
        event_count,
        interval_mean,
        temporal_cv,
        _safe_float(f.get("intervalRegularity"), 0.0),
        _safe_float(f.get("circadianStrength"), 0.0),
        _safe_float(f.get("maxInactivityGapHours"), 0.0),
        _safe_float(f.get("midnightActivityRatio"), 0.0),
        _safe_float(f.get("weekendActivityRatio"), 0.5),  # Default 0.5 = balanced
        _safe_float(f.get("burstinessScore"), 0.0),
        _safe_float(f.get("sessionDurationMean"), 0.0),
        _safe_float(f.get("sessionDurationStd"), 0.0),
        
        # Content
        _safe_float(f.get("avgTimeOnPost"), 0.0),
        _safe_float(f.get("stdTimeOnPost"), 0.0),
        _safe_float(f.get("rapidScrollPct"), 0.0),
        _safe_float(f.get("completionRate"), 0.0),
        _safe_float(f.get("uniquePostRatio"), 1.0),
        
        # Social
        reply_count,
        _safe_float(f.get("fastReplyPct"), 0.0),
        like_comment_ratio,
        _safe_float(f.get("repeatInteractionPct"), 0.0),
        _safe_float(f.get("diversityScore"), 0.0),
        _safe_float(f.get("copyPasteCommentPct"), 0.0),
        
        # Navigation
        _safe_float(f.get("directNavigationPct"), 0.0),
        _safe_float(f.get("backtrackRate"), 0.0),
        _safe_float(f.get("depthOfBrowsing"), 1.0),
        
        # Honeypot
        math.log1p(_safe_float(f.get("invisibleInteractionCount"), 0.0)),
        math.log1p(_safe_float(f.get("rapidFormFillCount"), 0.0)),
        math.log1p(_safe_float(f.get("cssHoneypotTriggers"), 0.0)),
        _safe_float(f.get("mouseMovementEntropy"), 0.5),
        _safe_float(f.get("keystrokeDynamicsScore"), 0.5),
        
        # Legacy
        _safe_float(f.get("botScore"), 0.0),
    ], dtype=np.float32)
    
    return vector


def account_doc_to_vector(account_doc: Dict[str, Any]) -> np.ndarray:
    """Convert MongoDB account document to feature vector."""
    behavior = dict(account_doc.get("behaviorFeatures") or {})
    behavior.setdefault("botScore", account_doc.get("botScore", 0.0))
    return behavior_features_to_vector(behavior)


# ==========================================
# NEURAL NETWORK DETECTOR
# ==========================================

@dataclass
class NeuralBotDetector:
    """
    Two-layer MLP with dropout and early stopping.
    More expressive than logistic regression for complex patterns.
    """
    hidden_dim: int = 48
    lr: float = 0.01
    reg: float = 1e-4
    dropout: float = 0.3
    epochs: int = 1000
    patience: int = 50

    def __post_init__(self) -> None:
        self.W1: np.ndarray | None = None
        self.b1: np.ndarray | None = None
        self.W2: np.ndarray | None = None
        self.b2: float = 0.0
        self.mu: np.ndarray | None = None
        self.sigma: np.ndarray | None = None

    @staticmethod
    def _relu(x: np.ndarray) -> np.ndarray:
        return np.maximum(0, x)

    @staticmethod
    def _sigmoid(z: np.ndarray) -> np.ndarray:
        z = np.clip(z, -40.0, 40.0)
        return 1.0 / (1.0 + np.exp(-z))

    def _normalize_fit(self, X: np.ndarray) -> np.ndarray:
        self.mu = X.mean(axis=0)
        self.sigma = X.std(axis=0) + 1e-6
        return (X - self.mu) / self.sigma

    def _normalize_apply(self, X: np.ndarray) -> np.ndarray:
        if self.mu is None or self.sigma is None:
            raise RuntimeError("Model not fitted")
        return (X - self.mu) / self.sigma

    def _forward(self, X: np.ndarray, training: bool = False) -> Tuple[np.ndarray, np.ndarray]:
        h = self._relu(X @ self.W1 + self.b1)
        
        if training:
            mask = np.random.binomial(1, 1 - self.dropout, size=h.shape)
            h = h * mask / (1 - self.dropout)
        
        logits = h @ self.W2 + self.b2
        probs = self._sigmoid(logits).flatten()
        return probs, h

    def fit(self, X: np.ndarray, y: np.ndarray, val_split: float = 0.2) -> Dict[str, float]:
        if X.shape[0] == 0:
            raise ValueError("Empty training set")
        
        # Train/val split
        n = X.shape[0]
        n_val = max(1, int(n * val_split))
        indices = np.random.permutation(n)
        
        X_train, y_train = X[indices[n_val:]], y[indices[n_val:]]
        X_val, y_val = X[indices[:n_val]], y[indices[:n_val]]
        
        Xn_train = self._normalize_fit(X_train)
        Xn_val = self._normalize_apply(X_val)
        
        n_train, d = Xn_train.shape
        
        # Xavier initialization
        self.W1 = np.random.randn(d, self.hidden_dim).astype(np.float32) * np.sqrt(2.0 / d)
        self.b1 = np.zeros(self.hidden_dim, dtype=np.float32)
        self.W2 = np.random.randn(self.hidden_dim, 1).astype(np.float32) * np.sqrt(2.0 / self.hidden_dim)
        self.b2 = 0.0
        
        y_train = y_train.astype(np.float32)
        y_val = y_val.astype(np.float32)
        
        best_val_loss = float('inf')
        patience_counter = 0
        
        for epoch in range(self.epochs):
            # Forward
            probs, h = self._forward(Xn_train, training=True)
            
            # Loss
            eps = 1e-8
            loss = -np.mean(y_train * np.log(probs + eps) + (1 - y_train) * np.log(1 - probs + eps))
            
            # Backprop
            d_probs = (probs - y_train) / n_train
            d_W2 = (h.T @ d_probs.reshape(-1, 1)) + self.reg * self.W2
            d_b2 = float(d_probs.sum())
            d_h = d_probs.reshape(-1, 1) @ self.W2.T
            d_h[h <= 0] = 0  # ReLU gradient
            d_W1 = Xn_train.T @ d_h + self.reg * self.W1
            d_b1 = d_h.sum(axis=0)
            
            # Update
            self.W1 -= self.lr * d_W1
            self.b1 -= self.lr * d_b1
            self.W2 -= self.lr * d_W2
            self.b2 -= self.lr * d_b2
            
            # Early stopping
            if epoch % 10 == 0:
                val_probs, _ = self._forward(Xn_val, training=False)
                val_loss = -np.mean(y_val * np.log(val_probs + eps) + (1 - y_val) * np.log(1 - val_probs + eps))
                
                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                    patience_counter = 0
                else:
                    patience_counter += 1
                
                if patience_counter >= self.patience:
                    break
        
        train_probs, _ = self._forward(Xn_train, training=False)
        val_probs, _ = self._forward(Xn_val, training=False)
        
        return {
            "train_loss": float(loss),
            "train_acc": float(((train_probs >= 0.5) == y_train).mean()),
            "val_loss": float(best_val_loss),
            "val_acc": float(((val_probs >= 0.5) == y_val).mean()),
        }

    def predict_proba_matrix(self, X: np.ndarray) -> np.ndarray:
        if self.W1 is None:
            raise RuntimeError("Model not fitted")
        Xn = self._normalize_apply(X)
        probs, _ = self._forward(Xn, training=False)
        return probs

    def predict_proba(self, behavior_features: Dict[str, Any] | None) -> float:
        x = behavior_features_to_vector(behavior_features).reshape(1, -1)
        return float(self.predict_proba_matrix(x)[0])

    def to_dict(self) -> Dict[str, Any]:
        if self.W1 is None:
            raise RuntimeError("Model not fitted")
        return {
            "type": "neural",
            "hidden_dim": self.hidden_dim,
            "lr": self.lr,
            "reg": self.reg,
            "dropout": self.dropout,
            "W1": self.W1.tolist(),
            "b1": self.b1.tolist(),
            "W2": self.W2.tolist(),
            "b2": self.b2,
            "mu": self.mu.tolist(),
            "sigma": self.sigma.tolist(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "NeuralBotDetector":
        model = cls(
            hidden_dim=int(data.get("hidden_dim", 48)),
            lr=float(data.get("lr", 0.01)),
            reg=float(data.get("reg", 1e-4)),
            dropout=float(data.get("dropout", 0.3)),
        )
        model.W1 = np.array(data["W1"], dtype=np.float32)
        model.b1 = np.array(data["b1"], dtype=np.float32)
        model.W2 = np.array(data["W2"], dtype=np.float32)
        model.b2 = float(data["b2"])
        model.mu = np.array(data["mu"], dtype=np.float32)
        model.sigma = np.array(data["sigma"], dtype=np.float32)
        return model


# ==========================================
# LOGISTIC REGRESSION BASELINE
# ==========================================

@dataclass
class LogisticBotDetector:
    """Fast logistic regression baseline for comparison."""
    lr: float = 0.05
    reg: float = 1e-4
    epochs: int = 700

    def __post_init__(self) -> None:
        self.w: np.ndarray | None = None
        self.b: float = 0.0
        self.mu: np.ndarray | None = None
        self.sigma: np.ndarray | None = None

    @staticmethod
    def _sigmoid(z: np.ndarray) -> np.ndarray:
        z = np.clip(z, -40.0, 40.0)
        return 1.0 / (1.0 + np.exp(-z))

    def _normalize_fit(self, X: np.ndarray) -> np.ndarray:
        self.mu = X.mean(axis=0)
        self.sigma = X.std(axis=0) + 1e-6
        return (X - self.mu) / self.sigma

    def _normalize_apply(self, X: np.ndarray) -> np.ndarray:
        if self.mu is None or self.sigma is None:
            raise RuntimeError("Model not fitted")
        return (X - self.mu) / self.sigma

    def fit(self, X: np.ndarray, y: np.ndarray) -> Dict[str, float]:
        if X.shape[0] == 0:
            raise ValueError("Empty training set")
        
        Xn = self._normalize_fit(X)
        n, d = Xn.shape
        self.w = np.zeros(d, dtype=np.float32)
        self.b = 0.0
        y = y.astype(np.float32)

        for _ in range(self.epochs):
            logits = Xn @ self.w + self.b
            p = self._sigmoid(logits)
            err = p - y
            self.w -= self.lr * ((Xn.T @ err) / n + self.reg * self.w)
            self.b -= self.lr * float(err.mean())

        probs = self.predict_proba_matrix(X)
        eps = 1e-8
        loss = float(-np.mean(y * np.log(probs + eps) + (1 - y) * np.log(1 - probs + eps)))
        acc = float(((probs >= 0.5) == y).mean())
        return {"loss": loss, "accuracy": acc}

    def predict_proba_matrix(self, X: np.ndarray) -> np.ndarray:
        if self.w is None:
            raise RuntimeError("Model not fitted")
        return self._sigmoid(self._normalize_apply(X) @ self.w + self.b)

    def predict_proba(self, behavior_features: Dict[str, Any] | None) -> float:
        x = behavior_features_to_vector(behavior_features).reshape(1, -1)
        return float(self.predict_proba_matrix(x)[0])

    def to_dict(self) -> Dict[str, Any]:
        if self.w is None:
            raise RuntimeError("Model not fitted")
        return {
            "type": "logistic",
            "lr": self.lr,
            "reg": self.reg,
            "w": self.w.tolist(),
            "b": self.b,
            "mu": self.mu.tolist(),
            "sigma": self.sigma.tolist(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LogisticBotDetector":
        model = cls(lr=float(data.get("lr", 0.05)), reg=float(data.get("reg", 1e-4)))
        model.w = np.array(data["w"], dtype=np.float32)
        model.b = float(data["b"])
        model.mu = np.array(data["mu"], dtype=np.float32)
        model.sigma = np.array(data["sigma"], dtype=np.float32)
        return model


# ==========================================
# RULE-BASED DETECTOR
# ==========================================

class RuleBasedDetector:
    """
    Hard-coded rules for obvious bot patterns.
    High precision, low recall — used as ensemble component.
    """
    
    def compute_score(self, features: Dict[str, Any]) -> Tuple[float, List[str]]:
        """Returns (score, [list of triggered flags])"""
        score = 0.0
        flags = []
        
        # ── Temporal red flags ──
        if _safe_float(features.get("intervalRegularity")) > 0.95:
            score += 0.25
            flags.append("machine_like_timing")
        
        if _safe_float(features.get("midnightActivityRatio")) > 0.5:
            score += 0.15
            flags.append("nocturnal_activity")
        
        if _safe_float(features.get("maxInactivityGapHours")) < 2.0:
            score += 0.10
            flags.append("no_sleep_detected")
        
        # ── Interaction red flags ──
        if _safe_float(features.get("fastReplyPct")) > 0.8:
            score += 0.20
            flags.append("superhuman_reply_speed")
        
        if _safe_float(features.get("avgTimeOnPost")) < 1.0:
            score += 0.15
            flags.append("impossible_read_speed")
        
        like_comment_ratio = _safe_float(features.get("likeCommentRatio"))
        if like_comment_ratio > 10:
            score += 0.15
            flags.append("excessive_likes_no_comments")
        
        if _safe_float(features.get("copyPasteCommentPct")) > 0.5:
            score += 0.20
            flags.append("repetitive_comments")
        
        # ── Honeypot triggers (CRITICAL) ──
        if _safe_float(features.get("invisibleInteractionCount")) > 0:
            score += 0.30
            flags.append("HONEYPOT_invisible_click")
        
        if _safe_float(features.get("cssHoneypotTriggers")) > 0:
            score += 0.30
            flags.append("HONEYPOT_css_hidden_interaction")
        
        if _safe_float(features.get("rapidFormFillCount")) > 2:
            score += 0.25
            flags.append("HONEYPOT_instant_form_fill")
        
        if _safe_float(features.get("mouseMovementEntropy")) < 0.1:
            score += 0.20
            flags.append("no_mouse_movement_variance")
        
        # ── Navigation patterns ──
        if _safe_float(features.get("directNavigationPct")) > 0.9:
            score += 0.10
            flags.append("scripted_navigation")
        
        return min(1.0, score), flags


# ==========================================
# ENSEMBLE DETECTOR
# ==========================================

@dataclass
class EnsembleBotDetector:
    """
    Combines neural, logistic, and rule-based detectors.
    Returns consensus prediction with confidence score.
    """
    neural_weight: float = 0.50
    logistic_weight: float = 0.30
    rule_weight: float = 0.20
    
    def __post_init__(self):
        self.neural = NeuralBotDetector()
        self.logistic = LogisticBotDetector()
        self.rules = RuleBasedDetector()
    
    def fit(self, X: np.ndarray, y: np.ndarray) -> Dict[str, Any]:
        """Train all sub-models."""
        neural_metrics = self.neural.fit(X, y)
        logistic_metrics = self.logistic.fit(X, y)
        
        return {
            "neural": neural_metrics,
            "logistic": logistic_metrics,
        }
    
    def predict(self, behavior_features: Dict[str, Any] | None, 
                threshold: float = 0.5) -> Dict[str, Any]:
        """
        Full prediction with breakdown.
        
        Returns:
            {
                "bot_probability": float,
                "is_bot": bool,
                "confidence": float,  # How much models agree
                "neural_score": float,
                "logistic_score": float,
                "rule_score": float,
                "rule_flags": [str],  # Triggered rule names
                "recommendation": str,  # "allow" | "flag" | "block"
            }
        """
        neural_score = self.neural.predict_proba(behavior_features)
        logistic_score = self.logistic.predict_proba(behavior_features)
        rule_score, flags = self.rules.compute_score(behavior_features or {})
        
        # Weighted ensemble
        final_score = (
            self.neural_weight * neural_score +
            self.logistic_weight * logistic_score +
            self.rule_weight * rule_score
        )
        
        # Confidence: models agree = high confidence
        scores = [neural_score, logistic_score, rule_score]
        confidence = 1.0 - float(np.std(scores))
        
        # Recommendation
        if final_score >= 0.85 and confidence >= 0.7:
            recommendation = "block"
        elif final_score >= threshold:
            recommendation = "flag"  # Show CAPTCHA
        else:
            recommendation = "allow"
        
        return {
            "bot_probability": float(final_score),
            "is_bot": final_score >= threshold,
            "confidence": float(confidence),
            "neural_score": float(neural_score),
            "logistic_score": float(logistic_score),
            "rule_score": float(rule_score),
            "rule_flags": flags,
            "recommendation": recommendation,
        }
    
    def predict_proba(self, behavior_features: Dict[str, Any] | None) -> float:
        """Just return the probability (for compatibility)."""
        return self.predict(behavior_features)["bot_probability"]
    
    def save(self, path: str | pathlib.Path) -> None:
        """Save all models to JSON."""
        p = pathlib.Path(path)
        payload = {
            "feature_keys": FEATURE_KEYS,
            "weights": {
                "neural": self.neural_weight,
                "logistic": self.logistic_weight,
                "rule": self.rule_weight,
            },
            "neural": self.neural.to_dict(),
            "logistic": self.logistic.to_dict(),
        }
        p.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    
    @classmethod
    def load(cls, path: str | pathlib.Path) -> "EnsembleBotDetector":
        """Load all models from JSON."""
        p = pathlib.Path(path)
        data = json.loads(p.read_text(encoding="utf-8"))
        
        weights = data.get("weights", {})
        ensemble = cls(
            neural_weight=float(weights.get("neural", 0.5)),
            logistic_weight=float(weights.get("logistic", 0.3)),
            rule_weight=float(weights.get("rule", 0.2)),
        )
        
        ensemble.neural = NeuralBotDetector.from_dict(data["neural"])
        ensemble.logistic = LogisticBotDetector.from_dict(data["logistic"])
        
        return ensemble


# ==========================================
# TRAINING DATA UTILITIES
# ==========================================

def build_training_dataset(rows: Iterable[Dict[str, Any]]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Convert training rows to (X, y) arrays.
    
    rows entries should contain:
    - behaviorFeatures (dict) and/or botScore (number)
    - label (0/1) OR account_type in {"human","bot"} OR isBot boolean
    """
    X: List[np.ndarray] = []
    y: List[float] = []

    for row in rows:
        label = row.get("label", None)
        if label is None:
            if isinstance(row.get("isBot"), bool):
                label = 1 if row["isBot"] else 0
            else:
                account_type = str(row.get("account_type", "")).lower()
                if account_type == "bot":
                    label = 1
                elif account_type == "human":
                    label = 0
        if label is None:
            continue

        behavior = dict(row.get("behaviorFeatures") or {})
        behavior.setdefault("botScore", row.get("botScore", 0.0))
        X.append(behavior_features_to_vector(behavior))
        y.append(float(label))

    if not X:
        return np.empty((0, len(FEATURE_KEYS)), dtype=np.float32), np.empty((0,), dtype=np.float32)
    return np.vstack(X), np.array(y, dtype=np.float32)


def build_balanced_dataset(rows: Iterable[Dict[str, Any]], 
                           oversample: bool = True) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build balanced dataset with synthetic oversampling (SMOTE-like).
    Prevents model from just predicting majority class.
    """
    X, y = build_training_dataset(rows)
    
    if not oversample or len(y) == 0:
        return X, y
    
    n_bots = int(y.sum())
    n_humans = len(y) - n_bots
    
    if n_bots == 0 or n_humans == 0:
        return X, y
    
    # Oversample minority class
    if n_bots < n_humans:
        bot_indices = np.where(y == 1)[0]
        n_synthetic = n_humans - n_bots
        
        synthetic_X = []
        for _ in range(n_synthetic):
            idx = np.random.choice(bot_indices)
            noise = np.random.normal(0, 0.05, X.shape[1])
            synthetic_X.append(X[idx] + noise)
        
        X = np.vstack([X, np.array(synthetic_X)])
        y = np.concatenate([y, np.ones(n_synthetic)])
    else:
        human_indices = np.where(y == 0)[0]
        n_synthetic = n_bots - n_humans
        
        synthetic_X = []
        for _ in range(n_synthetic):
            idx = np.random.choice(human_indices)
            noise = np.random.normal(0, 0.05, X.shape[1])
            synthetic_X.append(X[idx] + noise)
        
        X = np.vstack([X, np.array(synthetic_X)])
        y = np.concatenate([y, np.zeros(n_synthetic)])
    
    # Shuffle
    indices = np.random.permutation(len(y))
    return X[indices], y[indices]


# ==========================================
# EVALUATION UTILITIES
# ==========================================

def evaluate_model(model: Any, X_test: np.ndarray, y_test: np.ndarray) -> Dict[str, Any]:
    """
    Comprehensive evaluation metrics.
    
    Critical for production:
    - Keep FALSE POSITIVE RATE low (don't ban humans)
    - Maximize RECALL for high-confidence bots
    """
    if hasattr(model, 'predict_proba_matrix'):
        probs = model.predict_proba_matrix(X_test)
    else:
        probs = np.array([model.predict_proba(None) for _ in range(len(X_test))])
    
    preds = (probs >= 0.5).astype(int)
    
    # Confusion matrix
    tp = ((preds == 1) & (y_test == 1)).sum()
    fp = ((preds == 1) & (y_test == 0)).sum()
    tn = ((preds == 0) & (y_test == 0)).sum()
    fn = ((preds == 0) & (y_test == 1)).sum()
    
    accuracy = (preds == y_test).mean()
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0  # CRITICAL: keep this LOW
    
    return {
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "f1_score": float(f1),
        "false_positive_rate": float(fpr),  # <0.05 target for production
        "confusion_matrix": {
            "true_positives": int(tp),
            "false_positives": int(fp),
            "true_negatives": int(tn),
            "false_negatives": int(fn),
        }
    }


def analyze_feature_importance(model: LogisticBotDetector) -> Dict[str, float]:
    """
    Analyze which features matter most (logistic regression only).
    Use this to guide feature engineering and data collection priorities.
    """
    if model.w is None:
        raise RuntimeError("Model not fitted")
    
    importance = np.abs(model.w)
    importance = importance / importance.sum()
    
    return dict(sorted(
        zip(FEATURE_KEYS, importance.tolist()),
        key=lambda x: x[1],
        reverse=True
    ))


# ==========================================
# EXAMPLE USAGE
# ==========================================

if __name__ == "__main__":
    # Example training workflow
    
    # Simulated training data
    fake_training_data = [
        # Bots
        {"behaviorFeatures": {"eventCount": 500, "intervalRegularity": 0.98, "midnightActivityRatio": 0.7,
                              "invisibleInteractionCount": 3}, "isBot": True},
        {"behaviorFeatures": {"fastReplyPct": 0.95, "avgTimeOnPost": 0.5, "likeCommentRatio": 20}, "isBot": True},
        
        # Humans
        {"behaviorFeatures": {"eventCount": 50, "intervalRegularity": 0.3, "midnightActivityRatio": 0.1,
                              "maxInactivityGapHours": 8, "mouseMovementEntropy": 0.7}, "isBot": False},
        {"behaviorFeatures": {"avgTimeOnPost": 15, "completionRate": 0.6, "diversityScore": 0.8}, "isBot": False},
    ]
    
    X, y = build_balanced_dataset(fake_training_data)
    
    print(f"Training samples: {len(y)} (bots: {int(y.sum())}, humans: {len(y) - int(y.sum())})")
    
    detector = EnsembleBotDetector()
    metrics = detector.fit(X, y)
    
    print("\nTraining metrics:")
    print(f"  Neural: acc={metrics['neural']['val_acc']:.3f}")
    print(f"  Logistic: acc={metrics['logistic']['accuracy']:.3f}")
    
    # Save model
    detector.save("bot_detector_model.json")
    print("\nModel saved to bot_detector_model.json")
    
    # Test prediction
    test_behavior = {
        "eventCount": 200,
        "intervalRegularity": 0.85,
        "fastReplyPct": 0.9,
        "invisibleInteractionCount": 1,
        "midnightActivityRatio": 0.6,
    }
    
    result = detector.predict(test_behavior)
    print(f"\nTest prediction:")
    print(f"  Bot probability: {result['bot_probability']:.2%}")
    print(f"  Confidence: {result['confidence']:.2%}")
    print(f"  Recommendation: {result['recommendation']}")
    print(f"  Flags: {result['rule_flags']}")