import Link from "next/link";
import { TREND_METHOD, pct, type Snapshot } from "@/lib/market-data/snapshot";
import { fmtPrice } from "@/lib/market-data/bars";
import { TrendLabel } from "./TrendLabel";
import { fmtDate } from "@/lib/format";
import { DEGREE_LABEL, SWING_LABEL, type SwingStructure } from "@/lib/analysis/pivots";
import type { SwingSummary } from "@/lib/analysis/server";

const TONE: Record<SwingStructure, string> = {
  higher_highs_lows: "text-pos", lower_highs_lows: "text-neg", expanding: "text-fg", contracting: "text-fg", insufficient: "text-fg-3",
};

/** The panel beside the chart. Moving-average trend, engine swing structure; candidate wave counts render in WaveCounts. */
export function StructureSummary({ snap, swings }: { snap: Snapshot | null; swings: SwingSummary | null }) {
  const vs50 = snap?.sma50 && snap.close && snap.n50 >= 50 ? snap.close / snap.sma50 - 1 : null;
  const vs200 = snap?.sma200 && snap.close && snap.n200 >= 200 ? snap.close / snap.sma200 - 1 : null;
  const slope = snap?.sma50 && snap.sma50_prior && snap.n50 >= 50 ? snap.sma50 / snap.sma50_prior - 1 : null;
  const year = snap && snap.bars >= 250 && snap.high_52w && snap.low_52w && snap.close != null;
  const pos = year ? (snap!.close! - snap!.low_52w!) / (snap!.high_52w! - snap!.low_52w!) : null;

  return (
    <aside className="card flex flex-col">
      <div className="card-h"><h2 className="card-t">Market structure</h2></div>
      <div className="flex flex-col gap-6 px-5 py-5">
        <div>
          <div className="label">Trend</div>
          <div className="mt-1.5 text-[22px] font-[620] tracking-[-0.025em]">
            {snap ? <TrendLabel trend={snap.trend} /> : <span className="text-fg-3">No history</span>}
          </div>
          <p className="mt-1 text-[12.5px] text-fg-3">{snap?.trend === "insufficient" ? "Needs 200 sessions; history is still loading." : "Moving-average classification."}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Metric k="vs 50-day average" v={pct(vs50, 1)} tone={vs50} />
          <Metric k="vs 200-day average" v={pct(vs200, 1)} tone={vs200} />
          <Metric k="50-day slope, 20 sessions" v={pct(slope, 1)} tone={slope} />
          <Metric k="Sessions stored" v={snap ? String(snap.bars) : "—"} />
        </dl>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="label">52-week range</span>
            {pos != null && <span className="num text-[12.5px] text-fg-2">{Math.round(pos * 100)}th percentile</span>}
          </div>
          {pos != null ? (
            <>
              <div className="relative mt-2.5 h-1.5 rounded-full bg-hover">
                <span className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" style={{ left: `${pos * 100}%` }} />
              </div>
              <div className="num mt-2 flex justify-between text-[12.5px] text-fg-3">
                <span>{fmtPrice(snap!.low_52w)}</span><span>{fmtPrice(snap!.high_52w)}</span>
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-[12.5px] text-fg-3">Appears once a full year of bars is stored.</p>
          )}
        </div>

        <SwingSection swings={swings} />

        <div className="border-t border-line pt-5">
          <div className="flex items-center gap-2 text-[13.5px] font-medium">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-brand" aria-hidden /> Elliott Wave
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
            Candidate counts below are built on these swings and each one passes every rule in the{" "}
            <Link href="/analysis/rulebook" className="text-brand hover:underline">rulebook</Link>. Fibonacci targets and confluence zones
            are live; ranking arrives in Phase 7, so no count is presented as the preferred one yet.
          </p>
        </div>
      </div>
      <div className="src mt-auto"><span><b>Method</b>{TREND_METHOD} Swings: adaptive ZigZag on daily bars{swings ? `, ${swings.version}` : ""}.</span></div>
    </aside>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: number | null }) {
  return (
    <div>
      <dt className="text-[12.5px] text-fg-3">{k}</dt>
      <dd className={`num mt-0.5 text-[16px] font-[600] tracking-[-0.015em] ${tone == null ? "" : tone >= 0 ? "text-pos" : "text-neg"}`}>{v}</dd>
    </div>
  );
}

function SwingSection({ swings }: { swings: SwingSummary | null }) {
  if (!swings) {
    return (
      <div className="border-t border-line pt-5">
        <div className="label">Swing structure</div>
        <p className="mt-1.5 text-[12.5px] text-fg-3">Appears once daily bars are stored.</p>
      </div>
    );
  }
  const inter = swings.pivots.degrees.intermediate;
  const last = inter.pivots.at(-1);
  const pend = inter.pending;
  const move = last && pend ? pend.price / last.price - 1 : null;
  const lastHigh = [...inter.pivots].reverse().find((p) => p.type === "high");
  const lastLow = [...inter.pivots].reverse().find((p) => p.type === "low");
  const order = ["primary", "intermediate", "minor"] as const;

  return (
    <div className="border-t border-line pt-5">
      <div className="flex items-baseline justify-between">
        <span className="label">Swing structure, daily</span>
        <span className="text-[12px] text-fg-3">as of {fmtDate(swings.asOf)}</span>
      </div>
      <dl className="mt-2.5 flex flex-col gap-2">
        {order.map((d) => (
          <div key={d} className="flex items-baseline justify-between gap-3 text-[13px]">
            <dt className="text-fg-3">{DEGREE_LABEL[d]}</dt>
            <dd className={`text-right font-medium ${TONE[swings.pivots.degrees[d].structure]}`}>{SWING_LABEL[swings.pivots.degrees[d].structure]}</dd>
          </div>
        ))}
      </dl>
      {last && pend && move != null && (
        <p className="mt-3.5 text-[12.5px] leading-relaxed text-fg-2">
          Intermediate swing {pend.direction === "up" ? "rising" : "falling"} from{" "}
          <span className="num font-medium text-fg">{fmtPrice(last.price)}</span> ({fmtDate(last.ts)}),{" "}
          <span className={`num font-medium ${move >= 0 ? "text-pos" : "text-neg"}`}>{pct(move, 1)}</span> so far. A{" "}
          <span className="num">{(pend.threshold * 100).toFixed(1)}%</span> reversal from{" "}
          <span className="num">{fmtPrice(pend.price)}</span> would confirm a swing {pend.direction === "up" ? "high" : "low"}.
        </p>
      )}
      {(lastHigh || lastLow) && (
        <div className="num mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
          <div><div className="text-fg-3">Last swing high</div><div className="font-medium">{lastHigh ? fmtPrice(lastHigh.price) : "—"}</div><div className="text-fg-3">{lastHigh ? fmtDate(lastHigh.ts) : ""}</div></div>
          <div><div className="text-fg-3">Last swing low</div><div className="font-medium">{lastLow ? fmtPrice(lastLow.price) : "—"}</div><div className="text-fg-3">{lastLow ? fmtDate(lastLow.ts) : ""}</div></div>
        </div>
      )}
    </div>
  );
}
