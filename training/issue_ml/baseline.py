from __future__ import annotations

import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

from issue_ml.constants import BODY_CHAR_LIMIT, C_GRID, LABELS, RUNS, SEED
from issue_ml.jsonutil import write_json
from issue_ml.metrics import evaluate_split, misclassified_rows, per_repository_metrics, prediction_frame
from issue_ml.preprocess import build_text


def _texts(frame: pd.DataFrame, mode: str) -> list[str]:
    return [
        build_text(title, body, mode, BODY_CHAR_LIMIT)
        for title, body in zip(frame["Title"], frame["Body"], strict=True)
    ]


def train_baseline(train_df: pd.DataFrame, val_df: pd.DataFrame, mode: str = "title_body") -> dict:
    version = "baseline-tfidf-lr-v1"
    run_dir = RUNS / version
    run_dir.mkdir(parents=True, exist_ok=True)
    train_text = _texts(train_df, mode)
    val_text = _texts(val_df, mode)
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.9,
        sublinear_tf=True,
        strip_accents="unicode",
    )
    x_train = vectorizer.fit_transform(train_text)
    x_val = vectorizer.transform(val_text)
    best = None
    tried = []
    for c_value in C_GRID:
        clf = LogisticRegression(C=c_value, max_iter=2000, solver="lbfgs", random_state=SEED)
        clf.fit(x_train, train_df["Label"])
        probabilities = _ordered_probabilities(clf, x_val)
        predicted = [LABELS[int(index)] for index in probabilities.argmax(axis=1)]
        metrics = evaluate_split(val_df["Label"].tolist(), predicted, latency_ms=0)
        tried.append({"C": c_value, "macroF1": metrics["macroF1"]})
        if best is None or metrics["macroF1"] > best["metrics"]["macroF1"]:
            best = {"C": c_value, "clf": clf, "probabilities": probabilities, "metrics": metrics}
    assert best is not None
    started = time.perf_counter()
    sample_count = min(50, len(val_text))
    for text in val_text[:sample_count]:
        best["clf"].predict_proba(vectorizer.transform([text]))
    latency_ms = (time.perf_counter() - started) * 1000 / sample_count
    best["metrics"]["latencyMs"] = latency_ms

    joblib.dump(vectorizer, run_dir / "vectorizer.joblib")
    joblib.dump(best["clf"], run_dir / "clf.joblib")
    manifest = {
        "type": "baseline",
        "version": version,
        "inputMode": mode,
        "preprocess": "raw",
        "maxLength": None,
        "bodyCharLimit": BODY_CHAR_LIMIT,
        "labelOrder": LABELS,
        "C": best["C"],
        "CGrid": list(C_GRID),
        "seed": SEED,
        "vectorizer": "tfidf-word-1-2gram",
    }
    write_json(run_dir / "manifest.json", manifest)
    predicted = prediction_frame(val_df, best["probabilities"])
    metrics = {
        **best["metrics"],
        "split": "validation",
        "perRepository": per_repository_metrics(val_df, predicted["predictedLabel"].tolist(), "validation"),
        "misclassified": misclassified_rows(predicted, "validation"),
        "C": best["C"],
        "CSearch": tried,
        "version": version,
        "inputMode": mode,
        "maxLength": None,
    }
    write_json(run_dir / "val_metrics.json", metrics)
    predicted.to_json(run_dir / "val_predictions.json", orient="records", force_ascii=False)
    return {
        "version": version,
        "runDir": str(run_dir),
        "type": "baseline",
        "inputMode": mode,
        "preprocess": "raw",
        "maxLength": None,
        "val": metrics,
        "probabilities": best["probabilities"],
        "predictions": predicted,
    }


def _ordered_probabilities(clf: LogisticRegression, features) -> np.ndarray:
    raw = clf.predict_proba(features)
    index = {label: position for position, label in enumerate(clf.classes_)}
    return np.column_stack([raw[:, index[label]] for label in LABELS])


def load_baseline_run(train_df: pd.DataFrame, val_df: pd.DataFrame, force: bool = False) -> dict:
    run_dir = RUNS / "baseline-tfidf-lr-v1"
    if not force and (run_dir / "val_metrics.json").exists() and (run_dir / "val_predictions.json").exists():
        from issue_ml.jsonutil import read_json

        metrics = read_json(run_dir / "val_metrics.json")
        predictions = pd.read_json(run_dir / "val_predictions.json")
        probabilities = predictions[[f"score_{label}" for label in LABELS]].to_numpy()
        return {
            "version": "baseline-tfidf-lr-v1",
            "runDir": str(run_dir),
            "type": "baseline",
            "inputMode": "title_body",
            "preprocess": "raw",
            "maxLength": None,
            "val": metrics,
            "probabilities": probabilities,
            "predictions": predictions,
        }
    return train_baseline(train_df, val_df)
