import type { PoolClient } from "pg";
import { pool, withTx } from "./db";
import { HttpError, ModelCallError } from "./http";
import { predictIssue } from "./modelClient";
import { getThreshold } from "./threshold";
import { decideTriage, queueForLabel, type Label } from "./triage";

type TicketRow = {
  id: string;
  project: string;
  title: string;
  body: string;
  processStatus: string;
  classificationStatus: string;
  reviewStatus: string | null;
  predictedLabel: Label | null;
  confirmedLabel: Label | null;
  queue: string | null;
  note: string | null;
  classificationError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PredictionRow = {
  id: string;
  modelVersion: string;
  predictedLabel: Label;
  scoreBug: number;
  scoreFeature: number;
  scoreQuestion: number;
  confidence: number;
  thresholdUsed: number;
  queue: string | null;
  isCurrent: boolean;
  createdAt: Date;
};

function iso(value: Date): string {
  return new Date(value).toISOString();
}

function mapPrediction(row: PredictionRow) {
  return {
    id: row.id,
    modelVersion: row.modelVersion,
    predictedLabel: row.predictedLabel,
    scores: {
      bug: Number(row.scoreBug),
      feature: Number(row.scoreFeature),
      question: Number(row.scoreQuestion),
    },
    confidence: Number(row.confidence),
    thresholdUsed: Number(row.thresholdUsed),
    queue: row.queue,
    isCurrent: row.isCurrent,
    createdAt: iso(row.createdAt),
  };
}

function mapTicket(row: TicketRow, predictions: PredictionRow[] = [], reviews: unknown[] = [], events: unknown[] = []) {
  const mappedPredictions = predictions.map(mapPrediction);
  const current = mappedPredictions.find((item) => item.isCurrent) ?? null;
  return {
    id: row.id,
    project: row.project,
    title: row.title,
    body: row.body,
    processStatus: row.processStatus,
    classificationStatus: row.classificationStatus,
    reviewStatus: row.reviewStatus,
    predictedLabel: row.predictedLabel,
    confirmedLabel: row.confirmedLabel,
    queue: row.queue,
    note: row.note,
    classificationError: row.classificationError,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    confidence: current?.confidence ?? null,
    scores: current?.scores ?? null,
    modelVersion: current?.modelVersion ?? null,
    thresholdUsed: current?.thresholdUsed ?? null,
    prediction: current,
    predictions: mappedPredictions,
    reviews,
    events,
  };
}

const ticketColumns = `
  id, project, title, body,
  process_status AS "processStatus",
  classification_status AS "classificationStatus",
  review_status AS "reviewStatus",
  predicted_label AS "predictedLabel",
  confirmed_label AS "confirmedLabel",
  queue, note,
  classification_error AS "classificationError",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

async function addEvent(client: PoolClient, ticketId: string, eventType: string, payload: Record<string, unknown>) {
  await client.query(
    "INSERT INTO ticket_events (ticket_id, event_type, payload) VALUES ($1, $2, $3::jsonb)",
    [ticketId, eventType, JSON.stringify(payload)],
  );
}

export async function getTicket(id: string) {
  const ticket = await pool.query<TicketRow>(`SELECT ${ticketColumns} FROM tickets WHERE id = $1`, [id]);
  if (!ticket.rowCount) throw new HttpError(404, "Ticket not found", "NOT_FOUND");
  const [predictions, reviews, events] = await Promise.all([
    pool.query<PredictionRow>(
      `SELECT id, model_version AS "modelVersion", predicted_label AS "predictedLabel",
              score_bug AS "scoreBug", score_feature AS "scoreFeature", score_question AS "scoreQuestion",
              confidence, threshold_used AS "thresholdUsed", queue, is_current AS "isCurrent",
              created_at AS "createdAt"
       FROM predictions WHERE ticket_id = $1 ORDER BY created_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT id, action, confirmed_label AS "confirmedLabel", previous_label AS "previousLabel",
              note, created_at AS "createdAt"
       FROM reviews WHERE ticket_id = $1 ORDER BY created_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT id, event_type AS "eventType", payload, created_at AS "createdAt"
       FROM ticket_events WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [id],
    ),
  ]);
  return mapTicket(
    ticket.rows[0],
    predictions.rows,
    reviews.rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
    events.rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
  );
}

