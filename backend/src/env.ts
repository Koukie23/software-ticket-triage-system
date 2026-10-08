import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { projectRoot } from "./paths";

dotenv.config({ path: path.join(projectRoot, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export const databaseUrl = required("DATABASE_URL");
export const modelServiceUrl = process.env.MODEL_SERVICE_URL ?? "http://127.0.0.1:8000";
export const port = Number(process.env.PORT ?? 3000);
export const resultsPath = process.env.RESULTS_PATH
  ? path.resolve(process.env.RESULTS_PATH)
  : path.join(projectRoot, "training", "results", "model_results.json");
export const thresholdPath = process.env.THRESHOLD_PATH
  ? path.resolve(process.env.THRESHOLD_PATH)
  : path.join(projectRoot, "training", "results", "threshold.json");
export const sqlPath = path.join(projectRoot, "backend", "sql", "init.sql");

export const domain = JSON.parse(fs.readFileSync(path.join(projectRoot, "shared", "domain.json"), "utf8")) as {
  labels: Array<"bug" | "feature" | "question">;
  repositories: string[];
  queues: { bug: string; feature: string; question: string; review: string };
  processStatuses: string[];
  classificationStatuses: string[];
  reviewStatuses: string[];
};
