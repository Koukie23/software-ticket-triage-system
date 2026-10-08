import fs from "fs";
import path from "path";
import { migrate, pool } from "./db";
import { projectRoot } from "./paths";

const base = process.env.API_BASE ?? "http://127.0.0.1:3000";

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${payload?.error?.message ?? text}`);
  }
  return payload;
}

async function main() {
  await migrate();
  if (process.argv.includes("--reset")) {
    await pool.query("TRUNCATE tickets CASCADE");
    console.log("已清空工单数据");
  }
  const examples = JSON.parse(fs.readFileSync(path.join(projectRoot, "shared", "examples.json"), "utf8")) as Array<{
    project: string;
    title: string;
    body: string;
  }>;
  const created: Array<{ id: string; predictedLabel: string | null }> = [];
  for (const example of examples) {
    const result = await request(`${base}/api/tickets`, { method: "POST", body: JSON.stringify(example) });
    created.push({ id: result.ticket.id, predictedLabel: result.ticket.predictedLabel });
    console.log("示例", result.ticket.project, result.ticket.predictedLabel, result.ticket.queue, result.classificationError);
  }
  const vague = await request(`${base}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      project: "opencv/opencv",
      title: "Something seems wrong",
      body: "It does not work on my machine. Please help.",
    }),
  });
  console.log("模糊工单", vague.ticket.predictedLabel, vague.ticket.queue, vague.ticket.reviewStatus);

  const candidatePath = path.join(projectRoot, "training", "results", "demo_candidates.json");
  if (fs.existsSync(candidatePath)) {
    const candidates = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as {
      review: Array<{ project: string; title: string; body: string }>;
    };
    for (const item of candidates.review ?? []) {
      const result = await request(`${base}/api/tickets`, {
        method: "POST",
        body: JSON.stringify({ project: item.project, title: item.title, body: item.body }),
      });
      console.log("复核候选", result.ticket.reviewStatus, result.ticket.confidence, result.ticket.queue);
    }
  }

  const correctable = created.find((item) => item.predictedLabel);
  if (correctable?.predictedLabel) {
    const replacement = correctable.predictedLabel === "bug" ? "feature" : "bug";
    const reviewed = await request(`${base}/api/tickets/${correctable.id}/review`, {
      method: "POST",
      body: JSON.stringify({ action: "correct", label: replacement, note: "Demo correction: changed to another label." }),
    });
    console.log("已纠正", reviewed.ticket.predictedLabel, "->", reviewed.ticket.confirmedLabel, reviewed.ticket.queue);
  }
  if (created[1]) {
    await request(`${base}/api/tickets/${created[1].id}`, {
      method: "PATCH",
      body: JSON.stringify({ processStatus: "in_progress", note: "Checking the reproduction steps." }),
    });
  }
  if (created[2]) {
    await request(`${base}/api/tickets/${created[2].id}`, {
      method: "PATCH",
      body: JSON.stringify({ processStatus: "resolved", note: "Replied with the recommended setup." }),
    });
  }
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
