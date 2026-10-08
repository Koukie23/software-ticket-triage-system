import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from issue_ml.experiments import run_experiments

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="训练基线、DistilBERT 和三组对比，并发布最终模型。")
    parser.add_argument("--force", action="store_true", help="忽略已有运行结果并重新训练")
    args = parser.parse_args()
    result = run_experiments(force=args.force)
    selected = result["selectedModel"]
    print(selected["version"], "val", round(selected["valMacroF1"], 4), "test", round(selected["testMacroF1"], 4))
    print("threshold", selected["threshold"])