async function applyPrediction(id: string, title: string, body: string, keepHumanQueue: boolean) {
  const result = await predictIssue(title, body);
  const threshold = getThreshold();
  const confidence = Number(result.scores[result.label]);
  const decision = decideTriage(result.label, confidence, threshold.threshold);
  await withTx(async (client) => {
    await client.query("UPDATE predictions SET is_current = FALSE WHERE ticket_id = $1 AND is_current", [id]);
    await client.query(
      `INSERT INTO predictions
        (ticket_id, model_version, predicted_label, score_bug, score_feature, score_question, confidence, threshold_used, queue, is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)`,
      [
        id,
        result.modelVersion,
        result.label,
        result.scores.bug,
        result.scores.feature,
        result.scores.question,
        confidence,
        threshold.threshold,
        decision.queue,
      ],
    );
    if (keepHumanQueue) {
      await client.query(
        `UPDATE tickets
         SET classification_status = 'classified', predicted_label = $2, classification_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [id, result.label],
      );
    } else {
      await client.query(
        `UPDATE tickets
         SET classification_status = 'classified', review_status = $2, predicted_label = $3, queue = $4,
             classification_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [id, decision.reviewStatus, result.label, decision.queue],
      );
    }
    await addEvent(client, id, "classified", {
      label: result.label,
      confidence,
      queue: decision.queue,
      reviewStatus: keepHumanQueue ? "confirmed" : decision.reviewStatus,
      modelVersion: result.modelVersion,
      threshold: threshold.threshold,
      keptHumanQueue: keepHumanQueue,
    });
  });
}

export async function createTicket(input: { project: string; title: string; body: string }) {
  const created = await pool.query<{ id: string }>(
    "INSERT INTO tickets (project, title, body) VALUES ($1, $2, $3) RETURNING id",
    [input.project, input.title, input.body],
  );
  const id = created.rows[0].id;
  await pool.query(
    "INSERT INTO ticket_events (ticket_id, event_type, payload) VALUES ($1, 'created', $2::jsonb)",
    [id, JSON.stringify({ project: input.project })],
  );
  let classificationError: string | null = null;
  try {
    await applyPrediction(id, input.title, input.body, false);
  } catch (error) {
    classificationError = error instanceof ModelCallError ? error.message : "Classification failed";
    await pool.query(
      `UPDATE tickets SET classification_status = 'failed', classification_error = $2, updated_at = NOW() WHERE id = $1`,
      [id, classificationError],
    );
    await pool.query(
      "INSERT INTO ticket_events (ticket_id, event_type, payload) VALUES ($1, 'classification_failed', $2::jsonb)",
      [id, JSON.stringify({ message: classificationError })],
    );
  }
  return { ticket: await getTicket(id), classificationError };
}

