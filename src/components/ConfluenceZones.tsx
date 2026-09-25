import { fmtPrice } from "@/lib/market-data/bars";
import { DEGREE_LABEL } from "@/lib/analysis/pivots";
import { FIB_METHOD, type ClientFib, type ConfluenceZone } from "@/lib/analysis/candidates";

const KIND: Record<ConfluenceZone["levels"][number]["kind"], string> = {
  retracement: "Retracement", projection: "Projection", channel: "Channel", prior_fourth: "Prior 4th", swing: "Swing",
};

/**
 * Fibonacci confluence zones (engine Phase 6): price bands where independent Fibonacci relationships,
 * channels and prior-fourth levels from the rule-valid counts and recent swings coincide.
 */
export function ConfluenceZones({ fib }: { fib: ClientFib | null }) {
  const zones = fib?.zones ?? [];
  const above = zones.filter((z) => z.side === "above").sort((a, b) => a.mid - b.mid);
  const below = zones.filter((z) => z.side === "below").sort((a, b) => b.mid - a.mid);
  const maxStrength = Math.max(1, ...zones.map((z) => z.strength));

  return (
    <div className="card">
      <div className="card-h">
        <h2 className="card-t">Fibonacci confluence</h2>
        {fib && <span className="card-s ml-auto num">Close {fmtPrice(fib.close)}</span>}
      </div>
      {!fib ? (
        <p className="px-5 py-6 text-[13.5px] text-fg-3">Appears once daily bars are stored.</p>
      ) : zones.length === 0 ? (
        <p className="px-5 py-6 text-[13.5px] text-fg-2">
          No price band within 35% of the close has two or more independent Fibonacci relationships yet.
        </p>
      ) : (
        <div className="flex flex-col">
          <Group title="Above the close" zones={above} max={maxStrength} />
          <div className="flex items-center gap-3 px-5 py-2 text-[12px] text-fg-3">
            <span className="h-px flex-1 bg-line-2" /><span className="num">{fmtPrice(fib.close)} close</span><span className="h-px flex-1 bg-line-2" />
          </div>
          <Group title="Below the close" zones={below} max={maxStrength} />
        </div>
      )}
      <div className="src"><span><b>Method</b> {FIB_METHOD}</span></div>
    </div>
  );
}

function Group({ title, zones, max }: { title: string; zones: ConfluenceZone[]; max: number }) {
  if (!zones.length) return <p className="px-5 py-3 text-[12.5px] text-fg-3">{title}: none</p>;
  return (
    <ul className="divide-y divide-line">
      {zones.map((z) => (
        <li key={`${z.low}-${z.high}`}>
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 hover:bg-hover">
              <span className="num min-w-[150px] text-[14px] font-medium">
                {fmtPrice(z.low)}{z.high - z.low > 1e-9 ? ` – ${fmtPrice(z.high)}` : ""}
              </span>
              <span className={`num text-[12.5px] ${z.side === "above" ? "text-pos" : "text-neg"}`}>
                {z.distancePct >= 0 ? "+" : "−"}{Math.abs(z.distancePct * 100).toFixed(1)}%
              </span>
              <span className="text-[12.5px] text-fg-2">{z.count} relationships · {z.degrees.map((d) => DEGREE_LABEL[d]).join(", ")}</span>
              <span className="ml-auto flex items-center gap-2" title={`Strength ${z.strength}: weighted count, not a probability`}>
                <span className="bar w-20"><span className="block h-full rounded-full bg-fib" style={{ width: `${(z.strength / max) * 100}%` }} /></span>
                <span className="num w-8 text-right text-[12.5px] text-fg-2">{z.strength}</span>
              </span>
            </summary>
            <ul className="flex flex-col gap-1.5 bg-panel-2 px-5 py-3 text-[12.5px]">
              {z.levels.slice().sort((a, b) => a.price - b.price).map((l, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num w-20 shrink-0 text-right font-medium">{fmtPrice(l.price)}</span>
                  <span className="chip fib shrink-0">{KIND[l.kind]}</span>
                  <span className="text-fg-2">{l.label}<span className="text-fg-3"> · {DEGREE_LABEL[l.degree]} · {l.source}{l.primary ? "" : " · secondary ratio"}</span></span>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
