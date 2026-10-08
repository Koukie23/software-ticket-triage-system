import { colors } from "../theme";
import { labelText } from "../labels";
import type { Label, Scores } from "../types";

const order: Label[] = ["bug", "feature", "question"];

export function ScoreBars({ scores }: { scores?: Scores | null }) {
  if (!scores) return null;
  return (
    <div>
      {order.map((label) => {
        const percent = Math.max(0, Math.min(100, scores[label] * 100));
        return (
          <div key={label} className="score-row">
            <span className="score-name">{labelText[label]}</span>
            <div className="score-track">
              <div className="score-fill" style={{ width: `${percent}%`, background: colors[label] }} />
            </div>
            <span className="score-pct">{percent.toFixed(1)}%</span>
          </div>
        );
      })}
      <p className="muted">These scores are model probabilities, not verified accuracy.</p>
    </div>
  );
}
