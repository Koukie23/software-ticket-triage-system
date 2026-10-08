import fs from "fs";
import { thresholdPath } from "./env";

export interface ThresholdConfig {
  threshold: number;
  modelVersion: string;
  rule: string;
}

const fallback: ThresholdConfig = {
  threshold: 0.7,
  modelVersion: "unset",
  rule: "Threshold file not found. Using 0.70 for now. Scores below this go to human review.",
};

let cache: { mtimeMs: number; value: ThresholdConfig } | null = null;

export function getThreshold(): ThresholdConfig {
  if (!fs.existsSync(thresholdPath)) return fallback;
  const stat = fs.statSync(thresholdPath);
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.value;
  const parsed = JSON.parse(fs.readFileSync(thresholdPath, "utf8")) as Partial<ThresholdConfig>;
  const value: ThresholdConfig = {
    threshold: Number(parsed.threshold ?? fallback.threshold),
    modelVersion: String(parsed.modelVersion ?? fallback.modelVersion),
    rule: String(parsed.rule ?? fallback.rule),
  };
  cache = { mtimeMs: stat.mtimeMs, value };
  return value;
}
