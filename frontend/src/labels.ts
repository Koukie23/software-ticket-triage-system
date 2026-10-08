import type { ClassificationStatus, Label, ProcessStatus, ReviewStatus } from "./types";

export const labelText: Record<Label, string> = {
  bug: "Bug",
  feature: "Feature",
  question: "Question",
};

export const processText: Record<ProcessStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  resolved: "Resolved",
};

export const reviewText: Record<ReviewStatus, string> = {
  auto: "Auto-routed",
  pending: "Needs review",
  confirmed: "Confirmed",
};

export const classificationText: Record<ClassificationStatus, string> = {
  pending: "Pending",
  classified: "Classified",
  failed: "Failed",
};

export const inputModeText: Record<string, string> = {
  title: "Title only",
  title_body: "Title + body",
  title_body_clean: "Title + cleaned body",
};

export const queues = ["Defect", "Feature request", "Technical support", "Human review"] as const;
