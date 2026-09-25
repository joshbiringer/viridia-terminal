import { TREND_METHOD, type Breadth } from "@/lib/market-data/snapshot";
import { fmtDate, fmtInt } from "@/lib/format";

/** Trend breadth across the automatic-coverage universe. Wave-structure counts join this once the engine exists. */
export function BreadthSummary({ b }: { b: Breadth }) {
  const ready = b.measured > 0;
  const rows: [string, number, string][] = [
    ["Uptrend", b.uptrend, "var(--pos-chart)"],
    ["Mixed", b.mixed, "var(--neutral)"],
    ["Downtrend", b.downtrend, "var(--neg)"],
  ];
  const total = Math.max(1, b.measured);
  return (
    <section className="card">
      <div className="card-h">
        <div>
          <h2 className="card-t">Market structure</h2>
          <p className="card-s mt-0.5">Trend across the {fmtInt(b.universe)} most liquid U.S. stocks and ETFs</p>
        </div>
        <span className="card-s ml-auto">As of close {fmtDate(b.as_of)}</span>
      </div>
      <div className="grid gap-8 px-5 py-5 lg:grid-cols-[1fr_1.1fr]">
        {ready ? (
          <div>
            <div className="grid grid-cols-3 gap-6">
              {rows.map(([k, n, c]) => (
                <div key={k}>
                  <div className="flex items-center gap-2 text-[13px] text-fg-2"><span className="dot" style={{ background: c }} />{k}</div>
                  <div className="num mt-1 text-[30px] font-[620] tracking-[-0.03em]">{fmtInt(n)}</div>
                  <div className="num text-[12.5px] text-fg-3">{((n / total) * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-hover" aria-hidden>
              {rows.map(([k, n, c]) => <span key={k} style={{ width: `${(n / total) * 100}%`, background: c }} />)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-center gap-2">
            <div className="text-[15px] font-medium">Trend classification needs 200 sessions of history</div>
            <p className="text-[13.5px] text-fg-2">
              The two-year backfill is filling that in now. Counts appear here automatically; until then, the measures on the right use the history already stored.
            </p>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-line lg:border-l lg:pl-8">
          <Stat k="Advancing today" v={fmtInt(b.advancers)} sub={`${fmtInt(b.decliners)} declining`} />
          <Stat k="Above 50-day average" v={b.measured_50 ? fmtInt(b.above_sma50) : "—"} sub={b.measured_50 ? `of ${fmtInt(b.measured_50)} measured` : "Needs 50 sessions"} />
          <Stat k="Near 52-week high" v={b.near_52w_high ? fmtInt(b.near_52w_high) : "—"} sub="Within 3%" />
          <Stat k="Near 52-week low" v={b.near_52w_low ? fmtInt(b.near_52w_low) : "—"} sub="Within 3%" />
        </dl>
      </div>
      <div className="src"><span><b>Method</b>{TREND_METHOD} Elliott Wave structure counts arrive with the wave engine.</span></div>
    </section>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div>
      <dt className="text-[13px] text-fg-2">{k}</dt>
      <dd className="num mt-0.5 text-[20px] font-[600] tracking-[-0.02em]">{v}</dd>
      <dd className="text-[12.5px] text-fg-3">{sub}</dd>
    </div>
  );
}
