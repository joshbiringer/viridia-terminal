import Link from "next/link";
import { GradeChip } from "@/components/analysis/GradeChip";
import { fmtPrice } from "@/lib/market-data/bars";
import { SETUP_LABEL } from "@/lib/analysis/candidates";
import { entryText } from "@/lib/analysis/setups";
import { SCENARIO_NOTE } from "@/lib/analysis/scenario";
import type { SetupRow } from "@/lib/analysis/setup-scan";
import { TickerButton } from "./SecurityDrawer";
import { CardHead } from "./Panels";

/**
 * Top technical opportunities, bullish and bearish side by side: the best-graded structural setups on
 * liquid names, each with its reference, the level that invalidates it, reward to risk and Pattern
 * Confidence. Research scenarios, not recommendations.
 */
export function Opportunities({ bullish, bearish, per = 5 }: { bullish: SetupRow[]; bearish: SetupRow[]; per?: number }) {
  const sides = [
    { side: "buy" as const, label: "Bullish", rows: bullish.slice(0, per) },
    { side: "sell" as const, label: "Bearish", rows: bearish.slice(0, per) },
  ];
  return (
    <section className="card flex flex-col" aria-labelledby="opp-t">
      <CardHead id="opp-t" title="Technical opportunities" sub="Structural setups · $25M+ a day · 1.5 : 1 or better"
        action={<Link href="/setups" className="btn ghost sm">All setups</Link>} />
      <div className="grid flex-1 gap-px bg-line md:grid-cols-2">
        {sides.map((s) => (
          <div key={s.side} className="flex flex-col bg-panel">
            <h3 className="flex items-center gap-2 px-4 pb-1 pt-2.5 text-[12px] font-medium" style={{ color: s.side === "buy" ? "var(--pos)" : "var(--neg)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.side === "buy" ? "var(--pos-chart)" : "var(--neg)" }} aria-hidden />
              {s.label}
              <span className="ml-auto font-normal text-fg-3">R : R · Conf.</span>
            </h3>
            {s.rows.length ? (
              <ol className="flex-1 divide-y divide-line">
                {s.rows.map((r) => (
                  <li key={r.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-2">
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <TickerButton symbol={r.symbol} className="tk text-[13px] hover:text-brand" />
                        <span className="truncate text-[12.5px] text-fg-2">{SETUP_LABEL[r.kind] ?? r.kind}</span>
                        {r.status === "waiting" && <span className="text-[11px] text-fg-3">waiting</span>}
                      </span>
                      <span className="num mt-0.5 block text-[11.5px] leading-snug text-fg-3">
                        Ref {r.setup ? entryText(r.setup) : "—"} · <span className="text-neg">Inv {r.setup ? fmtPrice(r.setup.stop.price) : "—"}</span> · <span className="text-pos">Tgt {r.setup ? fmtPrice(r.setup.target.price) : "—"}</span>
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="num text-[13px] font-[620]">{r.rr.toFixed(1)} <span className="font-normal text-fg-3">· {r.score ?? "—"}</span></span>
                      <GradeChip grade={r.grade} avgR={r.kind_avg_r} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="flex-1 px-4 py-3 text-[12.5px] leading-snug text-fg-3">
                No {s.label.toLowerCase()} setup on a liquid name meets the bar this session. That is a reading, not a gap in the data.
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="src"><span>{SCENARIO_NOTE} Inv is the level that invalidates the count; Conf. is Pattern Confidence.</span></div>
    </section>
  );
}
