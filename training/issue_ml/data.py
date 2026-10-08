from __future__ import annotations

import csv
import io
import sys
import urllib.request
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib import font_manager
from sklearn.model_selection import train_test_split

from issue_ml.constants import (
    DATA_PROCESSED,
    DATA_RAW,
    FIGURES,
    LABELS,
    RESULTS,
    REPOSITORIES,
    SEED,
    SOURCE_PAGE,
    TEST_URL,
    TRAIN_URL,
    VAL_FRACTION,
)
from issue_ml.jsonutil import write_json

csv.field_size_limit(sys.maxsize)


def _configure_font() -> None:
    available = {font.name for font in font_manager.fontManager.ttflist}
    for name in ("PingFang SC", "Arial Unicode MS", "Heiti TC", "Songti SC"):
        if name in available:
            plt.rcParams["font.sans-serif"] = [name]
            break
    plt.rcParams["axes.unicode_minus"] = False


def download_raw(force: bool = False) -> tuple[Path, Path]:
    DATA_RAW.mkdir(parents=True, exist_ok=True)
    targets = (
        (TRAIN_URL, DATA_RAW / "issues_train.csv"),
        (TEST_URL, DATA_RAW / "issues_test.csv"),
    )
    for url, path in targets:
        if path.exists() and path.stat().st_size > 0 and not force:
            continue
        request = urllib.request.Request(url, headers={"User-Agent": "issue-triage-course"})
        with urllib.request.urlopen(request, timeout=120) as response:
            path.write_bytes(response.read())
    return DATA_RAW / "issues_train.csv", DATA_RAW / "issues_test.csv"


def read_issue_csv(path: Path) -> tuple[pd.DataFrame, dict]:
    raw = path.read_bytes()
    nul_count = raw.count(b"\x00")
    text = raw.replace(b"\x00", b"").decode("utf-8")
    frame = pd.DataFrame(list(csv.DictReader(io.StringIO(text))))
    expected = {"repo", "created_at", "label", "title", "body"}
    missing_cols = expected.difference(frame.columns)
    if missing_cols:
        raise SystemExit(f"{path.name} 缺少字段 {sorted(missing_cols)}，实际为 {list(frame.columns)}")
    frame = frame.rename(
        columns={
            "repo": "Repository",
            "created_at": "CreatedAt",
            "label": "Label",
            "title": "Title",
            "body": "Body",
        }
    )
    for column in ("Repository", "Label", "Title", "Body", "CreatedAt"):
        frame[column] = frame[column].fillna("").astype(str)
    frame["Label"] = frame["Label"].str.strip().str.lower().replace({"enhancement": "feature"})
    frame["Repository"] = frame["Repository"].str.strip()
    frame["Title"] = frame["Title"].str.replace("\x00", "", regex=False)
    frame["Body"] = frame["Body"].str.replace("\x00", "", regex=False)
    return frame[["Repository", "CreatedAt", "Label", "Title", "Body"]].copy(), {"nulBytesRemoved": nul_count}


def _text_key(frame: pd.DataFrame) -> pd.Series:
    return frame["Title"].str.strip() + "\n" + frame["Body"].str.strip()


def _length_stats(values: pd.Series) -> dict:
    array = values.astype(int).to_numpy()
    return {
        "mean": float(np.mean(array)),
        "median": float(np.median(array)),
        "p95": float(np.percentile(array, 95)),
        "max": int(array.max()) if len(array) else 0,
    }


def _blank_count(frame: pd.DataFrame, column: str) -> int:
    return int(frame[column].str.strip().eq("").sum())


