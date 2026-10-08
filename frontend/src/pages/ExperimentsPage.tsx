import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Card, Col, Row, Skeleton, Table, Typography } from "antd";
import ReactECharts from "echarts-for-react";
import { api } from "../api";
import { LabelTag } from "../components/LabelTag";
import { inputModeText } from "../labels";
import type { ModelResults } from "../types";

function pct(value?: number | null) {
  return value == null ? "—" : value.toFixed(3);
}

export function ExperimentsPage() {
  const [data, setData] = useState<ModelResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.modelResults());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) return <Skeleton active />;
  if (error) return <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>Retry</Button>} />;
  if (!data) return null;

  const labels = data.confusionMatrix.labels;
  const curve = data.curves[0];

  return (
    <SpaceStack>
      <Alert type="info" showIcon message={data.disclaimer} />
      {data.provisional ? <Alert type="warning" showIcon message="These are baseline results. DistilBERT experiments will replace them later." /> : null}
      <Card title="Selected model and threshold">
        <p>
          Selected model <Typography.Text code>{data.selectedModel.version}</Typography.Text>, input{" "}
          {inputModeText[data.selectedModel.inputMode] ?? data.selectedModel.inputMode}, threshold {data.selectedModel.threshold}.
        </p>
        <p>Validation Macro-F1 {pct(data.selectedModel.valMacroF1)}, test Macro-F1 {pct(data.selectedModel.testMacroF1)}.</p>
        <Typography.Paragraph>{data.selectedModel.reason}</Typography.Paragraph>
      </Card>
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="Data split">
            <ReactECharts
              style={{ height: 280 }}
              option={{
                tooltip: { trigger: "axis" },
                legend: { data: ["bug", "feature", "question"] },
                xAxis: { type: "category", data: data.dataProfile.byLabel.map((row) => String(row.split)) },
                yAxis: { type: "value" },
                series: ["bug", "feature", "question"].map((label) => ({
                  name: label,
                  type: "bar",
                  data: data.dataProfile.byLabel.map((row) => Number(row[label] ?? 0)),
                })),
              }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Training curve">
            {curve ? (
              <ReactECharts
                style={{ height: 280 }}
                option={{
                  tooltip: { trigger: "axis" },
                  xAxis: { type: "category", data: curve.epochs.map((item) => item.epoch) },
                  yAxis: [{ type: "value", name: "Loss" }, { type: "value", name: "Macro-F1" }],
                  series: [
                    { name: "Train loss", type: "line", data: curve.epochs.map((item) => item.trainLoss) },
                    { name: "Val Macro-F1", type: "line", yAxisIndex: 1, data: curve.epochs.map((item) => item.valMacroF1) },
                  ],
                }}
              />
            ) : (
              <p className="muted">The baseline model has no per-epoch training curve.</p>
            )}
          </Card>
        </Col>
      </Row>
      <Card title={data.confusionMatrix.title}>
        <ReactECharts
          style={{ height: 320 }}
          option={{
            tooltip: {},
            xAxis: { type: "category", data: labels, name: "Predicted" },
            yAxis: { type: "category", data: labels, name: "True" },
            visualMap: { min: 0, max: Math.max(...data.confusionMatrix.matrix.flat()), orient: "horizontal", left: "center" },
            series: [
              {
                type: "heatmap",
                data: data.confusionMatrix.matrix.flatMap((row, i) => row.map((value, j) => [j, i, value])),
                label: { show: true },
              },
            ],
          }}
        />
      </Card>
      {data.experiments.map((experiment) => (
        <Card key={experiment.id} title={experiment.title}>
          <p className="muted">{experiment.purpose}</p>
          <Table
            rowKey="name"
            size="middle"
            pagination={false}
            dataSource={experiment.rows}
            columns={[
              { title: "Setup", dataIndex: "name" },
              { title: "Input", dataIndex: "inputMode", render: (value: string) => inputModeText[value] ?? value },
              { title: "Macro-F1", dataIndex: "macroF1", render: pct },
              { title: "Accuracy", dataIndex: "accuracy", render: pct },
              { title: "Latency ms", dataIndex: "latencyMs", render: (value: number) => value.toFixed(1) },
            ]}
          />
        </Card>
      ))}
      <Card title="Per-repository Macro-F1">
        <Table
          rowKey={(row) => `${row.repository}-${row.split}`}
          size="middle"
          pagination={false}
          dataSource={data.perRepository}
          columns={[
            { title: "Repository", dataIndex: "repository" },
            { title: "Split", dataIndex: "split" },
            { title: "Macro-F1", dataIndex: "macroF1", render: pct },
            { title: "Accuracy", dataIndex: "accuracy", render: pct },
            { title: "Support", dataIndex: "support" },
          ]}
        />
      </Card>
      <Card title="Misclassified samples">
        <Table
          rowKey={(row) => `${row.split}-${row.title}`}
          size="middle"
          pagination={false}
          dataSource={data.misclassified}
          columns={[
            { title: "Split", dataIndex: "split", width: 90 },
            { title: "Repository", dataIndex: "repository", width: 180 },
            { title: "Title", dataIndex: "title", ellipsis: true },
            { title: "True", dataIndex: "trueLabel", width: 80, render: (value) => <LabelTag value={value} /> },
            { title: "Predicted", dataIndex: "predictedLabel", width: 110, render: (value) => <LabelTag value={value} /> },
            { title: "Score", dataIndex: "confidence", width: 90, render: (value: number) => `${(value * 100).toFixed(1)}%` },
          ]}
        />
      </Card>
    </SpaceStack>
  );
}

function SpaceStack({ children }: { children: ReactNode }) {
  return <div className="space-stack">{children}</div>;
}
