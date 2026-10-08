import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError, z } from "zod";
import { pool } from "./db";
import { migrate } from "./db";
import { domain, port } from "./env";
import { HttpError } from "./http";
import { checkModelHealth } from "./modelClient";
import { exportFeedbackCsv, getStats, readModelResults } from "./stats";
import { createTicket, getTicket, listTickets, retryTicket, reviewTicket, updateTicket } from "./tickets";
import type { Label } from "./triage";

const labels = domain.labels as [Label, ...Label[]];
const repositories = domain.repositories as [string, ...string[]];
const processStatuses = domain.processStatuses as [string, ...string[]];
const reviewStatuses = domain.reviewStatuses as [string, ...string[]];
const classificationStatuses = domain.classificationStatuses as [string, ...string[]];
const queues = [
  domain.queues.bug,
  domain.queues.feature,
  domain.queues.question,
  domain.queues.review,
] as [string, ...string[]];

const createSchema = z.object({
  project: z.enum(repositories),
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
  body: z
    .string()
    .min(1, "Body is required")
    .max(20000, "Body must be at most 20,000 characters")
    .refine((value) => value.trim().length > 0, "Body is required"),
});

const patchSchema = z
  .object({
    processStatus: z.enum(processStatuses).optional(),
    note: z.string().max(5000, "Note must be at most 5,000 characters").optional(),
  })
  .refine((value) => value.processStatus !== undefined || value.note !== undefined, "Nothing to save");

const reviewSchema = z
  .object({
    action: z.enum(["confirm", "correct"]),
    label: z.enum(labels).optional(),
    note: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "correct" && !value.label) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A label is required when correcting", path: ["label"] });
    }
  });

function optionalEnum(value: unknown, allowed: readonly string[]): string | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value);
  if (!allowed.includes(text)) throw new HttpError(400, `Invalid filter value: ${text}`, "VALIDATION");
  return text;
}

function optionalDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpError(400, "Dates must use YYYY-MM-DD", "VALIDATION");
  return text;
}

function pageNumber(value: unknown, fallback: number, max = 100000): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        level: "info",
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - started,
      }),
    );
  });
  next();
});

app.get("/api/health", async (_req, res) => {
  let database: "ok" | "down" = "ok";
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    database = "down";
    console.error(JSON.stringify({ level: "error", message: "数据库不可用", detail: String(error) }));
  }
  const model = await checkModelHealth();
  res.json({ database, model: model.ok ? "ok" : "down", modelVersion: model.modelVersion });
});

app.post("/api/tickets", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const result = await createTicket(input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/tickets", async (req, res, next) => {
  try {
    const q = req.query.q ? String(req.query.q).slice(0, 100) : undefined;
    const result = await listTickets({
      q,
      project: optionalEnum(req.query.project, repositories),
      predictedLabel: optionalEnum(req.query.predictedLabel, labels),
      confirmedLabel: optionalEnum(req.query.confirmedLabel, labels),
      queue: optionalEnum(req.query.queue, queues),
      processStatus: optionalEnum(req.query.processStatus, processStatuses),
      reviewStatus: optionalEnum(req.query.reviewStatus, reviewStatuses),
      classificationStatus: optionalEnum(req.query.classificationStatus, classificationStatuses),
      page: pageNumber(req.query.page, 1),
      pageSize: pageNumber(req.query.pageSize, 10, 50),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/tickets/:id", async (req, res, next) => {
  try {
    res.json(await getTicket(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tickets/:id", async (req, res, next) => {
  try {
    const input = patchSchema.parse(req.body);
    res.json({ ticket: await updateTicket(req.params.id, input) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tickets/:id/review", async (req, res, next) => {
  try {
    const input = reviewSchema.parse(req.body);
    res.json({ ticket: await reviewTicket(req.params.id, input) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tickets/:id/retry-classification", async (req, res, next) => {
  try {
    res.json(await retryTicket(req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get("/api/stats", async (req, res, next) => {
  try {
    res.json(
      await getStats({
        project: optionalEnum(req.query.project, repositories),
        from: optionalDate(req.query.from),
        to: optionalDate(req.query.to),
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/model-results", (_req, res, next) => {
  try {
    res.json(readModelResults());
  } catch (error) {
    next(error);
  }
});

app.get("/api/feedback/export", async (_req, res, next) => {
  try {
    const csv = await exportFeedbackCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="feedback.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION",
        message: error.issues.map((issue) => issue.message).join("；"),
      },
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  const pgCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (pgCode === "22P02") {
    res.status(400).json({ error: { code: "VALIDATION", message: "Invalid ticket id" } });
    return;
  }
  console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : String(error) }));
  res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
});

migrate()
  .then(() => {
    app.listen(port, () => {
      console.log(JSON.stringify({ level: "info", message: `业务后端已启动`, port }));
    });
  })
  .catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "数据库初始化失败", detail: String(error) }));
    process.exit(1);
  });
