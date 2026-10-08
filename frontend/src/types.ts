export type Label = "bug" | "feature" | "question";
export type ProcessStatus = "pending" | "in_progress" | "resolved";
export type ClassificationStatus = "pending" | "classified" | "failed";
export type ReviewStatus = "auto" | "pending" | "confirmed";

export interface Scores {
  bug: number;
  feature: number;
  question: number;
}

export interface Prediction {
  id: string;
  modelVersion: string;
  predictedLabel: Label;
  scores: Scores;
  confidence: number;
  thresholdUsed: number;
  queue: string | null;
  isCurrent: boolean;
  createdAt: string;
}

export interface Ticket {
  id: string;
  project: string;
  title: string;
  body?: string;
  processStatus: ProcessStatus;
  classificationStatus: ClassificationStatus;
  reviewStatus: ReviewStatus | null;
  predictedLabel: Label | null;
  confirmedLabel: Label | null;
  queue: string | null;
  note?: string | null;
  classificationError: string | null;
  createdAt: string;
  updatedAt?: string;
  confidence: number | null;
  scores: Scores | null;
  modelVersion: string | null;
  thresholdUsed: number | null;
  prediction?: Prediction | null;
  predictions?: Prediction[];
  reviews?: Array<{
    id: string;
    action: "confirm" | "correct";
    confirmedLabel: Label;
    previousLabel: Label | null;
    note: string | null;
    createdAt: string;
  }>;
  events?: Array<{
    id: string;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface TicketList {
  items: Ticket[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Stats {
  total: number;
  pendingReview: number;
  classificationFailed: number;
  correctionCount: number;
  byLabel: Array<{ label: string; count: number }>;
  byQueue: Array<{ queue: string; count: number }>;
  byProcessStatus: Array<{ status: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
}

export interface ExperimentRow {
  name: string;
  split: string;
  macroF1: number;
  accuracy: number;
  latencyMs: number;
  perClass: Record<string, { precision: number; recall: number; f1: number; support: number }>;
  inputMode: string;
  maxLength: number | null;
}

export interface ModelResults {
  generatedAt?: string | null;
  provisional?: boolean;
  disclaimer: string;
  dataProfile: {
    counts: { train: number; validation: number; test: number };
    byLabel: Array<Record<string, string | number>>;
    byRepository: Array<Record<string, string | number>>;
    seed: number;
    valFraction: number;
  };
  selectedModel: {
    version: string;
    type: string;
    inputMode: string;
    maxLength: number | null;
    reason: string;
    threshold: number;
    thresholdDetail: string;
    thresholdSweep: Array<{
      threshold: number;
      coverage: number;
      reviewRate: number;
      autoAccuracy: number | null;
      autoCount: number;
    }>;
    valMacroF1: number;
    testMacroF1: number | null;
    latencyMs: number;
  };
  experiments: Array<{ id: string; title: string; purpose: string; rows: ExperimentRow[] }>;
  curves: Array<{ model: string; epochs: Array<{ epoch: number; trainLoss?: number; valLoss?: number; valMacroF1?: number }> }>;
  confusionMatrix: { labels: string[]; matrix: number[][]; title: string };
  perRepository: Array<{ repository: string; split: string; macroF1: number; accuracy: number; support: number }>;
  misclassified: Array<{
    split: string;
    repository: string;
    title: string;
    trueLabel: string;
    predictedLabel: string;
    confidence: number;
  }>;
  testEvaluation?: {
    macroF1: number;
    accuracy: number;
    latencyMs: number;
    perClass: ExperimentRow["perClass"];
    note: string;
  } | null;
}
