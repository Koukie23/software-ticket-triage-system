import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from issue_ml.baseline import load_baseline_run
from issue_ml.constants import DEPLOYED, RESULTS
from issue_ml.data import load_splits
from issue_ml.inference import IssuePredictor, publish_run
from issue_ml.jsonutil import read_json, write_json
from issue_ml.threshold import select_threshold
from issue_ml.constants import LABELS
import numpy as np


def main() -> None:
    train_df, val_df, _test_df = load_splits()
    run = load_baseline_run(train_df, val_df, force=False)
    labels = run["predictions"]["Label"].astype(str).tolist()
    threshold = select_threshold(labels, np.asarray(run["probabilities"], dtype=float), LABELS)
    publish_run(Path(run["runDir"]), DEPLOYED)
    write_json(RESULTS / "baseline_val.json", run["val"])
    write_json(
        RESULTS / "threshold.json",
        {
            "threshold": threshold["threshold"],
            "modelVersion": run["version"],
            "rule": threshold["rule"],
            "sweep": threshold["sweep"],
            "chosen": threshold["chosen"],
            "provisional": True,
        },
    )
    profile = read_json(RESULTS / "data_profile.json")
    write_json(
        RESULTS / "model_results.json",
        {
            "generatedAt": None,
            "provisional": True,
            "disclaimer": "当前只包含基线模型的验证结果。DistilBERT 实验完成后会覆盖本文件。测试集尚未评估。",
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
                "version": run["version"],
                "type": run["type"],
                "inputMode": run["inputMode"],
                "maxLength": run["maxLength"],
                "reason": "深度模型实验尚未完成，暂时部署 TF-IDF + 逻辑回归。" + threshold["rule"],
                "threshold": threshold["threshold"],
                "thresholdDetail": threshold["rule"],
                "thresholdSweep": threshold["sweep"],
                "valMacroF1": run["val"]["macroF1"],
                "testMacroF1": None,
                "latencyMs": run["val"]["latencyMs"],
            },
            "experiments": [
                {
                    "id": "model_compare",
                    "title": "模型比较",
                    "purpose": "基线已完成，DistilBERT 结果稍后写入。",
                    "rows": [
                        {
                            "name": run["version"],
                            "split": "validation",
                            "macroF1": run["val"]["macroF1"],
                            "accuracy": run["val"]["accuracy"],
                            "latencyMs": run["val"]["latencyMs"],
                            "perClass": run["val"]["perClass"],
                            "inputMode": run["inputMode"],
                            "maxLength": run["maxLength"],
                        }
                    ],
                }
            ],
            "curves": [],
            "confusionMatrix": {
                "split": "validation",
                "labels": LABELS,
                "matrix": run["val"]["confusionMatrix"],
                "title": "基线模型验证集混淆矩阵",
            },
            "perRepository": run["val"]["perRepository"],
            "misclassified": run["val"]["misclassified"],
            "testEvaluation": None,
        },
    )
    predictor = IssuePredictor(DEPLOYED)
    sample = predictor.predict(
        "Application crashes when opening settings",
        "Clicking the settings button throws a TypeError and the page goes blank.",
    )
    print(run["version"], "val_macro_f1", round(run["val"]["macroF1"], 4), "threshold", threshold["threshold"])
    print(sample)


if __name__ == "__main__":
    main()
