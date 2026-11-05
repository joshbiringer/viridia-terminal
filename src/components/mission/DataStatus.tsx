import { fmtDateTime, fmtInt } from "@/lib/format";
import { DATA_SOURCE, sessionLabel, type DataStatusRow, type Freshness } from "@/lib/data-freshness";

const DOT = { current: "var(--brand)", behind: "var(--warn)", unknown: "var(--text-3)" } as const;

/**
 * Where Viridia's prices come from and how current they are, as a pill that opens a short panel:
 * source and plan, price type (end of day, never real-time), the session shown, coverage, when the
 * last session loaded and when the next one publishes. No JavaScript: a native disclosure.
 */
export function DataStatus({ f, s }: { f: Freshness; s: DataStatusRow | null }) {
  const rows: [string, React.ReactNode][] = [
    ["Source", `${DATA_SOURCE.name}, ${DATA_SOURCE.plan}`],
    ["Price type", <span key="t">End-of-day closes. <span className="text-fg-3">Not real-time or intraday delayed.</span></span>],
    ["Prices shown", f.session ? `Close of ${sessionLabel(f.session)}` : "Unknown"],
    ["Coverage", s ? `${fmtInt(s.coverage)} ${DATA_SOURCE.coverage}` : DATA_SOURCE.coverage],
    ["Last loaded", s?.ingested_at ? fmtDateTime(s.ingested_at) : "—"],
    ["Next close", `Publishes after ${DATA_SOURCE.publishesAt}; this page refreshes itself`],
  ];
  return (
    <details className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-panel px-3 text-[12.5px] transition-colors hover:border-line-2 [&::-webkit-details-marker]:hidden"
        aria-label={`Data status: ${f.label}. ${f.detail}`}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[f.state] }} aria-hidden />
        <span className="font-medium">End of day</span>
        <span className="text-fg-3">{f.session ? sessionLabel(f.session) : "—"}</span>
        {f.state === "behind" && <span className="font-medium" style={{ color: "var(--warn)" }}>Behind</span>}
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-[340px] max-w-[calc(100vw-32px)] rounded-[var(--r-lg)] border border-line bg-panel p-1 text-[12.5px]" style={{ boxShadow: "var(--shadow-lg)" }}>
        <p className="px-3 pb-2 pt-2.5 leading-snug" style={{ color: f.state === "behind" ? "var(--warn)" : undefined }}>{f.detail}</p>
        <dl className="divide-y divide-line border-t border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 px-3 py-1.5">
              <dt className="text-fg-3">{k}</dt><dd className="text-fg-2">{v}</dd>
            </div>
          ))}
        </dl>
        {s && s.failed_sessions.length > 0 && (
          <p className="border-t border-line px-3 py-2 text-fg-3">Retrying: {s.failed_sessions.map((d) => sessionLabel(d, false)).join(", ")}.</p>
        )}
      </div>
    </details>
  );
}
