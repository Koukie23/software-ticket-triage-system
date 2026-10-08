import { useState } from "react";
import { Alert, Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { Link } from "react-router-dom";
import examples from "@shared/examples.json";
import domain from "@shared/domain.json";
import { api } from "../api";
import { LabelTag } from "../components/LabelTag";
import { QueueTag } from "../components/QueueTag";
import { ScoreBars } from "../components/ScoreBars";
import type { Ticket } from "../types";

export function SubmitPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ticket: Ticket; classificationError: string | null } | null>(null);

  const submit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    setError(null);
    try {
      const created = await api.createTicket(values);
      setResult(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-narrow">
      <Card>
        <Form form={form} layout="vertical" initialValues={{ project: domain.repositories[0] }}>
          <Form.Item name="project" label="Project" rules={[{ required: true, message: "Select a project" }]}>
            <Select options={domain.repositories.map((item) => ({ value: item, label: item }))} />
          </Form.Item>
          <Form.Item
            name="title"
            label="Title"
            extra="Use English to match the training data"
            rules={[{ required: true, message: "Enter a title" }, { max: 200, message: "Title must be at most 200 characters" }]}
          >
            <Input placeholder="Describe the software issue" />
          </Form.Item>
          <Form.Item
            name="body"
            label="Body"
            extra="Use English to match the training data"
            rules={[{ required: true, message: "Enter a body" }, { max: 20000, message: "Body must be at most 20,000 characters" }]}
          >
            <Input.TextArea rows={8} placeholder="Reproduction steps, expected behavior, or the question" />
          </Form.Item>
          <Space>
            <Button
              onClick={() => {
                const sample = examples[Math.floor(Math.random() * examples.length)];
                form.setFieldsValue(sample);
              }}
            >
              Fill example
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                setResult(null);
                setError(null);
              }}
            >
              Clear
            </Button>
            <Button type="primary" loading={loading} onClick={submit}>
              Submit
            </Button>
          </Space>
        </Form>
      </Card>
      {error ? <Alert className="block-gap" type="error" showIcon message={error} /> : null}
      {result ? (
        <Card className="block-gap" title="Classification result">
          {result.classificationError ? (
            <Alert
              type="error"
              showIcon
              message="Ticket saved, classification failed"
              description={
                <span>
                  {result.classificationError}. You can retry from the{" "}
                  <Link to={`/tickets/${result.ticket.id}`}>ticket detail</Link>.
                </span>
              }
            />
          ) : result.ticket.reviewStatus === "pending" ? (
            <Alert
              type="warning"
              showIcon
              message="Sent to human review"
              description="The top class score is below the threshold. Confirm the label before routing."
            />
          ) : (
            <Alert type="success" showIcon message="Auto-routed" />
          )}
          <div className="result-meta">
            <div>
              <Typography.Text type="secondary">Predicted label</Typography.Text>
              <div>
                <LabelTag value={result.ticket.predictedLabel} />
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">Queue</Typography.Text>
              <div>
                <QueueTag value={result.ticket.queue} />
              </div>
            </div>
            <div>
              <Link to={`/tickets/${result.ticket.id}`}>Open detail</Link>
            </div>
          </div>
          <ScoreBars scores={result.ticket.scores} />
        </Card>
      ) : null}
    </div>
  );
}
