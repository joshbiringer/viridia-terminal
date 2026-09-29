import Link from "next/link";
import type { Metadata } from "next";
import { scan, TREND_METHOD } from "@/lib/market-data/snapshot";
import { db } from "@/lib/supabase";
import { ANALYSIS_VERSION, RANK_METHOD } from "@/lib/analysis/candidates";
import { exchangeLabel, fmtInt } from "@/lib/format";
import { ScannerTable } from "@/components/ScannerTable";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Scanner" };

const PAGE = 50;
/** Structure presets: each one filters on the preferred daily wave count (engine Phase 7). */
const STRUCTURE = [
  ["wave3", "Wave 3 in progress", "Preferred count is an impulse or diagonal in its third wave"],
  ["wave5", "Wave 5 in progress", "Preferred count is in its final motive wave"],
  ["wave_c", "Wave C in progress", "Preferred count is a zigzag or flat in its last leg"],
  ["abc_done", "Correction complete", "A three-wave zigzag or flat looks complete"],
  ["five_done", "Five waves complete", "A five-wave impulse or diagonal looks complete"],
  ["near_zone", "Near a Fib zone", "Within 3% of a Fibonacci confluence zone"],
  ["near_invalidation", "Near invalidation", "Within 3% of the level that breaks the preferred count"],
] as const;
const DIRS = [["", "Any direction"], ["up", "Up"], ["down", "Down"]] as const;
const SCORES = [["", "Any"], ["58", "Medium or higher (58+)"], ["70", "High (70+)"]] as const;
const TRENDS = [["", "Any trend"], ["uptrend", "Uptrend"], ["mixed", "Mixed"], ["downtrend", "Downtrend"]] as const;
const EXCHANGES = ["XNAS", "XNYS", "ARCX", "BATS", "XASE"];
const TYPES = [["", "Stocks and ETFs"], ["common", "Stocks"], ["etf", "ETFs"]] as const;
const DV = [["", "Any"], ["5000000", "$5M+"], ["25000000", "$25M+"], ["100000000", "$100M+"], ["1000000000", "$1B+"]] as const;
const NEAR = [["", "Anywhere"], ["high", "Near 52-week high"], ["low", "Near 52-week low"]] as const;
const SWINGS = [["", "Any"], ["higher_highs_lows", "Higher highs and lows"], ["lower_highs_lows", "Lower highs and lows"], ["expanding", "Expanding"], ["contracting", "Contracting"]] as const;
const PATTERNS = [["", "Any pattern"], ["impulse", "Impulse"], ["leading_diagonal", "Leading diagonal"], ["ending_diagonal", "Ending diagonal"], ["zigzag", "Zigzag"], ["flat", "Flat"], ["triangle", "Triangle"]] as const;
const WAVES = [["", "Any position"], ["1", "Wave 1"], ["2", "Wave 2"], ["3", "Wave 3"], ["4", "Wave 4"], ["5", "Wave 5"], ["A", "Wave A"], ["B", "Wave B"], ["C", "Wave C"], ["D", "Wave D"], ["E", "Wave E"], ["complete", "Pattern complete"]] as const;
const ZDIST = [["", "Any"], ["0.01", "Within 1%"], ["0.03", "Within 3%"], ["0.05", "Within 5%"], ["0.1", "Within 10%"]] as const;
const ZSTR = [["", "Any"], ["2", "2+"], ["4", "4+"], ["6", "6+"]] as const;
const RANGE = [["", "Anywhere"], ["q1", "Bottom quarter"], ["h1", "Lower half"], ["h2", "Upper half"], ["q4", "Top quarter"]] as const;
const RANGE_BOUNDS: Record<string, [number | null, number | null]> = { q1: [null, 0.25], h1: [null, 0.5], h2: [0.5, null], q4: [0.75, null] };
const SORTS = [
  ["dollar_volume", "Dollar volume"], ["confidence", "Pattern Confidence"], ["invalidation", "Closest to invalidation"],
  ["zone", "Closest to a Fib zone"], ["change", "Today's change"], ["vs_sma200", "Strength vs 200-day"],
  ["from_high", "Closest to 52w high"], ["symbol", "Ticker"],
] as const;

