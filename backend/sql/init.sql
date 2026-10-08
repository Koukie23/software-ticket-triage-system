CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project VARCHAR(128) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  process_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  classification_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  review_status VARCHAR(32),
  predicted_label VARCHAR(32),
  confirmed_label VARCHAR(32),
  queue VARCHAR(64),
  note TEXT,
  classification_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tickets_process_status_chk CHECK (process_status IN ('pending', 'in_progress', 'resolved')),
  CONSTRAINT tickets_classification_status_chk CHECK (classification_status IN ('pending', 'classified', 'failed')),
  CONSTRAINT tickets_review_status_chk CHECK (review_status IS NULL OR review_status IN ('auto', 'pending', 'confirmed')),
  CONSTRAINT tickets_predicted_label_chk CHECK (predicted_label IS NULL OR predicted_label IN ('bug', 'feature', 'question')),
  CONSTRAINT tickets_confirmed_label_chk CHECK (confirmed_label IS NULL OR confirmed_label IN ('bug', 'feature', 'question')),
  CONSTRAINT tickets_queue_chk CHECK (queue IS NULL OR queue IN ('Defect', 'Feature request', 'Technical support', 'Human review'))
);

CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets (project);
CREATE INDEX IF NOT EXISTS idx_tickets_process_status ON tickets (process_status);
CREATE INDEX IF NOT EXISTS idx_tickets_review_status ON tickets (review_status);
CREATE INDEX IF NOT EXISTS idx_tickets_classification_status ON tickets (classification_status);

CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  model_version VARCHAR(160) NOT NULL,
  predicted_label VARCHAR(32) NOT NULL,
  score_bug DOUBLE PRECISION NOT NULL,
  score_feature DOUBLE PRECISION NOT NULL,
  score_question DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  threshold_used DOUBLE PRECISION NOT NULL,
  queue VARCHAR(64),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT predictions_label_chk CHECK (predicted_label IN ('bug', 'feature', 'question'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_one_current
  ON predictions (ticket_id)
  WHERE is_current;
CREATE INDEX IF NOT EXISTS idx_predictions_ticket_created
  ON predictions (ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL,
  confirmed_label VARCHAR(32) NOT NULL,
  previous_label VARCHAR(32),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_action_chk CHECK (action IN ('confirm', 'correct')),
  CONSTRAINT reviews_label_chk CHECK (confirmed_label IN ('bug', 'feature', 'question'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_ticket ON reviews (ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events (ticket_id, created_at ASC);

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_queue_chk;
UPDATE tickets SET queue = 'Defect' WHERE queue = '缺陷处理';
UPDATE tickets SET queue = 'Feature request' WHERE queue = '功能需求';
UPDATE tickets SET queue = 'Technical support' WHERE queue = '技术支持';
UPDATE tickets SET queue = 'Human review' WHERE queue = '人工复核';
UPDATE predictions SET queue = 'Defect' WHERE queue = '缺陷处理';
UPDATE predictions SET queue = 'Feature request' WHERE queue = '功能需求';
UPDATE predictions SET queue = 'Technical support' WHERE queue = '技术支持';
UPDATE predictions SET queue = 'Human review' WHERE queue = '人工复核';
ALTER TABLE tickets ADD CONSTRAINT tickets_queue_chk CHECK (queue IS NULL OR queue IN ('Defect', 'Feature request', 'Technical support', 'Human review'));
