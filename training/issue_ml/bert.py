from __future__ import annotations

import os
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from issue_ml.constants import (
    BERT_BATCH,
    BERT_EPOCHS,
    BERT_LR,
    BERT_MODEL,
    BODY_CHAR_LIMIT,
    LABELS,
    RUNS,
    SEED,
)
from issue_ml.jsonutil import read_json, write_json
from issue_ml.metrics import evaluate_split, misclassified_rows, per_repository_metrics, prediction_frame
from issue_ml.preprocess import build_text

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def _texts(frame: pd.DataFrame, mode: str) -> list[str]:
    return [
        build_text(title, body, mode, BODY_CHAR_LIMIT)
        for title, body in zip(frame["Title"], frame["Body"], strict=True)
    ]


def train_distilbert(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    version: str,
    mode: str,
    max_length: int,
    force: bool = False,
) -> dict:
    run_dir = RUNS / version
    if not force and (run_dir / "val_metrics.json").exists() and (run_dir / "hf" / "config.json").exists():
        return _load_run(run_dir, version, mode, max_length)

    import torch
    from torch.utils.data import Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    device_name = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(BERT_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(
        BERT_MODEL,
        num_labels=len(LABELS),
        id2label={index: label for index, label in enumerate(LABELS)},
        label2id={label: index for index, label in enumerate(LABELS)},
    )

    class EncodedDataset(Dataset):
        def __init__(self, frame: pd.DataFrame):
            texts = _texts(frame, mode)
            encoded = tokenizer(
                texts,
                truncation=True,
                padding="max_length",
                max_length=max_length,
            )
            self.encoded = {key: list(value) for key, value in encoded.items()}
            self.labels = [LABELS.index(label) for label in frame["Label"].tolist()]

        def __len__(self) -> int:
            return len(self.labels)

        def __getitem__(self, index: int) -> dict:
            item = {key: torch.tensor(value[index]) for key, value in self.encoded.items()}
            item["labels"] = torch.tensor(self.labels[index])
            return item

    def compute_metrics(eval_pred):
        from sklearn.metrics import accuracy_score, f1_score

        logits, labels = eval_pred
        predicted = np.argmax(logits, axis=-1)
        return {
            "macro_f1": float(f1_score(labels, predicted, average="macro")),
            "accuracy": float(accuracy_score(labels, predicted)),
        }

    if run_dir.exists():
        shutil.rmtree(run_dir)
    trainer_dir = run_dir / "trainer"
    argument_values = {
        "output_dir": str(trainer_dir),
        "learning_rate": BERT_LR,
        "per_device_train_batch_size": BERT_BATCH,
        "per_device_eval_batch_size": 32,
        "num_train_epochs": BERT_EPOCHS,
        "weight_decay": 0.01,
        "save_strategy": "epoch",
        "save_total_limit": 1,
        "load_best_model_at_end": True,
        "metric_for_best_model": "macro_f1",
        "greater_is_better": True,
        "seed": SEED,
        "logging_strategy": "epoch",
        "report_to": "none",
        "dataloader_pin_memory": False,
        "fp16": False,
    }
    parameters = TrainingArguments.__init__.__code__.co_varnames
    if "eval_strategy" in parameters:
        argument_values["eval_strategy"] = "epoch"
    else:
        argument_values["evaluation_strategy"] = "epoch"
    if device_name == "cpu":
        argument_values["use_cpu"] = True
    trainer = Trainer(
        model=model,
        args=TrainingArguments(**argument_values),
        train_dataset=EncodedDataset(train_df),
        eval_dataset=EncodedDataset(val_df),
        compute_metrics=compute_metrics,
    )
    trainer.train()
    hf_dir = run_dir / "hf"
    trainer.save_model(str(hf_dir))
    tokenizer.save_pretrained(hf_dir)
    shutil.rmtree(trainer_dir, ignore_errors=True)

    probabilities = _predict_probabilities(trainer.model, tokenizer, _texts(val_df, mode), max_length, torch)
    predicted_labels = [LABELS[int(index)] for index in probabilities.argmax(axis=1)]
    latency_ms = _single_latency(trainer.model, tokenizer, val_df, mode, max_length, torch)
    metrics = evaluate_split(val_df["Label"].tolist(), predicted_labels, latency_ms)
    predicted = prediction_frame(val_df, probabilities)
    curves = _curves(trainer.state.log_history)
    payload = {
        **metrics,
        "split": "validation",
        "perRepository": per_repository_metrics(val_df, predicted_labels, "validation"),
        "misclassified": misclassified_rows(predicted, "validation"),
        "version": version,
        "inputMode": mode,
        "maxLength": max_length,
        "curves": curves,
        "device": device_name,
        "epochs": BERT_EPOCHS,
        "learningRate": BERT_LR,
        "baseModel": BERT_MODEL,
    }
    manifest = {
        "type": "distilbert",
        "version": version,
        "inputMode": mode,
        "preprocess": "clean" if mode == "title_body_clean" else "raw",
        "maxLength": max_length,
        "bodyCharLimit": BODY_CHAR_LIMIT,
        "labelOrder": LABELS,
        "baseModel": BERT_MODEL,
        "seed": SEED,
        "epochs": BERT_EPOCHS,
        "learningRate": BERT_LR,
        "batchSize": BERT_BATCH,
    }
    write_json(run_dir / "manifest.json", manifest)
    write_json(run_dir / "val_metrics.json", payload)
    predicted.to_json(run_dir / "val_predictions.json", orient="records", force_ascii=False)
    return {
        "version": version,
        "runDir": str(run_dir),
        "type": "distilbert",
        "inputMode": mode,
        "preprocess": manifest["preprocess"],
        "maxLength": max_length,
        "val": payload,
        "probabilities": probabilities,
        "predictions": predicted,
    }


def _predict_probabilities(model, tokenizer, texts: list[str], max_length: int, torch) -> np.ndarray:
    device = next(model.parameters()).device
    model.eval()
    chunks = []
    batch_size = 32
    for start in range(0, len(texts), batch_size):
        encoded = tokenizer(
            texts[start : start + batch_size],
            truncation=True,
            padding=True,
            max_length=max_length,
            return_tensors="pt",
        )
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.no_grad():
            logits = model(**encoded).logits
            chunks.append(torch.softmax(logits, dim=-1).cpu().numpy())
    return np.vstack(chunks)


def _single_latency(model, tokenizer, frame: pd.DataFrame, mode: str, max_length: int, torch) -> float:
    import time

    device = next(model.parameters()).device
    sample = frame.head(30)
    started = time.perf_counter()
    for title, body in zip(sample["Title"], sample["Body"], strict=True):
        encoded = tokenizer(
            build_text(title, body, mode, BODY_CHAR_LIMIT),
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.no_grad():
            model(**encoded)
    return (time.perf_counter() - started) * 1000 / max(len(sample), 1)


def _curves(log_history: list[dict]) -> list[dict]:
    by_epoch: dict[int, dict] = {}
    for row in log_history:
        if "epoch" not in row:
            continue
        epoch = int(round(float(row["epoch"])))
        slot = by_epoch.setdefault(epoch, {"epoch": epoch})
        if "loss" in row and "eval_loss" not in row:
            slot["trainLoss"] = float(row["loss"])
        if "eval_loss" in row:
            slot["valLoss"] = float(row["eval_loss"])
        if "eval_macro_f1" in row:
            slot["valMacroF1"] = float(row["eval_macro_f1"])
    return [by_epoch[key] for key in sorted(by_epoch) if "valMacroF1" in by_epoch[key]]


def _load_run(run_dir: Path, version: str, mode: str, max_length: int) -> dict:
    metrics = read_json(run_dir / "val_metrics.json")
    predictions = pd.read_json(run_dir / "val_predictions.json")
    probabilities = predictions[[f"score_{label}" for label in LABELS]].to_numpy()
    return {
        "version": version,
        "runDir": str(run_dir),
        "type": "distilbert",
        "inputMode": mode,
        "preprocess": "clean" if mode == "title_body_clean" else "raw",
        "maxLength": max_length,
        "val": metrics,
        "probabilities": probabilities,
        "predictions": predictions,
    }
