import { Tag } from "antd";
import { colors } from "../theme";

export function QueueTag({ value }: { value?: string | null }) {
  if (!value) return <span>—</span>;
  if (value === "Human review" || value === "人工复核") return <Tag color={colors.review}>{value === "人工复核" ? "Human review" : value}</Tag>;
  const renamed: Record<string, string> = {
    缺陷处理: "Defect",
    功能需求: "Feature request",
    技术支持: "Technical support",
  };
  return <Tag>{renamed[value] ?? value}</Tag>;
}
