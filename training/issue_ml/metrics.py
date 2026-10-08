from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from issue_ml.constants import LABELS


def per_class_metrics(y_true: list[str], y_pred: list[str]) -> dict:
    report = classification_report(
        y_true,
        y_pred,
        labels=LABELS,
        output_dict=True,
        zero_division=0,
    )
    return {
        label: {
            "precision": float(report[label]["precision"]),
            "recall": float(report[label]["recall"]),
            "f1": float(report[label]["f1-score"]),
            "support": int(report[label]["support"]),
        }
        for label in LABELS
    }


def evaluate_split(y_true: list[str], y_pred: list[str], latency_ms: float) -> dict:
    report = classification_report(
        y_true,
        y_pred,
        labels=LABELS,
        output_dict=True,
        zero_division=0,
    )
    matrix = confusion_matrix(y_true, y_pred, labels=LABELS)
    return {
        "macroF1": float(report["macro avg"]["f1-score"]),
        "accuracy": float(accuracy_score(y_true, y_pred)) if y_true else 0.0,
        "latencyMs": float(latency_ms),
        "perClass": per_class_metrics(y_true, y_pred),
        "confusionMatrix": matrix.tolist(),
    }


def per_repository_metrics(
    frame: pd.DataFrame,
    y_pred: list[str],
    split: str,
) -> list[dict]:
    rows = []
    true_labels = frame["Label"].tolist()
    repositories = frame["Repository"].tolist()
    for repository in sorted(set(repositories)):
        indexes = [i for i, repo in enumerate(repositories) if repo == repository]
        if not indexes:
            continue
        truth = [true_labels[i] for i in indexes]
        pred = [y_pred[i] for i in indexes]
        metrics = evaluate_split(truth, pred, latency_ms=0)
        rows.append(
            {
                "repository": repository,
                "split": split,
                "macroF1": metrics["macroF1"],
                "accuracy": metrics["accuracy"],
                "perClass": metrics["perClass"],
                "support": len(indexes),
            }
        )
    return rows


def prediction_frame(
    frame: pd.DataFrame,
    probabilities: np.ndarray,
) -> pd.DataFrame:
    pred_index = probabilities.argmax(axis=1)
    confidence = probabilities.max(axis=1)
    result = frame[["Repository", "Label", "Title", "Body"]].copy()
    result["predictedLabel"] = [LABELS[int(index)] for index in pred_index]
    result["confidence"] = confidence
    for label_index, label in enumerate(LABELS):
        result[f"score_{label}"] = probabilities[:, label_index]
    return result


def misclassified_rows(predicted: pd.DataFrame, split: str, limit: int = 12) -> list[dict]:
    wrong = predicted[predicted["Label"] != predicted["predictedLabel"]].sort_values(
        "confidence", ascending=False
    )
    rows = []
    for record in wrong.head(limit).to_dict(orient="records"):
        rows.append(
            {
                "split": split,
                "repository": record["Repository"],
                "title": record["Title"],
                "trueLabel": record["Label"],
                "predictedLabel": record["predictedLabel"],
                "confidence": float(record["confidence"]),
            }
        )
    return rows
