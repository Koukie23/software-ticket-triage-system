import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Form, Input, Radio, Row, Select, Skeleton, Space, Timeline, Typography, message } from "antd";
import { Link, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { api } from "../api";
import { LabelTag } from "../components/LabelTag";
import { QueueTag } from "../components/QueueTag";
import { ScoreBars } from "../components/ScoreBars";
import { processText } from "../labels";
import type { Label, Ticket } from "../types";

const eventText: Record<string, string> = {
  created: "Ticket created",
  classified: "Classified",
  classification_failed: "Classification failed",
  status_changed: "Status updated",
  note_updated: "Note updated",
  review_confirmed: "Label confirmed",
  review_corrected: "Label corrected",
};

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTicket(id);
      setTicket(result);
      form.setFieldsValue({ processStatus: result.processStatus, note: result.note ?? "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (loading && !ticket) return <Skeleton active />;
  if (error && !ticket) return <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>Retry</Button>} />;
  if (!ticket) return null;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Link to="/tickets">Back to tickets</Link>
      <Row gutter={16}>
        <Col xs={24} xl={14}>
          <Card title={ticket.title}>
            <p className="muted">
              {ticket.project} · {dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}
            </p>
            <pre className="ticket-body">{ticket.body}</pre>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="Model prediction" extra={<span className="muted">The original prediction is kept after correction</span>}>
            {ticket.classificationStatus === "failed" ? (
              <Alert type="error" showIcon message="Classification failed" description={ticket.classificationError ?? "Model service unavailable"} />
            ) : (
              <>
                <Space wrap>
                  <LabelTag value={ticket.predictedLabel} />
                  <QueueTag value={ticket.prediction?.queue ?? ticket.queue} />
                </Space>
                <div className="block-gap">
                  <ScoreBars scores={ticket.scores} />
                </div>
                <p className="muted">
                  Model {ticket.modelVersion ?? "—"} · threshold {ticket.thresholdUsed ?? "—"}
                </p>
              </>
            )}
            <Button
              className="block-gap"
              loading={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  const result = await api.retryTicket(ticket.id);
                  setTicket(result.ticket);
                  if (result.classificationError) message.error(`Retry failed: ${result.classificationError}`);
                  else message.success("Reclassified");
                } catch (err) {
                  message.error(err instanceof Error ? err.message : "Retry failed");
                } finally {
                  setRetrying(false);
                }
              }}
            >
              Retry classification
            </Button>
          </Card>
          <Card className="block-gap" title="Human review">
            {ticket.confirmedLabel ? (
              <p>
                Confirmed: <LabelTag value={ticket.confirmedLabel} /> Queue <QueueTag value={ticket.queue} />
              </p>
            ) : (
              <p className="muted">Not confirmed yet</p>
            )}
            <Form
              form={reviewForm}
              layout="vertical"
              initialValues={{ action: "confirm", label: ticket.predictedLabel ?? "bug" }}
            >
              <Form.Item name="action" label="Action">
                <Radio.Group>
                  <Radio.Button value="confirm">Confirm prediction</Radio.Button>
                  <Radio.Button value="correct">Correct label</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) =>
                  getFieldValue("action") === "correct" ? (
                    <Form.Item name="label" label="Correct label" rules={[{ required: true, message: "Select a label" }]}>
                      <Select
                        options={[
                          { value: "bug", label: "Bug" },
                          { value: "feature", label: "Feature" },
                          { value: "question", label: "Question" },
                        ]}
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
              <Form.Item name="note" label="Note">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Button
                type="primary"
                loading={reviewing}
                disabled={ticket.classificationStatus !== "classified"}
                onClick={async () => {
                  const values = await reviewForm.validateFields();
                  setReviewing(true);
                  try {
                    const result = await api.reviewTicket(ticket.id, values as { action: "confirm" | "correct"; label?: Label; note?: string });
                    setTicket(result.ticket);
                    message.success(values.action === "correct" ? "Label corrected" : "Label confirmed");
                  } catch (err) {
                    message.error(err instanceof Error ? err.message : "Save failed");
                  } finally {
                    setReviewing(false);
                  }
                }}
              >
                Save review
              </Button>
            </Form>
          </Card>
          <Card className="block-gap" title="Processing">
            <Form form={form} layout="vertical">
              <Form.Item name="processStatus" label="Status">
                <Select options={Object.entries(processText).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
              <Form.Item name="note" label="Note">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button
                loading={saving}
                onClick={async () => {
                  const values = await form.validateFields();
                  setSaving(true);
                  try {
                    const result = await api.updateTicket(ticket.id, values);
                    setTicket(result.ticket);
                    message.success("Status updated");
                  } catch (err) {
                    message.error(err instanceof Error ? err.message : "Save failed");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Save
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
      <Card title="History">
        <Timeline
          items={(ticket.events ?? []).map((event) => ({
            children: (
              <div>
                <Typography.Text strong>{eventText[event.eventType] ?? event.eventType}</Typography.Text>
                <div className="muted">{dayjs(event.createdAt).format("YYYY-MM-DD HH:mm:ss")}</div>
                <pre className="event-payload">{JSON.stringify(event.payload, null, 2)}</pre>
              </div>
            ),
          }))}
        />
      </Card>
    </Space>
  );
}
