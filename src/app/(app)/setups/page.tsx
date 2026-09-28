import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDollars, pct } from "@/lib/market-data/snapshot";
import { fmtInt, stockHref } from "@/lib/format";
import { ANALYSIS_VERSION, SETUP_LABEL, SETUP_METHOD, type SetupKind } from "@/lib/analysis/candidates";
import { DEGREE_LABEL, type Degree } from "@/lib/analysis/pivots";
import { entryText } from "@/lib/analysis/setups";
import { setupScan } from "@/lib/analysis/setup-scan";
import { PageHeader } from "@/components/ui/PageHeader";
import { SideChip } from "@/components/analysis/SideChip";

export const metadata: Metadata = { title: "Setups" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const SIDES = [["", "Buy and sell"], ["buy", "Buy"], ["sell", "Sell"]] as const;
const STATUSES = [["", "Active and waiting"], ["active", "Active now"], ["waiting", "Waiting for entry"]] as const;
const KINDS = [["", "Any setup"], ...(Object.entries(SETUP_LABEL) as [SetupKind, string][])] as const;
const RRS = [["", "Any"], ["1.5", "1.5 : 1 or better"], ["2", "2 : 1 or better"], ["3", "3 : 1 or better"]] as const;
const SCORES = [["", "Any"], ["58", "Medium or higher (58+)"], ["70", "High (70+)"]] as const;
const DV = [["", "Any"], ["5000000", "$5M+"], ["25000000", "$25M+"], ["100000000", "$100M+"], ["1000000000", "$1B+"]] as const;
const SORTS = [["confidence", "Pattern Confidence"], ["rr", "Reward : risk"], ["risk", "Smallest risk"], ["dollar_volume", "Dollar volume"], ["symbol", "Ticker"]] as const;

type Params = Partial<Record<"side" | "status" | "kind" | "rr" | "score" | "dv" | "sort" | "page", string>>;

export default async function SetupsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const pick = <T extends readonly (readonly [string, string])[]>(opts: T, v?: string) => (opts.some(([k]) => k === v) ? v! : opts[0][0]);
  const side = pick(SIDES, sp.side), status = pick(STATUSES, sp.status), kind = pick(KINDS, sp.kind);
  const rr = pick(RRS, sp.rr), score = pick(SCORES, sp.score), dv = pick(DV, sp.dv), sort = pick(SORTS, sp.sort);
  const page = Math.max(1, Number(sp.page) || 1);

  const [rows, cov] = await Promise.all([
    setupScan({
      p_side: side || null, p_status: status || null, p_kind: kind || null, p_min_rr: rr ? Number(rr) : null,
      p_min_score: score ? Number(score) : null, p_min_dollar_volume: dv ? Number(dv) : null,
      p_sort: sort, p_limit: PAGE, p_offset: (page - 1) * PAGE,
    }).catch(() => null),
    db().rpc("structure_coverage", { p_version: ANALYSIS_VERSION }),
  ]);
  const coverage = (cov.data ?? null) as { ranked: number; total: number } | null;
  const total = rows?.[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (patch: Params) => {
    const merged: Params = { side, status, kind, rr, score, dv, sort: sort === "confidence" ? "" : sort, page: "", ...patch };
    const p = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return `/setups${p.size ? "?" + p : ""}`;
  };
  const filtered = !!(side || status || kind || rr || score || dv);
  const recomputing = coverage && coverage.ranked < coverage.total;

  return (
    <>
      <PageHeader
        title="Setups"
        description="Buy and sell setups from each security's preferred daily wave count: where to enter, where the count is wrong, and where it points."
      />

      <section className="card">
        <nav className="flex flex-wrap gap-2 border-b border-line px-5 py-4" aria-label="Quick filters">
          {([["Buy setups", { side: "buy" }], ["Sell setups", { side: "sell" }], ["Active now", { status: "active" }],
             ["Waiting for a pullback", { status: "waiting" }], ["Wave 3 under way", { kind: "wave3" }], ["2 : 1 or better", { rr: "2" }]] as [string, Params][])
            .map(([label, patch]) => {
              const on = Object.entries(patch).every(([k, v]) => ({ side, status, kind, rr } as Record<string, string>)[k] === v);
              const next = on ? Object.fromEntries(Object.keys(patch).map((k) => [k, ""])) : patch;
              return (
                <Link key={label} href={href(next)} aria-current={on ? "true" : undefined}
                  className={`inline-flex h-8 items-center rounded-[var(--r-md)] border px-3 text-[13px] transition-colors ${on ? "border-brand bg-[var(--accent-bg)] font-medium text-brand" : "border-line text-fg-2 hover:border-line-2 hover:text-fg"}`}>
                  {label}
                </Link>
              );
            })}
        </nav>

        <form action="/setups" className="grid grid-cols-2 gap-3 border-b border-line px-5 py-4 md:grid-cols-4 xl:grid-cols-[repeat(7,minmax(0,1fr))_auto]">
          <Select name="side" label="Side" value={side} options={SIDES} />
          <Select name="status" label="Status" value={status} options={STATUSES} />
          <Select name="kind" label="Setup" value={kind} options={KINDS} />
          <Select name="rr" label="Reward : risk" value={rr} options={RRS} />
          <Select name="score" label="Pattern Confidence" value={score} options={SCORES} />
          <Select name="dv" label="Dollar volume" value={dv} options={DV} />
          <Select name="sort" label="Sort by" value={sort} options={SORTS} />
          <div className="col-span-2 flex items-end gap-2 md:col-span-1">
            <button type="submit" className="btn pri w-full md:w-auto">Apply</button>
            {filtered && <Link href="/setups" className="btn">Reset</Link>}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
          <span className="num font-medium">{fmtInt(total)} setups</span>
          {recomputing && (
            <span className="text-fg-3">
              Setups appear as the engine recomputes: <span className="num">{fmtInt(coverage!.ranked)}</span> of <span className="num">{fmtInt(coverage!.total)}</span> securities so far, most-traded first.
            </span>
          )}
        </div>

        {rows === null ? (
          <div className="px-6 py-14 text-center text-fg-2">Setups couldn&apos;t be loaded. Try again in a moment.</div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="t dense">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="hidden lg:table-cell">Company</th>
                  <th>Setup</th>
                  <th className="r">Close</th>
                  <th className="r">Entry</th>
                  <th className="r">Stop</th>
                  <th className="r">Target</th>
                  <th className="r" title="Reward ÷ risk from the middle of the entry range">R : R</th>
                  <th className="r hidden sm:table-cell" title="Distance from entry to stop">Risk</th>
                  <th className="r hidden sm:table-cell" title="Pattern Confidence of the preferred count">Conf.</th>
                  <th className="r hidden xl:table-cell">$ volume (20d)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol}>
                    <td><Link href={stockHref(r.symbol)} className="tk hover:text-brand">{r.symbol}</Link></td>
                    <td className="hidden max-w-[240px] truncate text-fg-2 lg:table-cell">{r.name}</td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <SideChip side={r.side} short />
                        <span>{SETUP_LABEL[r.kind] ?? r.kind}</span>
                        {r.status === "waiting" && <span className="text-[12px] text-fg-3">waiting</span>}
                        <span className="hidden text-[12px] text-fg-3 md:inline">· {DEGREE_LABEL[r.degree as Degree] ?? r.degree}</span>
                      </span>
                    </td>
                    <td className="r num">{fmtPrice(r.close)}</td>
                    <td className="r num">{r.setup ? entryText(r.setup) : "—"}</td>
                    <td className="r num text-neg">{r.setup ? fmtPrice(r.setup.stop.price) : "—"}</td>
                    <td className="r num text-pos">{r.setup ? fmtPrice(r.setup.target.price) : "—"}</td>
                    <td className="r num font-medium">{r.rr.toFixed(1)}</td>
                    <td className="r num hidden text-fg-2 sm:table-cell">{pct(r.risk_pct, 1).replace("+", "")}</td>
                    <td className="r num hidden sm:table-cell">{r.score ?? "—"}</td>
                    <td className="r num hidden text-fg-2 xl:table-cell">{fmtDollars(r.dollar_volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center text-fg-2">
            {filtered ? "No setup matches these filters right now. Setups change as new bars arrive; try loosening a filter." : "No setups yet. They appear as the engine recomputes each security."}
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
          <span><b>Method</b>{SETUP_METHOD}</span>
          <span><b>Degree</b>Each security&apos;s setup comes from its preferred count at intermediate degree (primary, then minor, when intermediate has none).</span>
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
