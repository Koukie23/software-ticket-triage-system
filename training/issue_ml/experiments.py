from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from issue_ml.baseline import load_baseline_run
from issue_ml.bert import train_distilbert
from issue_ml.constants import BERT_LENGTHS, DEPLOYED, FIGURES, LABELS, RESULTS
from issue_ml.data import load_splits
from issue_ml.inference import IssuePredictor, measure_latency, publish_run
from issue_ml.jsonutil import read_json, write_json
from issue_ml.metrics import evaluate_split, misclassified_rows, per_repository_metrics, prediction_frame
from issue_ml.threshold import select_threshold


def _macro(run: dict) -> float:
    return float(run["val"]["macroF1"])


def _latency(run: dict) -> float:
    return float(run["val"]["latencyMs"])


def _choose_length(short_run: dict, long_run: dict) -> tuple[dict, str]:
    if _macro(long_run) > _macro(short_run) + 0.005:
        return long_run, "验证集 Macro-F1 更高的是 max_length 256，因此后续对比使用 256。"
    if _macro(short_run) > _macro(long_run) + 0.005:
        return short_run, "验证集 Macro-F1 更高的是 max_length 128，因此后续对比使用 128。"
    if _latency(short_run) <= _latency(long_run):
        return short_run, "128 与 256 的验证集 Macro-F1 差距小于 0.005，选择推理更快的 128。"
    return long_run, "128 与 256 的验证集 Macro-F1 差距小于 0.005，256 推理更快，因此使用 256。"


def _choose_model(left: dict, right: dict) -> tuple[dict, str]:
    if _macro(right) > _macro(left) + 0.01:
        return right, f"{right['version']} 的验证集 Macro-F1 高出超过 0.01，选为候选模型。"
    if _macro(left) > _macro(right) + 0.01:
        return left, f"{left['version']} 的验证集 Macro-F1 高出超过 0.01，选为候选模型。"
    winner = left if _latency(left) <= _latency(right) else right
    return winner, f"两者验证集 Macro-F1 差距小于 0.01，按推理耗时选择 {winner['version']}。"


def _maybe_switch(current: dict, alternative: dict, reason_if_switch: str, reason_if_keep: str) -> tuple[dict, str]:
    if _macro(alternative) > _macro(current) + 0.005:
        return alternative, reason_if_switch
    return current, reason_if_keep


def run_experiments(force: bool = False) -> dict:
    train_df, val_df, test_df = load_splits()
    profile = read_json(RESULTS / "data_profile.json")
    baseline = load_baseline_run(train_df, val_df, force=force)
    length_runs = [
        train_distilbert(
            train_df,
            val_df,
            version=f"distilbert-title-body-raw-l{length}-v1",
            mode="title_body",
            max_length=length,
            force=force,
        )
        for length in BERT_LENGTHS
    ]
    best_length, length_reason = _choose_length(length_runs[0], length_runs[1])
    title_only = train_distilbert(
        train_df,
        val_df,
        version=f"distilbert-title-raw-l{best_length['maxLength']}-v1",
        mode="title",
        max_length=int(best_length["maxLength"]),
        force=force,
    )
    cleaned = train_distilbert(
        train_df,
        val_df,
        version=f"distilbert-title-body-clean-l{best_length['maxLength']}-v1",
        mode="title_body_clean",
        max_length=int(best_length["maxLength"]),
        force=force,
    )

    selected, model_reason = _choose_model(baseline, best_length)
    if selected["type"] == "distilbert":
        selected, input_reason = _maybe_switch(
            best_length,
            title_only,
            "仅标题的验证集 Macro-F1 比标题加正文高出至少 0.005，部署改为仅标题。",
            "仅标题没有明显更好，部署保留标题加正文。",
        )
        if selected["inputMode"] == "title_body":
            selected, clean_reason = _maybe_switch(
                selected,
                cleaned,
                "清理代码和日志后的验证集 Macro-F1 高出至少 0.005，部署改用清理文本。",
                "清理代码和日志没有明显更好，部署保留原文。",
            )
        else:
            clean_reason = "部署已经改为仅标题，不再套用正文清理。"
    else:
        input_reason = "基线模型胜出，部署输入保持标题加正文。"
        clean_reason = "基线模型胜出，不改用清理后的文本。"

    labels = selected["predictions"]["Label"].astype(str).tolist()
    threshold = select_threshold(labels, np.asarray(selected["probabilities"], dtype=float), LABELS)
    test_probabilities, test_latency = _score_split(selected, test_df)
    test_predicted = prediction_frame(test_df, test_probabilities)
    test_labels = test_predicted["predictedLabel"].tolist()
    test_metrics = evaluate_split(test_df["Label"].tolist(), test_labels, test_latency)
    test_metrics["perRepository"] = per_repository_metrics(test_df, test_labels, "test")
    test_metrics["misclassified"] = misclassified_rows(test_predicted, "test", limit=8)
    test_metrics["note"] = "测试集只在模型、输入和阈值都确定后评估一次，没有用来改模型或阈值。"

    reason = " ".join([length_reason, model_reason, input_reason, clean_reason, threshold["rule"]])
    publish_run(Path(selected["runDir"]), DEPLOYED)
    write_json(
        RESULTS / "threshold.json",
        {
            "threshold": threshold["threshold"],
            "modelVersion": selected["version"],
            "rule": threshold["rule"],
            "sweep": threshold["sweep"],
            "chosen": threshold["chosen"],
        },
    )
    _write_figures(selected, test_metrics)
    write_json(RESULTS / "demo_candidates.json", _demo_candidates(selected["predictions"], threshold["threshold"]))
    parity = _parity_check(selected)
    payload = _model_results(
        profile, baseline, length_runs, title_only, cleaned, selected, threshold, test_metrics, reason
    )
    write_json(RESULTS / "model_results.json", payload)
    write_json(RESULTS / "parity_check.json", parity)
    return payload