type Params = Partial<Record<"trend" | "exchange" | "type" | "min" | "max" | "dv" | "near" | "sort" | "page" | "s" | "dir" | "score" | "view" | "sp" | "si" | "sm" | "pat" | "wave" | "zd" | "zs" | "rp", string>>;

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
  const structure = STRUCTURE.some(([k]) => k === sp.s) ? sp.s! : "";
  const dir = pick(DIRS, sp.dir);
  const score = pick(SCORES, sp.score);
  const swP = pick(SWINGS, sp.sp), swI = pick(SWINGS, sp.si), swM = pick(SWINGS, sp.sm);
  const pat = pick(PATTERNS, sp.pat), wave = pick(WAVES, sp.wave), zd = pick(ZDIST, sp.zd), zs = pick(ZSTR, sp.zs), rp = pick(RANGE, sp.rp);
  const detail = !!(swP || swI || swM || pat || wave || zd || zs || rp);
  const structural = !!(structure || dir || score || swP || swI || swM || pat || wave || zd || zs);
  const view = sp.view === "price" ? "price" : sp.view === "structure" || structural || sort === "confidence" || sort === "invalidation" || sort === "zone" ? "structure" : "price";

  const [rows, cov] = await Promise.all([
    scan({
      p_trend: trend || null, p_exchange: exchange || null, p_type: type || null,
      p_min_price: min, p_max_price: max, p_min_dollar_volume: dv ? Number(dv) : null,
      p_near: near || null, p_sort: sort, p_limit: PAGE, p_offset: (page - 1) * PAGE,
      p_structure: structure || null, p_direction: dir || null, p_min_score: score ? Number(score) : null,
      p_swing_primary: swP || null, p_swing_intermediate: swI || null, p_swing_minor: swM || null,
      p_pattern: pat || null, p_wave: wave || null, p_zone_max_dist: zd ? Number(zd) : null, p_zone_min_strength: zs ? Number(zs) : null,
      p_range_min: rp ? RANGE_BOUNDS[rp][0] : null, p_range_max: rp ? RANGE_BOUNDS[rp][1] : null,
    }),
    db().rpc("structure_coverage", { p_version: ANALYSIS_VERSION }),
  ]);
  const coverage = (cov.data ?? null) as { ranked: number; with_count: number; total: number } | null;
  const total = rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (patch: Params) => {
    const merged: Params = {
      trend, exchange, type, min: min ? String(min) : "", max: max ? String(max) : "", dv, near,
      sort: sort === "dollar_volume" ? "" : sort, s: structure, dir, score, view: sp.view === "price" || sp.view === "structure" ? sp.view : "",
      sp: swP, si: swI, sm: swM, pat, wave, zd, zs, rp,
      page: "", ...patch,
    };
    const p = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return `/scanner${p.size ? "?" + p : ""}`;
  };
  const filtered = !!(trend || exchange || type || min || max || dv || near || structural || rp);
  const recomputing = coverage && coverage.ranked < coverage.total;

  return (
    <>
      <PageHeader title="Wave Scanner" description="Screen thousands of securities by wave structure, trend, liquidity and price." />

      <section className="card">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-medium">Wave structure</span>
            <span className="text-[12.5px] text-fg-3">Filters on each security&apos;s preferred daily count</span>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Structure filters">
            {STRUCTURE.map(([k, label, hint]) => {
              const on = structure === k;
              return (
                <Link key={k} href={href({ s: on ? "" : k })} title={hint} aria-current={on ? "true" : undefined}
                  className={`inline-flex h-8 items-center rounded-[var(--r-md)] border px-3 text-[13px] transition-colors ${on ? "border-brand bg-[var(--accent-bg)] font-medium text-brand" : "border-line text-fg-2 hover:border-line-2 hover:text-fg"}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
          {recomputing && (
            <p className="text-[12.5px] text-fg-3">
              The latest analysis covers <span className="num">{coverage!.ranked.toLocaleString("en-US")}</span> of{" "}
              <span className="num">{coverage!.total.toLocaleString("en-US")}</span> securities so far; structure filters include only analysed securities.
            </p>
          )}
        </div>

        <form action="/scanner" className="grid grid-cols-2 gap-3 border-b border-line px-5 py-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-[repeat(9,minmax(0,1fr))_auto]">
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
          <Select name="dir" label="Wave in progress" value={dir} options={DIRS} />
          <Select name="score" label="Pattern Confidence" value={score} options={SCORES} />
          <Select name="sort" label="Sort by" value={sort} options={SORTS} />
          {structure && <input type="hidden" name="s" value={structure} />}
          <details className="col-span-full" open={detail}>
            <summary className="cursor-pointer text-[13px] text-fg-2 hover:text-fg">Structure and Fibonacci filters{detail ? " (in use)" : ""}</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <Select name="sp" label="Primary structure" value={swP} options={SWINGS} />
              <Select name="si" label="Intermediate structure" value={swI} options={SWINGS} />
              <Select name="sm" label="Minor structure" value={swM} options={SWINGS} />
              <Select name="pat" label="Count pattern" value={pat} options={PATTERNS} />
              <Select name="wave" label="Wave position" value={wave} options={WAVES} />
              <Select name="zd" label="Distance to Fib zone" value={zd} options={ZDIST} />
              <Select name="zs" label="Zone strength" value={zs} options={ZSTR} />
              <Select name="rp" label="52-week range position" value={rp} options={RANGE} />
            </div>
          </details>
          <div className="col-span-2 flex items-end gap-2 md:col-span-1 2xl:col-span-1">
            <button type="submit" className="btn pri w-full md:w-auto">Scan</button>
            {filtered && <Link href="/scanner" className="btn">Reset</Link>}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
          <span className="num font-medium">{fmtInt(total)} securities</span>
          <span className="hidden text-fg-3 sm:inline">from the automatic-coverage universe and names opened on demand</span>
          <div className="seg ml-auto" role="tablist" aria-label="Columns">
            <Link role="tab" aria-selected={view === "structure"} href={href({ view: "structure" })}>Wave structure</Link>
            <Link role="tab" aria-selected={view === "price"} href={href({ view: "price" })}>Price and trend</Link>
          </div>
        </div>
        {rows.length ? <ScannerTable rows={rows} structure={view === "structure"} /> : (
          <div className="px-6 py-14 text-center text-fg-2">
            {structural
              ? "No ranked security matches this structure right now. Structures change as new bars arrive; try another filter or a lower confidence."
              : "No securities match these filters. Trend and 52-week measures need up to a year of history for each security; try loosening a filter."}
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
        <div className="src">
          <span><b>Structure</b>The preferred count is the highest-ranked rule-valid count at intermediate degree (primary, then minor, when intermediate has none). {RANK_METHOD}</span>
          <span><b>Trend</b>{TREND_METHOD} 52-week measures need a full year of bars.</span>
          <span><b>Structure by degree</b>Swing structure of confirmed pivots at each degree. Count pattern and wave position describe the preferred count. Zone strength is a weighted count of overlapping Fibonacci relationships, not a probability.</span>
        </div>
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
