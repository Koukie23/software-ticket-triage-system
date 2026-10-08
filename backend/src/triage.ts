import { domain } from "./env";

export type Label = "bug" | "feature" | "question";

const queues = domain.queues;

export function queueForLabel(label: Label): string {
  return queues[label];
}

export function decideTriage(label: Label, confidence: number, threshold: number): {
  queue: string;
  reviewStatus: "auto" | "pending";
} {
  if (confidence < threshold) {
    return { queue: queues.review, reviewStatus: "pending" };
  }
  return { queue: queueForLabel(label), reviewStatus: "auto" };
}