def _score_split(run: dict, frame: pd.DataFrame) -> tuple[np.ndarray, float]:
    predictor = IssuePredictor(Path(run["runDir"]))
    sample = list(zip(frame["Title"].astype(str).head(30), frame["Body"].astype(str).head(30), strict=True))
    latency_ms = measure_latency(lambda title, body: predictor.predict(title, body), sample)
    pairs = list(zip(frame["Title"].astype(str), frame["Body"].astype(str), strict=True))
    return predictor.predict_many(pairs), latency_ms


def _parity_check(run: dict) -> dict:
    predictor = IssuePredictor(DEPLOYED)
    checked = 0
    max_diff = 0.0
    mismatches = 0
    for record in run["predictions"].to_dict(orient="records"):
        body = str(record["Body"])
        if len(body) > 20000 or checked >= 8:
            continue
        result = predictor.predict(str(record["Title"]), body)
        expected = [float(record[f"score_{label}"]) for label in LABELS]
        actual = [result["scores"][label] for label in LABELS]
        max_diff = max(max_diff, max(abs(left - right) for left, right in zip(expected, actual, strict=True)))
        if result["label"] != record["predictedLabel"]:
            mismatches += 1
        checked += 1
    report = {"checked": checked, "maxAbsDiff": max_diff, "labelMismatches": mismatches}
    if mismatches or max_diff > 0.02:
        raise SystemExit(f"部署模型与验证预测不一致: {report}")
    return report


def _demo_candidates(predictions: pd.DataFrame, threshold: float) -> dict:
    review = predictions[predictions["confidence"] < threshold].sort_values("confidence")
    clear = []
    for label in LABELS:
        matched = predictions[
            (predictions["Label"] == label)
            & (predictions["predictedLabel"] == label)
            & (predictions["confidence"] >= threshold)
        ].sort_values("confidence", ascending=False)
        if len(matched):
            clear.append(_demo_row(matched.iloc[0]))
    return {"clear": clear, "review": [_demo_row(row) for _, row in review.head(3).iterrows()]}


def _demo_row(row: pd.Series) -> dict:
    body = str(row["Body"])
    return {
        "project": row["Repository"],
        "title": str(row["Title"])[:200],
        "body": (body[:1800] if len(body) > 1800 else body) or "No body text was available.",
        "expectedLabel": row["Label"],
        "predictedLabel": row["predictedLabel"],
        "confidence": float(row["confidence"]),
    }


def _experiment_row(run: dict) -> dict:
    val = run["val"]
    return {
        "name": run["version"],
        "split": "validation",
        "macroF1": val["macroF1"],
        "accuracy": val["accuracy"],
        "latencyMs": val["latencyMs"],
        "perClass": val["perClass"],
        "inputMode": run["inputMode"],
        "maxLength": run["maxLength"],
    }


