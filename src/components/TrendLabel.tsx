import { TREND_LABEL, type Trend } from "@/lib/market-data/snapshot";

const COLOR: Record<Trend, string> = { uptrend: "var(--pos-chart)", mixed: "var(--neutral)", downtrend: "var(--neg)", insufficient: "var(--border-2)" };

export function TrendLabel({ trend }: { trend: Trend }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] ${trend === "insufficient" ? "text-fg-3" : "text-fg"}`}>
      <span className="dot" style={{ background: COLOR[trend] }} />
      {TREND_LABEL[trend]}
    </span>
  );
}
