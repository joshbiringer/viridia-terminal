import Link from "next/link";
import type { Metadata } from "next";
import { scan, TREND_METHOD } from "@/lib/market-data/snapshot";
import { exchangeLabel, fmtInt } from "@/lib/format";
import { ScannerTable } from "@/components/ScannerTable";

export const metadata: Metadata = { title: "Scanner" };

const PAGE = 50;
const STRUCTURE_FILTERS = [
  "Potential Wave 3", "Potential Wave 5", "ABC completion", "Bullish impulse",
  "Bearish impulse", "Fib confluence", "Near invalidation", "Trend reversal",
];
const TRENDS = [["", "Any trend"], ["uptrend", "Uptrend"], ["mixed", "Mixed"], ["downtrend", "Downtrend"]] as const;
const EXCHANGES = ["XNAS", "XNYS", "ARCX", "BATS", "XASE"];
const TYPES = [["", "Stocks and ETFs"], ["common", "Stocks"], ["etf", "ETFs"]] as const;
const DV = [["", "Any"], ["5000000", "$5M+"], ["25000000", "$25M+"], ["100000000", "$100M+"], ["1000000000", "$1B+"]] as const;
const NEAR = [["", "Anywhere"], ["high", "Near 52-week high"], ["low", "Near 52-week low"]] as const;
const SORTS = [["dollar_volume", "Dollar volume"], ["change", "Today's change"], ["vs_sma200", "Strength vs 200-day"], ["from_high", "Closest to 52w high"], ["symbol", "Ticker"]] as const;

type Params = Partial<Record<"trend" | "exchange" | "type" | "min" | "max" | "dv" | "near" | "sort" | "page", string>>;

export default async function ScannerPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const pick = <T extends readonly (readonly [string, string])[]>(opts: T, v?: string) => (opts.some(([k]) => k === v) ? v! : opts[0][0]);
  const trend = pick(TRENDS, sp.trend);
  const type = pick(TYPES, sp.type);
  const dv = pick(DV, sp.dv);
  const near = pick(NEAR, sp.near);
  const sort = pick(SORTS, sp.sort);
  const exchange = EXCHANGES.includes(sp.exchange ?? "") ? sp.exchange! : "";
  const min = Number(sp.min) > 0 ? Number(sp.min) : null;
  const max = Number(sp.max) > 0 ? Number(sp.max) : null;
  const page = Math.max(1, Number(sp.page) || 1);

  const rows = await scan({
    p_trend: trend || null, p_exchange: exchange || null, p_type: type || null,
    p_min_price: min, p_max_price: max, p_min_dollar_volume: dv ? Number(dv) : null,
    p_near: near || null, p_sort: sort, p_limit: PAGE, p_offset: (page - 1) * PAGE,
  });
  const total = rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (patch: Params) => {
    const merged: Params = { trend, exchange, type, min: min ? String(min) : "", max: max ? String(max) : "", dv, near, sort: sort === "dollar_volume" ? "" : sort, page: "", ...patch };
    const p = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return `/scanner${p.size ? "?" + p : ""}`;
  };
  const filtered = !!(trend || exchange || type || min || max || dv || near);

  return (
    <>
      <section className="max-w-[760px] pt-2">
        <h1 className="h2">Find market structure.</h1>
        <p className="lede mt-3">Scan thousands of securities for Elliott Wave structures, Fibonacci confluence and emerging trends.</p>
      </section>

      <section className="card">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-medium">Structure</span>
            <span className="text-[12.5px] text-fg-3">Available when the wave engine is live (Phase 10)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {STRUCTURE_FILTERS.map((f) => (
              <button key={f} disabled className="h-8 rounded-lg border border-dashed border-line-2 px-3 text-[13px] text-fg-3" title="Needs the wave engine">
                {f}
              </button>
            ))}
          </div>
        </div>

        <form action="/scanner" className="grid grid-cols-2 gap-3 border-b border-line px-5 py-4 md:grid-cols-4 2xl:grid-cols-[repeat(7,minmax(0,1fr))_auto]">
          <Select name="trend" label="Trend" value={trend} options={TRENDS} />
          <Select name="type" label="Asset class" value={type} options={TYPES} />
          <Select name="exchange" label="Exchange" value={exchange} options={[["", "Any exchange"], ...EXCHANGES.map((x) => [x, exchangeLabel(x)] as const)]} />
          <Select name="dv" label="Dollar volume" value={dv} options={DV} />
          <Select name="near" label="52-week position" value={near} options={NEAR} />
          <label className="flex flex-col gap-1.5">
            <span className="label">Price</span>
            <span className="flex items-center gap-1.5">
              <input className="field w-full min-w-0" name="min" inputMode="decimal" placeholder="Min" defaultValue={min ?? ""} aria-label="Minimum price" />
              <input className="field w-full min-w-0" name="max" inputMode="decimal" placeholder="Max" defaultValue={max ?? ""} aria-label="Maximum price" />
            </span>
          </label>
          <Select name="sort" label="Sort by" value={sort} options={SORTS} />
          <div className="col-span-2 flex items-end gap-2 md:col-span-1 2xl:col-span-1">
            <button type="submit" className="btn pri w-full md:w-auto">Scan</button>
            {filtered && <Link href="/scanner" className="btn">Reset</Link>}
          </div>
        </form>

        <div className="flex items-center gap-3 px-5 py-3 text-[13px]">
          <span className="num font-medium">{fmtInt(total)} securities</span>
          <span className="text-fg-3">from the automatic-coverage universe and names opened on demand</span>
        </div>
        {rows.length ? <ScannerTable rows={rows} /> : (
          <div className="px-6 py-14 text-center text-fg-2">
            No securities match. Trend filters need 200 sessions of history, which the backfill is still loading; try removing the trend filter.
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px]">
            <span className="text-fg-3">Page <span className="num">{page}</span> of <span className="num">{fmtInt(pages)}</span></span>
            <span className="ml-auto flex gap-2">
              {page > 1 && <Link className="btn sm" href={href({ page: String(page - 1) })}>Previous</Link>}
              {page < pages && <Link className="btn sm" href={href({ page: String(page + 1) })}>Next</Link>}
            </span>
          </div>
        )}
        <div className="src"><span><b>Method</b>{TREND_METHOD} 52-week measures need a full year of bars.</span></div>
      </section>
    </>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value} className="field w-full min-w-0">
        {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}