def _model_results(profile, baseline, length_runs, title_only, cleaned, selected, threshold, test_metrics, reason) -> dict:
    comparison_length = int(title_only["maxLength"])
    raw_same_length = next(run for run in length_runs if int(run["maxLength"]) == comparison_length)
    curves = []
    for run in [*length_runs, title_only, cleaned]:
        curve = run["val"].get("curves") or []
        if curve:
            curves.append({"model": run["version"], "epochs": curve})
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "实验页数字来自离线运行。类别分数是模型输出的概率，不是已经验证的正确率。业务统计页使用另一套工单数据。",
        "dataProfile": {
            "counts": {
                "train": profile["counts"]["train"],
                "validation": profile["counts"]["validation"],
                "test": profile["counts"]["test"],
            },
            "byLabel": [row for row in profile["byLabel"] if row["split"] in {"train", "validation", "test"}],
            "byRepository": profile["byRepository"],
            "length": profile["length"],
            "missing": profile["missing"],
            "duplicates": profile["duplicates"],
            "nulBytesRemoved": profile["nulBytesRemoved"],
            "seed": profile["seed"],
            "valFraction": profile["valFraction"],
        },
        "selectedModel": {
            "version": selected["version"],
            "type": selected["type"],
            "inputMode": selected["inputMode"],
            "maxLength": selected["maxLength"],
            "reason": reason,
            "threshold": threshold["threshold"],
            "thresholdDetail": threshold["rule"],
            "thresholdSweep": threshold["sweep"],
            "valMacroF1": selected["val"]["macroF1"],
            "testMacroF1": test_metrics["macroF1"],
            "latencyMs": selected["val"]["latencyMs"],
        },
        "experiments": [
            {
                "id": "model_compare",
                "title": "模型比较",
                "purpose": "判断微调语言模型相对 TF-IDF + 逻辑回归的收益。比较使用标题加正文、保留代码和日志的设置。",
                "rows": [_experiment_row(baseline), _experiment_row(raw_same_length)],
            },
            {
                "id": "length_compare",
                "title": "输入长度",
                "purpose": "在验证集上选择 DistilBERT 的 max_length。",
                "rows": [_experiment_row(run) for run in length_runs],
            },
            {
                "id": "input_compare",
                "title": "输入比较",
                "purpose": "判断正文相对标题是否提供额外信息。",
                "rows": [_experiment_row(title_only), _experiment_row(raw_same_length)],
            },
            {
                "id": "preprocess_compare",
                "title": "预处理比较",
                "purpose": "判断去掉代码块和日志后，软件文本是否更容易分类。",
                "rows": [_experiment_row(raw_same_length), _experiment_row(cleaned)],
            },
        ],
        "curves": curves,
        "confusionMatrix": {
            "split": "validation",
            "labels": LABELS,
            "matrix": selected["val"]["confusionMatrix"],
            "title": "选定模型的验证集混淆矩阵",
        },
        "perRepository": [*selected["val"]["perRepository"], *test_metrics["perRepository"]],
        "misclassified": selected["val"]["misclassified"],
        "testEvaluation": {
            "macroF1": test_metrics["macroF1"],
            "accuracy": test_metrics["accuracy"],
            "latencyMs": test_metrics["latencyMs"],
            "perClass": test_metrics["perClass"],
            "confusionMatrix": test_metrics["confusionMatrix"],
            "misclassified": test_metrics["misclassified"],
            "note": test_metrics["note"],
        },
    }


def _write_figures(selected: dict, test_metrics: dict) -> None:
    FIGURES.mkdir(parents=True, exist_ok=True)
    _save_matrix(selected["val"]["confusionMatrix"], FIGURES / "selected_confusion_val.png", "选定模型验证集混淆矩阵")
    _save_matrix(test_metrics["confusionMatrix"], FIGURES / "selected_confusion_test.png", "选定模型测试集混淆矩阵")
    curves = selected["val"].get("curves") or []
    if not curves:
        return
    figure, axis = plt.subplots(figsize=(7, 4))
    epochs = [item["epoch"] for item in curves]
    axis.plot(epochs, [item.get("trainLoss") for item in curves], marker="o", label="训练损失")
    axis.set_xlabel("轮次")
    axis.set_ylabel("训练损失")
    other = axis.twinx()
    other.plot(epochs, [item.get("valMacroF1") for item in curves], marker="o", color="#389e0d", label="验证 Macro-F1")
    other.set_ylabel("验证 Macro-F1")
    axis.set_title(selected["version"])
    figure.tight_layout()
    figure.savefig(FIGURES / "training_curve.png", dpi=140)
    plt.close(figure)


def _save_matrix(matrix: list[list[int]], path: Path, title: str) -> None:
    array = np.asarray(matrix)
    figure, axis = plt.subplots(figsize=(5, 4))
    image = axis.imshow(array, cmap="Blues")
    axis.set_xticks(range(len(LABELS)), LABELS)
    axis.set_yticks(range(len(LABELS)), LABELS)
    axis.set_xlabel("预测")
    axis.set_ylabel("真实")
    axis.set_title(title)
    for row_index in range(array.shape[0]):
        for column_index in range(array.shape[1]):
            axis.text(column_index, row_index, str(array[row_index, column_index]), ha="center", va="center")
    figure.colorbar(image, ax=axis, fraction=0.046)
    figure.tight_layout()
    figure.savefig(path, dpi=140)
    plt.close(figure)
