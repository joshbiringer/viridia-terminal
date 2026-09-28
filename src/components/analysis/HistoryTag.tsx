import type { KindRecord } from "@/lib/analysis/track-record";

/** Compact track record for a setup kind: hit rate and average result, or "no history" for thin samples. */
export function HistoryTag({ h }: { h: KindRecord | undefined }) {
  if (!h || h.resolved < 10) return <span className="w-28 text-right text-[12px] text-fg-3" title="Fewer than 10 resolved past cases">little history</span>;
  const r = h.avg_r ?? 0;
  return (
    <span className="num w-28 text-right text-[12px]" title={`Past cases: ${h.resolved} resolved, target first in ${((h.hit_rate ?? 0) * 100).toFixed(0)}%, average ${r.toFixed(2)}R`}>
      <span className="text-fg-3">history </span>{((h.hit_rate ?? 0) * 100).toFixed(0)}% ·{" "}
      <span className={r >= 0 ? "text-pos" : "text-neg"}>{r >= 0 ? "+" : "−"}{Math.abs(r).toFixed(2)}R</span>
    </span>
  );
}
