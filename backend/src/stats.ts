import fs from "fs";
import { pool } from "./db";
import { HttpError } from "./http";
import { resultsPath } from "./env";

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function filtersFor(alias: string, filters: { project?: string; from?: string; to?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.project) {
    params.push(filters.project);
    where.push(`${alias}.project = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`(${alias}.created_at AT TIME ZONE 'Asia/Shanghai')::date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`(${alias}.created_at AT TIME ZONE 'Asia/Shanghai')::date <= $${params.length}::date`);
  }
  return { where, params, sql: where.length ? `WHERE ${where.join(" AND ")}` : "" };
}

export async function getStats(filters: { project?: string; from?: string; to?: string }) {
  const { where, params, sql: whereSql } = filtersFor("tickets", filters);
  const summary = await pool.query<{
    total: string;
    pendingReview: string;
    classificationFailed: string;
  }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE review_status = 'pending')::text AS "pendingReview",
            COUNT(*) FILTER (WHERE classification_status = 'failed')::text AS "classificationFailed"
     FROM tickets ${whereSql}`,
    params,
  );
  const joined = filtersFor("t", filters);
  const corrections = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM reviews r
     JOIN tickets t ON t.id = r.ticket_id
     ${joined.sql ? `${joined.sql} AND r.action = 'correct'` : "WHERE r.action = 'correct'"}`,
    joined.params,
  );
  const byLabel = await pool.query<{ label: string; count: string }>(
    `SELECT COALESCE(confirmed_label, predicted_label) AS label, COUNT(*)::text AS count
     FROM tickets ${whereSql}
     ${where.length ? "AND" : "WHERE"} COALESCE(confirmed_label, predicted_label) IS NOT NULL
     GROUP BY 1`,
    params,
  );
  const byQueue = await pool.query<{ queue: string | null; count: string }>(
    `SELECT queue, COUNT(*)::text AS count FROM tickets ${whereSql} GROUP BY queue`,
    params,
  );
  const byProcess = await pool.query<{ processStatus: string; count: string }>(
    `SELECT process_status AS "processStatus", COUNT(*)::text AS count FROM tickets ${whereSql} GROUP BY process_status`,
    params,
  );
  const trend = await pool.query<{ date: string; count: string }>(
    `SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date, COUNT(*)::text AS count
     FROM tickets ${whereSql}
     GROUP BY 1 ORDER BY 1`,
    params,
  );
  const labelOrder = ["bug", "feature", "question"];
  const processOrder = ["pending", "in_progress", "resolved"];
  return {
    total: Number(summary.rows[0].total),
    pendingReview: Number(summary.rows[0].pendingReview),
    classificationFailed: Number(summary.rows[0].classificationFailed),
    correctionCount: Number(corrections.rows[0].count),
    byLabel: labelOrder.map((label) => ({
      label,
      count: Number(byLabel.rows.find((row) => row.label === label)?.count ?? 0),
    })),
    byQueue: byQueue.rows.map((row) => ({ queue: row.queue ?? "Unassigned", count: Number(row.count) })),
    byProcessStatus: processOrder.map((status) => ({
      status,
      count: Number(byProcess.rows.find((row) => row.processStatus === status)?.count ?? 0),
    })),
    trend: trend.rows.map((row) => ({ date: row.date, count: Number(row.count) })),
  };
}

export function readModelResults(): unknown {
  if (!fs.existsSync(resultsPath)) {
    throw new HttpError(404, "Experiment results are not ready yet", "NOT_READY");
  }
  return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
}

export async function exportFeedbackCsv(): Promise<string> {
  const rows = await pool.query(
    `SELECT t.id AS ticket_id, t.project, t.title, t.predicted_label, r.confirmed_label, r.action, r.note, r.created_at
     FROM reviews r
     JOIN tickets t ON t.id = r.ticket_id
     ORDER BY r.created_at DESC`,
  );
  const header = ["ticket_id", "project", "title", "predicted_label", "confirmed_label", "action", "note", "created_at"];
  const lines = [header.join(",")];
  for (const row of rows.rows) {
    lines.push(
      [
        row.ticket_id,
        row.project,
        row.title,
        row.predicted_label,
        row.confirmed_label,
        row.action,
        row.note,
        new Date(row.created_at).toISOString(),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}