export async function listTickets(filters: {
  q?: string;
  project?: string;
  predictedLabel?: string;
  confirmedLabel?: string;
  queue?: string;
  processStatus?: string;
  reviewStatus?: string;
  classificationStatus?: string;
  page: number;
  pageSize: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("?", `$${params.length}`));
  };
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(t.title ILIKE $${params.length} OR t.body ILIKE $${params.length})`);
  }
  if (filters.project) add("t.project = ?", filters.project);
  if (filters.predictedLabel) add("t.predicted_label = ?", filters.predictedLabel);
  if (filters.confirmedLabel) add("t.confirmed_label = ?", filters.confirmedLabel);
  if (filters.queue) add("t.queue = ?", filters.queue);
  if (filters.processStatus) add("t.process_status = ?", filters.processStatus);
  if (filters.reviewStatus) add("t.review_status = ?", filters.reviewStatus);
  if (filters.classificationStatus) add("t.classification_status = ?", filters.classificationStatus);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM tickets t ${whereSql}`, params);
  const pageParams = [...params, filters.pageSize, (filters.page - 1) * filters.pageSize];
  const rows = await pool.query(
    `SELECT t.id, t.project, t.title,
            t.process_status AS "processStatus",
            t.classification_status AS "classificationStatus",
            t.review_status AS "reviewStatus",
            t.predicted_label AS "predictedLabel",
            t.confirmed_label AS "confirmedLabel",
            t.queue, t.classification_error AS "classificationError",
            t.created_at AS "createdAt",
            p.confidence,
            p.score_bug AS "scoreBug",
            p.score_feature AS "scoreFeature",
            p.score_question AS "scoreQuestion",
            p.model_version AS "modelVersion",
            p.threshold_used AS "thresholdUsed"
     FROM tickets t
     LEFT JOIN predictions p ON p.ticket_id = t.id AND p.is_current
     ${whereSql}
     ORDER BY t.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    pageParams,
  );
  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      project: row.project,
      title: row.title,
      processStatus: row.processStatus,
      classificationStatus: row.classificationStatus,
      reviewStatus: row.reviewStatus,
      predictedLabel: row.predictedLabel,
      confirmedLabel: row.confirmedLabel,
      queue: row.queue,
      classificationError: row.classificationError,
      createdAt: iso(row.createdAt),
      confidence: row.confidence == null ? null : Number(row.confidence),
      scores:
        row.scoreBug == null
          ? null
          : { bug: Number(row.scoreBug), feature: Number(row.scoreFeature), question: Number(row.scoreQuestion) },
      modelVersion: row.modelVersion,
      thresholdUsed: row.thresholdUsed == null ? null : Number(row.thresholdUsed),
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total: Number(total.rows[0].count),
  };
}

export async function updateTicket(id: string, input: { processStatus?: string; note?: string }) {
  const current = await getTicket(id);
  await withTx(async (client) => {
    if (input.processStatus && input.processStatus !== current.processStatus) {
      await client.query("UPDATE tickets SET process_status = $2, updated_at = NOW() WHERE id = $1", [
        id,
        input.processStatus,
      ]);
      await addEvent(client, id, "status_changed", { from: current.processStatus, to: input.processStatus });
    }
    if (input.note !== undefined && input.note !== (current.note ?? "")) {
      const note = input.note.trim() ? input.note.trim() : null;
      await client.query("UPDATE tickets SET note = $2, updated_at = NOW() WHERE id = $1", [id, note]);
      await addEvent(client, id, "note_updated", { note });
    }
  });
  return getTicket(id);
}

export async function reviewTicket(id: string, input: { action: "confirm" | "correct"; label?: Label; note?: string }) {
  const current = await getTicket(id);
  if (current.classificationStatus !== "classified" || !current.predictedLabel) {
    throw new HttpError(409, "This ticket is not classified yet", "NOT_CLASSIFIED");
  }
  const finalLabel = input.action === "confirm" ? current.predictedLabel : input.label;
  if (!finalLabel) throw new HttpError(400, "A label is required when correcting", "VALIDATION");
  const action = finalLabel === current.predictedLabel ? "confirm" : "correct";
  const previous = current.confirmedLabel ?? current.predictedLabel;
  const queue = queueForLabel(finalLabel);
  const note = input.note?.trim() ? input.note.trim() : null;
  await withTx(async (client) => {
    await client.query(
      `UPDATE tickets
       SET confirmed_label = $2, queue = $3, review_status = 'confirmed', updated_at = NOW()
       WHERE id = $1`,
      [id, finalLabel, queue],
    );
    await client.query(
      `INSERT INTO reviews (ticket_id, action, confirmed_label, previous_label, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, action, finalLabel, previous, note],
    );
    await addEvent(client, id, action === "confirm" ? "review_confirmed" : "review_corrected", {
      from: previous,
      to: finalLabel,
      queue,
      note,
    });
  });
  return getTicket(id);
}

export async function retryTicket(id: string) {
  const current = await getTicket(id);
  try {
    await applyPrediction(id, current.title, current.body, Boolean(current.confirmedLabel));
    return { ticket: await getTicket(id), classificationError: null };
  } catch (error) {
    const message = error instanceof ModelCallError ? error.message : "Classification failed";
    if (current.predictedLabel) {
      await pool.query("UPDATE tickets SET classification_error = $2, updated_at = NOW() WHERE id = $1", [id, message]);
    } else {
      await pool.query(
        `UPDATE tickets SET classification_status = 'failed', classification_error = $2, updated_at = NOW() WHERE id = $1`,
        [id, message],
      );
    }
    await pool.query(
      "INSERT INTO ticket_events (ticket_id, event_type, payload) VALUES ($1, 'classification_failed', $2::jsonb)",
      [id, JSON.stringify({ message, retry: true })],
    );
    return { ticket: await getTicket(id), classificationError: message };
  }
}
