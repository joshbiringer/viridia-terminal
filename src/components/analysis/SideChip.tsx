import type { Setup } from "@/lib/analysis/candidates";

export function SideChip({ side, short = false }: { side: Setup["side"]; short?: boolean }) {
  return (
    <span className={`chip ${side === "buy" ? "pos" : "neg"} uppercase tracking-[0.04em]`}>
      {side === "buy" ? (short ? "Buy" : "Buy setup") : (short ? "Sell" : "Sell setup")}
    </span>
  );
}
