"""
Standalone bot-detection ML module for Loom behavior telemetry.

This file is intentionally not wired into any API route yet.
Use it offline to train/evaluate and persist model params.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple
import json
import math
import pathlib

import numpy as np


FEATURE_KEYS = [
    "eventCount",
    "intervalMeanSec",
    "intervalStdSec",
    "intervalRegularity",
    "circadianFlatness",
    "maxInactivityGapHours",
    "replyCount",
    "fastReplyPct",
    "botScore",
]


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def behavior_features_to_vector(behavior_features: Dict[str, Any] | None) -> np.ndarray:
    f = behavior_features or {}
    event_count = _safe_float(f.get("eventCount"), 0.0)
    reply_count = _safe_float(f.get("replyCount"), 0.0)

    # Log-scale count-like values to reduce outlier dominance.
    vector = np.array(
        [
            math.log1p(max(0.0, event_count)),
            _safe_float(f.get("intervalMeanSec"), 0.0),
            _safe_float(f.get("intervalStdSec"), 0.0),
            _safe_float(f.get("intervalRegularity"), 0.0),
            _safe_float(f.get("circadianFlatness"), 0.0),
            _safe_float(f.get("maxInactivityGapHours"), 0.0),
            math.log1p(max(0.0, reply_count)),
            _safe_float(f.get("fastReplyPct"), 0.0),
            _safe_float(f.get("botScore"), 0.0),
        ],
        dtype=np.float32,
    )
    return vector


def account_doc_to_vector(account_doc: Dict[str, Any]) -> np.ndarray:
    behavior = dict(account_doc.get("behaviorFeatures") or {})
    # Keep compatibility with backend field naming.
    behavior.setdefault("botScore", account_doc.get("botScore", 0.0))
    return behavior_features_to_vector(behavior)


@dataclass
class LogisticBotDetector:
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
            raise RuntimeError("Model is not fitted.")
        return (X - self.mu) / self.sigma

    def fit(self, X: np.ndarray, y: np.ndarray) -> Dict[str, float]:
        if X.ndim != 2:
            raise ValueError("X must be a 2D matrix.")
        if y.ndim != 1:
            raise ValueError("y must be a 1D vector.")
        if X.shape[0] != y.shape[0]:
            raise ValueError("X and y row counts must match.")
        if X.shape[0] == 0:
            raise ValueError("Empty training set.")

        Xn = self._normalize_fit(X)
        n, d = Xn.shape
        self.w = np.zeros(d, dtype=np.float32)
        self.b = 0.0

        y = y.astype(np.float32)

        for _ in range(self.epochs):
            logits = Xn @ self.w + self.b
            p = self._sigmoid(logits)
            err = p - y

            grad_w = (Xn.T @ err) / n + self.reg * self.w
            grad_b = float(err.mean())

            self.w -= self.lr * grad_w
            self.b -= self.lr * grad_b

        probs = self.predict_proba_matrix(X)
        eps = 1e-8
        loss = float(-np.mean(y * np.log(probs + eps) + (1 - y) * np.log(1 - probs + eps)))
        acc = float(((probs >= 0.5).astype(np.float32) == y).mean())
        return {"loss": loss, "accuracy": acc}

    def predict_proba_matrix(self, X: np.ndarray) -> np.ndarray:
        if self.w is None:
            raise RuntimeError("Model is not fitted.")
        Xn = self._normalize_apply(X)
        return self._sigmoid(Xn @ self.w + self.b)

    def predict_proba(self, behavior_features: Dict[str, Any] | None) -> float:
        x = behavior_features_to_vector(behavior_features).reshape(1, -1)
        return float(self.predict_proba_matrix(x)[0])

    def predict_label(self, behavior_features: Dict[str, Any] | None, threshold: float = 0.5) -> int:
        return int(self.predict_proba(behavior_features) >= threshold)

    def to_dict(self) -> Dict[str, Any]:
        if self.w is None or self.mu is None or self.sigma is None:
            raise RuntimeError("Model is not fitted.")
        return {
            "feature_keys": FEATURE_KEYS,
            "lr": self.lr,
            "reg": self.reg,
            "epochs": self.epochs,
            "w": self.w.tolist(),
            "b": self.b,
            "mu": self.mu.tolist(),
            "sigma": self.sigma.tolist(),
        }

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "LogisticBotDetector":
        model = cls(
            lr=float(payload.get("lr", 0.05)),
            reg=float(payload.get("reg", 1e-4)),
            epochs=int(payload.get("epochs", 700)),
        )
        model.w = np.array(payload["w"], dtype=np.float32)
        model.b = float(payload["b"])
        model.mu = np.array(payload["mu"], dtype=np.float32)
        model.sigma = np.array(payload["sigma"], dtype=np.float32)
        return model

    def save(self, path: str | pathlib.Path) -> None:
        p = pathlib.Path(path)
        p.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str | pathlib.Path) -> "LogisticBotDetector":
        p = pathlib.Path(path)
        return cls.from_dict(json.loads(p.read_text(encoding="utf-8")))


def build_training_dataset(rows: Iterable[Dict[str, Any]]) -> Tuple[np.ndarray, np.ndarray]:
    """
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
