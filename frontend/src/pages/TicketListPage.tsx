import { useEffect, useState } from "react";
import { Alert, Button, Empty, Form, Input, Select, Space, Table, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import domain from "@shared/domain.json";
import { api } from "../api";
import { LabelTag } from "../components/LabelTag";
import { QueueTag } from "../components/QueueTag";
import { classificationText, processText, queues, reviewText } from "../labels";
import { colors } from "../theme";
import type { Ticket } from "../types";

const labels = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "question", label: "Question" },
];

export function TicketListPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ items: Ticket[]; total: number; page: number; pageSize: number }>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });

  const load = async (page = 1, pageSize = data.pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const values = form.getFieldsValue();
      const result = await api.listTickets({ ...values, page, pageSize });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
  }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Form form={form} layout="inline" onFinish={() => void load(1)} className="filter-bar">
        <Form.Item name="q">
          <Input allowClear placeholder="Search title or body" style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="project">
          <Select allowClear placeholder="Project" style={{ width: 200 }} options={domain.repositories.map((item) => ({ value: item, label: item }))} />
        </Form.Item>
        <Form.Item name="predictedLabel">
          <Select allowClear placeholder="Predicted" style={{ width: 120 }} options={labels} />
        </Form.Item>
        <Form.Item name="confirmedLabel">
          <Select allowClear placeholder="Confirmed" style={{ width: 120 }} options={labels} />
        </Form.Item>
        <Form.Item name="queue">
          <Select allowClear placeholder="Queue" style={{ width: 160 }} options={queues.map((item) => ({ value: item, label: item }))} />
        </Form.Item>
        <Form.Item name="reviewStatus">
          <Select
            allowClear
            placeholder="Review"
            style={{ width: 120 }}
            options={Object.entries(reviewText).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item name="processStatus">
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 120 }}
            options={Object.entries(processText).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item name="classificationStatus">
          <Select
            allowClear
            placeholder="Classification"
            style={{ width: 120 }}
            options={Object.entries(classificationText).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          Filter
        </Button>
      </Form>
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void load(data.page)}>Retry</Button>} /> : null}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={data.items}
        onRow={(record) => ({ onClick: () => navigate(`/tickets/${record.id}`), style: { cursor: "pointer" } })}
        rowClassName={(record) => (record.reviewStatus === "pending" ? "review-row" : "")}
        locale={{
          emptyText: (
            <Empty description="No tickets yet">
              <Button type="primary" onClick={() => navigate("/submit")}>
                Submit a ticket
              </Button>
            </Empty>
          ),
        }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onChange: (page, pageSize) => void load(page, pageSize),
        }}
        columns={[
          { title: "ID", dataIndex: "id", width: 88, render: (value: string) => value.slice(0, 8) },
          { title: "Project", dataIndex: "project", width: 180 },
          { title: "Title", dataIndex: "title", ellipsis: true },
          { title: "Predicted", dataIndex: "predictedLabel", width: 100, render: (value) => <LabelTag value={value} /> },
          { title: "Confirmed", dataIndex: "confirmedLabel", width: 110, render: (value) => <LabelTag value={value} /> },
          {
            title: "Score",
            dataIndex: "confidence",
            width: 80,
            render: (value: number | null) => (value == null ? "—" : `${(value * 100).toFixed(1)}%`),
          },
          { title: "Queue", dataIndex: "queue", width: 140, render: (value) => <QueueTag value={value} /> },
          { title: "Status", dataIndex: "processStatus", width: 110, render: (value: keyof typeof processText) => processText[value] },
          {
            title: "Review",
            dataIndex: "reviewStatus",
            width: 120,
            render: (value: keyof typeof reviewText | null) =>
              value === "pending" ? <Tag color={colors.review}>Needs review</Tag> : value ? reviewText[value] : "—",
          },
          {
            title: "Classification",
            dataIndex: "classificationStatus",
            width: 130,
            render: (value: keyof typeof classificationText) =>
              value === "failed" ? <Tag color="error">Failed</Tag> : classificationText[value],
          },
          { title: "Created", dataIndex: "createdAt", width: 170, render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm") },
        ]}
      />
    </Space>
  );
}
