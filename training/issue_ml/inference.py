from __future__ import annotations

import shutil
import threading
import time
from pathlib import Path

import joblib
import numpy as np

from issue_ml.constants import BODY_CHAR_LIMIT, LABELS
from issue_ml.jsonutil import read_json
from issue_ml.preprocess import build_text


class IssuePredictor:
    """Load a published model once and score a title plus body."""

    def __init__(self, model_dir: Path):
        self.model_dir = Path(model_dir)
        manifest_path = self.model_dir / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"未找到模型清单: {manifest_path}")
        self.manifest = read_json(manifest_path)
        self.model_type = self.manifest["type"]
        self.version = self.manifest["version"]
        self.input_mode = self.manifest["inputMode"]
        self.body_char_limit = self.manifest.get("bodyCharLimit", BODY_CHAR_LIMIT)
        self.max_length = self.manifest.get("maxLength")
        self._lock = threading.Lock()
        if self.model_type == "baseline":
            self.vectorizer = joblib.load(self.model_dir / "vectorizer.joblib")
            self.clf = joblib.load(self.model_dir / "clf.joblib")
            self._class_index = {label: index for index, label in enumerate(self.clf.classes_)}
        elif self.model_type == "distilbert":
            import torch
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            self.torch = torch
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir / "hf")
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_dir / "hf")
            self.model.eval()
            if torch.backends.mps.is_available():
                self.device = torch.device("mps")
            elif torch.cuda.is_available():
                self.device = torch.device("cuda")
            else:
                self.device = torch.device("cpu")
            self.model.to(self.device)
        else:
            raise ValueError(f"未知模型类型: {self.model_type}")

    def predict(self, title: str, body: str) -> dict:
        probabilities = self.predict_many([(title, body)])[0]
        label_index = int(np.argmax(probabilities))
        scores = {label: float(probabilities[index]) for index, label in enumerate(LABELS)}
        return {
            "label": LABELS[label_index],
            "scores": scores,
            "modelVersion": self.version,
        }

    def predict_many(self, pairs: list[tuple[str, str]]) -> np.ndarray:
        with self._lock:
            texts = [build_text(title, body, self.input_mode, self.body_char_limit) for title, body in pairs]
            if self.model_type == "baseline":
                raw = self.clf.predict_proba(self.vectorizer.transform(texts))
                return np.column_stack([raw[:, self._class_index[label]] for label in LABELS])
            chunks = []
            batch_size = 32
            for start in range(0, len(texts), batch_size):
                encoded = self.tokenizer(
                    texts[start : start + batch_size],
                    truncation=True,
                    padding=True,
                    max_length=int(self.max_length),
                    return_tensors="pt",
                )
                encoded = {key: value.to(self.device) for key, value in encoded.items()}
                with self.torch.no_grad():
                    logits = self.model(**encoded).logits
                    chunks.append(self.torch.softmax(logits, dim=-1).cpu().numpy())
            return np.vstack(chunks)


def publish_run(run_dir: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for name in ("manifest.json", "vectorizer.joblib", "clf.joblib"):
        source = run_dir / name
        if source.exists():
            shutil.copy2(source, dest / name)
    hf_dir = run_dir / "hf"
    if hf_dir.exists():
        shutil.copytree(hf_dir, dest / "hf")


def measure_latency(predict_one, samples: list[tuple[str, str]]) -> float:
    if not samples:
        return 0.0
    started = time.perf_counter()
    for title, body in samples:
        predict_one(title, body)
    return (time.perf_counter() - started) * 1000 / len(samples)
