import { modelServiceUrl } from "./env";
import { ModelCallError } from "./http";
import type { Label } from "./triage";

export interface ModelPrediction {
  label: Label;
  scores: Record<Label, number>;
  modelVersion: string;
}

export async function predictIssue(title: string, body: string): Promise<ModelPrediction> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${modelServiceUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = `Model service returned ${response.status}`;
      try {
        const payload = (await response.json()) as { detail?: unknown };
        if (typeof payload.detail === "string") detail = payload.detail;
        else if (payload.detail != null) detail = JSON.stringify(payload.detail);
      } catch {
        // 保留状态码说明
      }
      throw new ModelCallError(detail);
    }
    const payload = (await response.json()) as ModelPrediction;
    if (!payload?.scores || !payload.label) throw new ModelCallError("Incomplete model response");
    return payload;
  } catch (error) {
    if (error instanceof ModelCallError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ModelCallError("Model service timed out");
    }
    throw new ModelCallError("Model service unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export async function checkModelHealth(): Promise<{ ok: boolean; modelVersion: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${modelServiceUrl}/health`, { signal: controller.signal });
    if (!response.ok) return { ok: false, modelVersion: null };
    const payload = (await response.json()) as { modelVersion?: string };
    return { ok: true, modelVersion: payload.modelVersion ?? null };
  } catch {
    return { ok: false, modelVersion: null };
  } finally {
    clearTimeout(timer);
  }
}