def prepare_dataset(force_download: bool = False) -> dict:
    _configure_font()
    train_path, test_path = download_raw(force_download)
    official_train, train_notes = read_issue_csv(train_path)
    official_test, test_notes = read_issue_csv(test_path)

    unknown_labels = sorted(set(official_train["Label"]).union(official_test["Label"]).difference(LABELS))
    unknown_repos = sorted(
        set(official_train["Repository"]).union(official_test["Repository"]).difference(REPOSITORIES)
    )
    if unknown_labels or unknown_repos:
        raise SystemExit(f"出现未约定的标签或仓库: labels={unknown_labels} repos={unknown_repos}")

    strata = official_train["Repository"] + "||" + official_train["Label"]
    train_df, val_df = train_test_split(
        official_train,
        test_size=VAL_FRACTION,
        random_state=SEED,
        stratify=strata,
    )
    train_df = train_df.reset_index(drop=True)
    val_df = val_df.reset_index(drop=True)
    test_df = official_test.reset_index(drop=True)

    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    train_df.to_csv(DATA_PROCESSED / "train.csv", index=False)
    val_df.to_csv(DATA_PROCESSED / "val.csv", index=False)
    test_df.to_csv(DATA_PROCESSED / "test.csv", index=False)

    def overlap(left: pd.DataFrame, right: pd.DataFrame) -> int:
        return len(set(_text_key(left)).intersection(_text_key(right)))

    profile = {
        "source": SOURCE_PAGE,
        "fields": ["repo", "created_at", "label", "title", "body"],
        "modelFields": ["Repository", "Title", "Body"],
        "unusedFields": ["CreatedAt"],
        "seed": SEED,
        "valFraction": VAL_FRACTION,
        "stratify": "Repository+Label",
        "counts": {
            "officialTrain": int(len(official_train)),
            "train": int(len(train_df)),
            "validation": int(len(val_df)),
            "test": int(len(test_df)),
        },
        "nulBytesRemoved": {
            "officialTrain": train_notes["nulBytesRemoved"],
            "test": test_notes["nulBytesRemoved"],
        },
        "missing": {
            "officialTrain": {column: _blank_count(official_train, column) for column in ("Title", "Body")},
            "test": {column: _blank_count(official_test, column) for column in ("Title", "Body")},
        },
        "duplicates": {
            "withinOfficialTrain": int(_text_key(official_train).duplicated().sum()),
            "withinTest": int(_text_key(test_df).duplicated().sum()),
            "officialTrainTestOverlap": overlap(official_train, test_df),
            "trainValidationOverlap": overlap(train_df, val_df),
            "trainTestOverlap": overlap(train_df, test_df),
        },
        "byLabel": [
            {
                "split": name,
                **{label: int((frame["Label"] == label).sum()) for label in LABELS},
            }
            for name, frame in (
                ("officialTrain", official_train),
                ("train", train_df),
                ("validation", val_df),
                ("test", test_df),
            )
        ],
        "byRepository": [
            {
                "repository": repo,
                "officialTrain": int((official_train["Repository"] == repo).sum()),
                "train": int((train_df["Repository"] == repo).sum()),
                "validation": int((val_df["Repository"] == repo).sum()),
                "test": int((test_df["Repository"] == repo).sum()),
            }
            for repo in REPOSITORIES
        ],
        "length": {
            "title": _length_stats(official_train["Title"].str.len()),
            "body": _length_stats(official_train["Body"].str.len()),
        },
        "notes": [
            "created_at 不作为模型输入。",
            "测试集不参与训练、调参和阈值选择。",
            "五个仓库合并训练一个通用分类器，并分别报告各仓库效果。",
        ],
    }
    write_json(RESULTS / "data_profile.json", profile)
    write_json(
        RESULTS / "split_config.json",
        {
            "seed": SEED,
            "valFraction": VAL_FRACTION,
            "stratify": "Repository+Label",
            "counts": profile["counts"],
        },
    )
    _write_figures(profile, official_train)
    _write_data_doc(profile)
    return profile


def load_splits() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    paths = [DATA_PROCESSED / name for name in ("train.csv", "val.csv", "test.csv")]
    if any(not path.exists() for path in paths):
        prepare_dataset()
    frames = []
    for path in paths:
        frame = pd.read_csv(path, keep_default_na=False)
        for column in ("Repository", "Label", "Title", "Body"):
            frame[column] = frame[column].fillna("").astype(str)
        frames.append(frame)
    return frames[0], frames[1], frames[2]


