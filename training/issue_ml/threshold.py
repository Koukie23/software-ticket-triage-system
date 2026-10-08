from __future__ import annotations

import numpy as np


def select_threshold(y_true: list[str], probabilities: np.ndarray, labels: list[str]) -> dict:
    """Pick a review threshold on the validation set only.

    Prefer the lowest threshold whose auto-routed accuracy is at least 0.90.
    If none exists, keep the review rate at or below 40% and maximize auto accuracy.
    """
    pred_index = probabilities.argmax(axis=1)
    confidence = probabilities.max(axis=1)
    y_pred = np.array([labels[int(index)] for index in pred_index])
    truth = np.array(y_true)
    sweep = []
    for threshold in np.round(np.arange(0.40, 0.951, 0.05), 2):
        auto = confidence >= float(threshold)
        auto_count = int(auto.sum())
        auto_accuracy = float(np.mean(truth[auto] == y_pred[auto])) if auto_count else None
        sweep.append(
            {
                "threshold": float(threshold),
                "coverage": float(auto.mean()) if len(auto) else 0.0,
                "reviewRate": float(1 - auto.mean()) if len(auto) else 1.0,
                "autoAccuracy": auto_accuracy,
                "autoCount": auto_count,
            }
        )
    eligible = [row for row in sweep if row["autoAccuracy"] is not None and row["autoAccuracy"] >= 0.90]
    if eligible:
        chosen = eligible[0]
        rule = "在验证集上选取自动分流准确率不低于 0.90 的最低阈值。等于该阈值的工单自动分流，低于该阈值进入人工复核。"
    else:
        limited = [row for row in sweep if row["reviewRate"] <= 0.40 and row["autoAccuracy"] is not None]
        pool = limited or [row for row in sweep if row["autoAccuracy"] is not None]
        chosen = max(pool, key=lambda row: (row["autoAccuracy"], -row["reviewRate"]))
        rule = "验证集上没有阈值能使自动分流准确率达到 0.90，因此在复核比例不超过 40% 的阈值中选取自动分流准确率最高者。"
    return {"threshold": chosen["threshold"], "rule": rule, "sweep": sweep, "chosen": chosen}
