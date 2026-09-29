import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { authClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmtInt, stockHref } from "@/lib/format";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

interface Job { name: string; schedule: string; active: boolean; last: { status: string; start: string; end: string | null; message: string | null } | null }
interface Finding { check_name: string; severity: "high" | "medium" | "info"; symbol: string | null; ts: string | null; detail: Record<string, unknown> }
interface Status {
  db_bytes: number; tables: { name: string; bytes: number }[]; jobs: Job[];
  coverage: { securities: number; latest: string | null; behind: number };
  analysis: Record<string, number>; backtest: { securities: number; trials: number }; queue: { fetch_jobs_open: number };
  integrity: { ran_at: string; counts: Record<string, number> } | null; findings: Finding[];
}

const CHECK_LABEL: Record<string, string> = {
  malformed_bar: "Malformed bar", split_suspect: "Split-like jump (possibly unadjusted)", abnormal_move: "Move over 40%",
  adjustment_mismatch: "Open and close on different bases", stale_price: "Stale price", duplicate_security: "Same name and exchange",
  ticker_change: "Ticker change", corporate_action: "Corporate action",
};
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(0)} MB`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "—");

/** Internal operations view: jobs, coverage, storage and data-integrity findings. Admins only. */
export default async function SystemPage() {
  const sb = await authClient();
  const { data, error } = await sb.rpc("system_status");
  if (error || !data) notFound();
  const s = data as Status;
  const groups = Object.entries(s.integrity?.counts ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="System" description="Internal: scheduled jobs, coverage, storage and data-integrity checks. Not linked from the product." />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line md:grid-cols-5">
        <Stat k="Database" v={mb(s.db_bytes)} note="of the plan's 500 MB" />
        <Stat k="Daily coverage" v={fmtInt(s.coverage.securities)} note={`latest ${s.coverage.latest?.slice(0, 10) ?? "—"}, ${fmtInt(s.coverage.behind)} behind`} />
        <Stat k="Analysis rows" v={Object.entries(s.analysis ?? {}).map(([k, v]) => `${k} ${fmtInt(v)}`).join(" · ")} note="per timeframe" />
        <Stat k="Backtest" v={`${fmtInt(s.backtest.securities)} securities`} note={`${fmtInt(s.backtest.trials)} trials`} />
        <Stat k="Fetch queue" v={fmtInt(s.queue.fetch_jobs_open)} note="open history jobs" />
      </section>

      <section className="card">
        <div className="card-h"><h2 className="card-t">Scheduled jobs</h2></div>
        <div className="overflow-x-auto">
          <table className="t dense text-[13px]">
            <thead><tr><th>Job</th><th>Schedule</th><th>State</th><th>Last run</th><th>Result</th></tr></thead>
            <tbody>
              {s.jobs.map((j) => (
                <tr key={j.name}>
                  <td className="font-mono text-[12.5px]">{j.name}</td>
                  <td className="font-mono text-[12.5px] text-fg-2">{j.schedule}</td>
                  <td>{j.active ? <span className="text-pos">Active</span> : <span style={{ color: "var(--warn)" }}>Paused</span>}</td>
                  <td className="text-fg-2">{when(j.last?.start)}</td>
                  <td className="max-w-[420px] truncate text-fg-3" title={j.last?.message ?? ""}>{j.last ? `${j.last.status}${j.last.message ? `: ${j.last.message}` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h2 className="card-t">Data integrity</h2>
          <span className="card-s">Last run {when(s.integrity?.ran_at)} · recent 65 days of daily bars, coverage and master data</span>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3 text-[12.5px]">
          {groups.length ? groups.map(([k, n]) => <span key={k} className="chip">{CHECK_LABEL[k] ?? k}: <b className="num ml-1">{fmtInt(n)}</b></span>) : <span className="text-fg-3">No findings.</span>}
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="t dense text-[13px]">
            <thead><tr><th>Check</th><th>Severity</th><th>Symbol</th><th>Date</th><th>Detail</th></tr></thead>
            <tbody>
              {s.findings.map((f, i) => (
                <tr key={i}>
                  <td>{CHECK_LABEL[f.check_name] ?? f.check_name}</td>
                  <td className={f.severity === "high" ? "text-neg" : f.severity === "medium" ? "" : "text-fg-3"} style={f.severity === "medium" ? { color: "var(--warn)" } : undefined}>{f.severity}</td>
                  <td>{f.symbol && !f.symbol.includes(",") ? <Link href={stockHref(f.symbol)} className="tk hover:text-brand">{f.symbol}</Link> : <span className="text-fg-2">{f.symbol}</span>}</td>
                  <td className="num text-fg-2">{f.ts?.slice(0, 10) ?? "—"}</td>
                  <td className="max-w-[520px] truncate font-mono text-[12px] text-fg-3">{JSON.stringify(f.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2 className="card-t">Largest tables</h2></div>
        <ul className="grid gap-x-8 gap-y-1 px-5 py-3 text-[13px] sm:grid-cols-2">
          {s.tables.map((t) => <li key={t.name} className="flex justify-between gap-4"><span className="font-mono text-[12.5px]">{t.name}</span><span className="num text-fg-2">{mb(t.bytes)}</span></li>)}
        </ul>
      </section>
    </>
  );
}

function Stat({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="bg-panel px-5 py-3">
      <div className="text-[12px] text-fg-3">{k}</div>
      <div className="num text-[16px] font-[650]">{v}</div>
      <div className="text-[12px] text-fg-3">{note}</div>
    </div>
  );
}
