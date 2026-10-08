import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))

from issue_ml.inference import IssuePredictor  # noqa: E402

app = FastAPI(title="Issue classification service")
model_dir = Path(os.environ["MODEL_DIR"]) if os.environ.get("MODEL_DIR") else ROOT / "models" / "deployed"
predictor = IssuePredictor(model_dir)


class PredictIn(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    title: str = ""
    body: str = ""


class Scores(BaseModel):
    bug: float
    feature: float
    question: float


class PredictOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    label: str
    scores: Scores
    modelVersion: str = Field(alias="modelVersion")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "modelVersion": predictor.version}


@app.post("/predict")
def predict(payload: PredictIn) -> dict:
    title = payload.title or ""
    body = payload.body or ""
    if not title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if len(title) > 5000 or len(body) > 200000:
        raise HTTPException(status_code=422, detail="Input is too long")
    return predictor.predict(title, body)
