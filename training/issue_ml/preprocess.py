"""Text construction shared by training and the inference service."""

from __future__ import annotations

import re

from issue_ml.constants import BODY_CHAR_LIMIT

_STACK_LINE_RE = re.compile(
    r"^\s*(?:"
    r"Traceback \(most recent call last\):"
    r"|File \".*\", line \d+.*"
    r"|at .+\(.+:\d+:\d+\)"
    r"|at .+\([^)]+:\d+\)"
    r"|\^+"
    r"|Caused by: .+"
    r")\s*$"
)
_LOG_LINE_RE = re.compile(
    r"^(?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}.*|\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}.*)$"
)


def clean_software_text(text: str) -> str:
    """Drop fenced code, stack frames, and timestamped log lines.

    If cleaning would leave almost no text, the original text is kept so the
    model still sees the issue.
    """
    if not text:
        return ""
    original = text.replace("\x00", "")
    kept: list[str] = []
    in_fence = False
    for line in original.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            if stripped.count("```") >= 2 and stripped.endswith("```") and len(stripped) > 3:
                in_fence = False
            else:
                in_fence = not in_fence
            continue
        if in_fence:
            continue
        if _STACK_LINE_RE.match(line) or _LOG_LINE_RE.match(stripped):
            continue
        kept.append(line.rstrip())
    cleaned = "\n".join(kept)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    if len(cleaned) < 40:
        return original.strip()
    return cleaned


def build_text(
    title: str | None,
    body: str | None,
    mode: str = "title_body",
    body_char_limit: int | None = BODY_CHAR_LIMIT,
) -> str:
    title_text = (title or "").replace("\x00", "").strip()
    body_text = (body or "").replace("\x00", "")
    if mode == "title":
        return title_text
    if mode == "title_body_clean":
        body_text = clean_software_text(body_text)
    elif mode != "title_body":
        raise ValueError(f"未知文本模式: {mode}")
    if body_char_limit is not None:
        body_text = body_text[:body_char_limit]
    body_text = body_text.strip()
    if title_text and body_text:
        return f"{title_text}\n\n{body_text}"
    return title_text or body_text