def _write_figures(profile: dict, official_train: pd.DataFrame) -> None:
    FIGURES.mkdir(parents=True, exist_ok=True)
    splits = [row for row in profile["byLabel"] if row["split"] in {"train", "validation", "test"}]
    x = np.arange(len(LABELS))
    width = 0.24
    figure, axis = plt.subplots(figsize=(8, 4.5))
    for index, row in enumerate(splits):
        axis.bar(x + (index - 1) * width, [row[label] for label in LABELS], width, label=row["split"])
    axis.set_xticks(x, LABELS)
    axis.set_ylabel("样本数")
    axis.set_title("各类别在训练、验证、测试集中的数量")
    axis.legend()
    figure.tight_layout()
    figure.savefig(FIGURES / "label_distribution.png", dpi=140)
    plt.close(figure)

    figure, axis = plt.subplots(figsize=(9, 4.5))
    repos = profile["byRepository"]
    y = np.arange(len(repos))
    axis.barh(y - 0.2, [item["train"] for item in repos], 0.2, label="train")
    axis.barh(y, [item["validation"] for item in repos], 0.2, label="validation")
    axis.barh(y + 0.2, [item["test"] for item in repos], 0.2, label="test")
    axis.set_yticks(y, [item["repository"] for item in repos])
    axis.set_xlabel("样本数")
    axis.set_title("各仓库样本量")
    axis.legend()
    figure.tight_layout()
    figure.savefig(FIGURES / "repo_distribution.png", dpi=140)
    plt.close(figure)

    figure, axes = plt.subplots(1, 2, figsize=(9, 4))
    title_len = official_train["Title"].str.len()
    body_len = official_train["Body"].str.len().clip(upper=int(profile["length"]["body"]["p95"]))
    axes[0].hist(title_len, bins=30, color="#1677ff")
    axes[0].set_title("标题长度（字符）")
    axes[1].hist(body_len, bins=30, color="#69b1ff")
    axes[1].set_title("正文长度（截断到 P95 以便阅读）")
    figure.tight_layout()
    figure.savefig(FIGURES / "length_hist.png", dpi=140)
    plt.close(figure)


def _write_data_doc(profile: dict) -> None:
    counts = profile["counts"]
    lines = [
        "# 数据说明",
        "",
        f"来源：<{profile['source']}>。",
        "",
        "原始文件字段是 `repo`、`created_at`、`label`、`title`、`body`。建模使用仓库、标题和正文。`created_at` 不进入模型。",
        "",
        f"- 官方训练集 {counts['officialTrain']} 条，其中训练 {counts['train']} 条、验证 {counts['validation']} 条。",
        f"- 官方测试集 {counts['test']} 条，不参与训练、调参或阈值选择。",
        f"- 划分方式：按仓库 + 标签分层，验证集比例 {profile['valFraction']}，随机种子 {profile['seed']}。",
        f"- 官方训练集中移除的 NUL 字节：{profile['nulBytesRemoved']['officialTrain']}。测试集：{profile['nulBytesRemoved']['test']}。",
        f"- 标题为空：官方训练集 {profile['missing']['officialTrain']['Title']}，测试集 {profile['missing']['test']['Title']}。",
        f"- 正文为空：官方训练集 {profile['missing']['officialTrain']['Body']}，测试集 {profile['missing']['test']['Body']}。",
        f"- 官方训练集内部重复（标题+正文）{profile['duplicates']['withinOfficialTrain']} 条。",
        f"- 测试集内部重复 {profile['duplicates']['withinTest']} 条。",
        f"- 官方训练集与测试集交叉重复 {profile['duplicates']['officialTrainTestOverlap']} 条。",
        f"- 本项目训练集与验证集交叉重复 {profile['duplicates']['trainValidationOverlap']} 条。",
        "",
        "五个仓库合并为一个通用分类器。这与 NLBSE 竞赛“每个仓库单独训练”的设定不同，实验页会另报各仓库 Macro-F1。",
        "",
        "分析图：`training/results/figures/label_distribution.png`、`repo_distribution.png`、`length_hist.png`。",
        "",
    ]
    (RESULTS.parent.parent / "docs").mkdir(exist_ok=True)
    # RESULTS is training/results, parents[1] is project root.
    doc = RESULTS.parents[1] / "docs" / "data.md"
    doc.write_text("\n".join(lines), encoding="utf-8")
