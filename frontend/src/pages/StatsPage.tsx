import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, DatePicker, Form, Row, Select, Skeleton, Statistic } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import domain from "@shared/domain.json";
import { api } from "../api";
import { labelText, processText } from "../labels";
import { colors } from "../theme";
import type { Stats } from "../types";

export function StatsPage() {
  const [form] = Form.useForm();
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const values = form.getFieldsValue();
      setData(
        await api.stats({
          project: values.project,
          from: values.range?.[0] ? dayjs(values.range[0]).format("YYYY-MM-DD") : undefined,
          to: values.range?.[1] ? dayjs(values.range[1]).format("YYYY-MM-DD") : undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <Form form={form} layout="inline" className="filter-bar" onFinish={() => void load()}>
        <Form.Item name="project">
          <Select allowClear placeholder="Project" style={{ width: 220 }} options={domain.repositories.map((item) => ({ value: item, label: item }))} />
        </Form.Item>
        <Form.Item name="range">
          <DatePicker.RangePicker />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          Filter
        </Button>
        <Button href="/api/feedback/export">Export feedback CSV</Button>
      </Form>
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>Retry</Button>} /> : null}
      {loading && !data ? <Skeleton active /> : null}
      {data ? (
        <>
          <Row gutter={16} className="block-gap">
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Tickets" value={data.total} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Needs review" value={data.pendingReview} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Classification failed" value={data.classificationFailed} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Corrections" value={data.correctionCount} />
              </Card>
            </Col>
          </Row>
          <Row gutter={16} className="block-gap">
            <Col xs={24} lg={12}>
              <Card title="Label distribution">
                <ReactECharts
                  style={{ height: 280 }}
                  option={{
                    tooltip: { trigger: "item" },
                    series: [
                      {
                        type: "pie",
                        radius: ["40%", "70%"],
                        data: data.byLabel.map((item) => ({
                          name: labelText[item.label as keyof typeof labelText] ?? item.label,
                          value: item.count,
                          itemStyle: { color: colors[item.label as keyof typeof colors] },
                        })),
                      },
                    ],
                  }}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Queue distribution">
                <ReactECharts
                  style={{ height: 280 }}
                  option={{
                    tooltip: {},
                    xAxis: { type: "category", data: data.byQueue.map((item) => item.queue) },
                    yAxis: { type: "value" },
                    series: [{ type: "bar", data: data.byQueue.map((item) => item.count), itemStyle: { color: "#1677ff" } }],
                  }}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Processing status" className="block-gap">
                <ReactECharts
                  style={{ height: 280 }}
                  option={{
                    tooltip: {},
                    xAxis: { type: "category", data: data.byProcessStatus.map((item) => processText[item.status as keyof typeof processText] ?? item.status) },
                    yAxis: { type: "value" },
                    series: [{ type: "bar", data: data.byProcessStatus.map((item) => item.count), itemStyle: { color: "#69b1ff" } }],
                  }}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Submission trend" className="block-gap">
                <ReactECharts
                  style={{ height: 280 }}
                  option={{
                    tooltip: { trigger: "axis" },
                    xAxis: { type: "category", data: data.trend.map((item) => item.date) },
                    yAxis: { type: "value" },
                    series: [{ type: "line", data: data.trend.map((item) => item.count), smooth: true }],
                  }}
                />
              </Card>
            </Col>
          </Row>
        </>
      ) : null}
    </div>
  );
}
