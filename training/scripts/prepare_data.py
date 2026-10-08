import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from issue_ml.data import prepare_dataset

if __name__ == "__main__":
    profile = prepare_dataset()
    print(profile["counts"])
    print(profile["duplicates"])
    print(profile["missing"])
