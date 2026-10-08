import { Tag } from "antd";
import { colors } from "../theme";
import { labelText } from "../labels";
import type { Label } from "../types";

export function LabelTag({ value }: { value?: Label | string | null }) {
  if (!value) return <span>—</span>;
  const color = colors[value as Label] ?? "#8c8c8c";
  return <Tag color={color}>{labelText[value as Label] ?? value}</Tag>;
}
