from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "shared" / "domain.json"
DOMAIN = json.loads(SHARED.read_text(encoding="utf-8"))

LABELS: list[str] = list(DOMAIN["labels"])
REPOSITORIES: list[str] = list(DOMAIN["repositories"])
LABEL_TO_QUEUE: dict[str, str] = {
    "bug": DOMAIN["queues"]["bug"],
    "feature": DOMAIN["queues"]["feature"],
    "question": DOMAIN["queues"]["question"],
}
REVIEW_QUEUE = DOMAIN["queues"]["review"]

SEED = 42
VAL_FRACTION = 0.2
BODY_CHAR_LIMIT = 10_000
BERT_MODEL = "distilbert/distilbert-base-uncased"
BERT_EPOCHS = 3
BERT_LR = 2e-5
BERT_BATCH = 16
BERT_LENGTHS = (128, 256)
C_GRID = (0.25, 0.5, 1.0, 2.0, 4.0)

DATA_RAW = ROOT / "training" / "data" / "raw"
DATA_PROCESSED = ROOT / "training" / "data" / "processed"
RESULTS = ROOT / "training" / "results"
FIGURES = RESULTS / "figures"
MODELS = ROOT / "models"
RUNS = MODELS / "runs"
DEPLOYED = MODELS / "deployed"

TRAIN_URL = "https://raw.githubusercontent.com/nlbse2024/issue-report-classification/main/data/issues_train.csv"
TEST_URL = "https://raw.githubusercontent.com/nlbse2024/issue-report-classification/main/data/issues_test.csv"
SOURCE_PAGE = "https://github.com/nlbse2024/issue-report-classification"
