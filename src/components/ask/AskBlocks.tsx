"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { EVIDENCE_LABEL, type Action, type Answer, type Block, type Citation, type Evidence } from "@/lib/ask/types";

type OnCite = (id: number) => void;

const TONE = (t?: "pos" | "neg" | "warn") => (t === "pos" ? "text-pos" : t === "neg" ? "text-neg" : "");
const ROLE_LABEL = { fact: "Fact", analysis: "Viridia analysis", interpretation: "Interpretation", note: "" } as const;

export function Cite({ ids, onCite }: { ids?: (number | undefined)[]; onCite?: OnCite }) {
  const list = (ids ?? []).filter((x): x is number => x != null);
  if (!list.length) return null;
  return (
    <span className="ml-1 inline-flex gap-0.5 align-super">
      {[...new Set(list)].map((id) => (
        <button key={id} onClick={() => onCite?.(id)} className="rounded-[3px] bg-[var(--accent-bg)] px-1 font-mono text-[9.5px] leading-[14px] text-brand hover:bg-brand hover:text-white" aria-label={`Source ${id}`}>{id}</button>
      ))}
    </span>
  );
}

const EV_COLOR: Record<Evidence, string> = { strong: "var(--pos)", moderate: "var(--brand)", limited: "var(--warn)", conflicting: "var(--warn)", insufficient: "var(--neg)" };

export function EvidenceBadge({ ev }: { ev: Answer["evidence"] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-2 hover:border-line-2">
        <i className="h-1.5 w-1.5 rounded-full" style={{ background: EV_COLOR[ev.state] }} />{EVIDENCE_LABEL[ev.state]}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1.5 w-[300px] rounded-[10px] border border-line bg-panel p-3 text-[12.5px] leading-snug text-fg-2" style={{ boxShadow: "var(--shadow-md)" }}>
          <ul className="flex flex-col gap-1">{ev.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="f-diamond mt-[6px] h-[6px] w-[6px]" />{r}</li>)}</ul>
        </span>
      )}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="f-label mb-2 text-fg-3">{children}</p>;
}

export function BlockView({ b, onCite, onAsk }: { b: Block; onCite?: OnCite; onAsk?: (q: string) => void }) {
  switch (b.type) {
    case "text":
      return (
        <div className={b.role === "interpretation" ? "rounded-[10px] border border-dashed border-line-2 px-4 py-3" : ""}>
          {ROLE_LABEL[b.role] && <Label>{ROLE_LABEL[b.role]}</Label>}
          <p className={`text-[14.5px] leading-relaxed ${b.role === "note" ? "text-fg-2" : "text-fg"}`}>{b.text}<Cite ids={b.cite} onCite={onCite} /></p>
          {b.role === "interpretation" && <p className="mt-1.5 text-[11.5px] text-fg-3">Written by a language model from the evidence above and checked so it adds no figures of its own. Possible interpretation, not a recommendation.</p>}
        </div>
      );
    case "definition":
      return (
        <div>
          <Label>Definition</Label>
          <h3 className="text-[20px] font-[500] tracking-[-0.01em]">{b.term}</h3>
          <p className="mt-2 text-[15px] font-[400] leading-relaxed text-fg-2">{b.text}</p>
          {b.formula && <p className="mt-3 rounded-[8px] bg-hover px-3 py-2 font-mono text-[12.5px] text-fg">{b.formula}</p>}
          {b.related?.length ? <p className="mt-2 text-[12.5px] text-fg-3">Related: {b.related.map((r, i) => <button key={r} className="text-brand hover:underline" onClick={() => onAsk?.(`Explain ${r.replace(/ \(.*\)$/, "")}`)}>{i ? `, ${r}` : r}</button>)}</p> : null}
        </div>
      );
    case "calculation":
      return (
        <details className="rounded-[10px] border border-line px-4 py-2.5">
          <summary className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-2">Show calculation · {b.title}</summary>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 text-[13px]">
            {b.inputs.map((i) => <div key={i.label + i.value} className="contents"><dt className="text-fg-3">{i.label}</dt><dd className="num text-right">{i.value}</dd></div>)}
          </dl>
          <p className="mt-2 font-mono text-[12.5px] text-fg-2">{b.formula} = <b className="text-fg">{b.result}</b></p>
          <p className="mt-1 text-[11.5px] text-fg-3">Illustrative inputs.</p>
        </details>
      );
    case "security":
      return (
        <div className="rounded-[12px] border border-line">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
            <Link href={`/terminal/${b.symbol}`} className="text-[20px] font-[600] hover:text-brand">{b.symbol}</Link>
            <span className="truncate text-[13px] text-fg-3">{b.name}</span>
            <span className="ml-auto flex items-baseline gap-2">
              <span className="num text-[20px] font-[500]">{b.price}</span>
              <span className={`num text-[13px] font-[600] ${TONE(b.tone)}`}>{b.change}</span>
              <Cite ids={[b.cite]} onCite={onCite} />
            </span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4">
            {b.metrics.map((m) => (
              <div key={m.label} className="border-b border-r border-line px-4 py-2 [&:nth-last-child(-n+4)]:border-b-0">
                <dt className="text-[11px] text-fg-3">{m.label}</dt>
                <dd className={`num text-[14px] font-[500] ${TONE(m.tone)}`}>{m.value}</dd>
              </div>
            ))}
          </dl>
          {b.asOf && <p className="px-4 py-1.5 text-[11px] text-fg-3">End of day, {b.asOf}</p>}
        </div>
      );
    case "structure":
      return (
        <div className="rounded-[12px] border border-line">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5"><span className="card-t">{b.symbol} · Viridia Intelligence</span><Cite ids={[b.cite]} onCite={onCite} /></div>
          <dl className="divide-y divide-line">
            {b.rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 px-4 py-2 text-[13.5px]">
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-3">{r.label}</dt>
                <dd><span className="font-[500]">{r.value}</span>{r.note && <span className="text-fg-3"> · {r.note}</span>}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
            {([["What this means", b.means], ["What would strengthen it", b.strengthen], ["What would weaken it", b.weaken], ["What to monitor", b.monitor]] as const).filter(([, l]) => l.length).map(([t, l]) => (
              <div key={t} className="bg-panel px-4 py-3">
                <Label>{t}</Label>
                <ul className="flex flex-col gap-1.5 text-[13.5px] leading-snug text-fg-2">{l.map((x) => <li key={x} className="flex gap-2"><span className="f-diamond mt-[6px] h-[6px] w-[6px]" /><span>{x}</span></li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      );
    case "fibzones":
      return (
        <div>
          <Label>Fibonacci confluence · {b.symbol}<Cite ids={[b.cite]} onCite={onCite} /></Label>
          <ul className="flex flex-col">
            {b.zones.map((z, i) => (
              <li key={i} className="f-row py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="num text-[16px] font-[500] text-fib">${z.low.toFixed(2)} – ${z.high.toFixed(2)}</span>
                  <span className="num text-[12.5px] text-fg-3">{z.dist >= 0 ? "+" : "−"}{Math.abs(z.dist * 100).toFixed(1)}% from close</span>
                  {z.count > 0 && <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3">{z.count} relationships · strength {z.strength.toFixed(1)}</span>}
                </div>
                <ul className="mt-1 text-[12.5px] text-fg-2">{z.levels.map((l) => <li key={l}>{l}</li>)}</ul>
              </li>
            ))}
          </ul>
        </div>
      );
    case "comparison":
      return (
        <div>
          <div className="overflow-x-auto rounded-[12px] border border-line">
            <table className="t dense text-[13px]">
              <thead><tr><th /> {b.symbols.map((s) => <th key={s} className="r"><Link href={`/terminal/${s}`} className="hover:text-brand">{s}</Link></th>)}</tr></thead>
              {b.sections.map((sec) => (
                <tbody key={sec.title}>
                  <tr><td colSpan={b.symbols.length + 1} className="bg-hover/50 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-3">{sec.title}</td></tr>
                  {sec.rows.map((r) => <tr key={r.label}><td className="text-fg-3">{r.label}</td>{r.values.map((v, i) => <td key={i} className="r num">{v}</td>)}</tr>)}
                </tbody>
              ))}
            </table>
          </div>
          <div className="mt-3"><Label>Key differences<Cite ids={b.cite} onCite={onCite} /></Label>
            <ul className="flex flex-col gap-1.5 text-[13.5px] text-fg-2">{b.differences.map((d) => <li key={d} className="flex gap-2"><span className="f-diamond mt-[6px] h-[6px] w-[6px]" /><span>{d}</span></li>)}</ul>
          </div>
        </div>
      );
    case "screen":
      return (
        <div>
          <Label>I interpreted your request as</Label>
          {b.interpreted.length ? (
            <dl className="mb-2 flex flex-wrap gap-2">{b.interpreted.map((i) => <div key={i.label + i.value} className="rounded-full border border-line px-3 py-1 text-[12.5px]"><dt className="inline text-fg-3">{i.label}: </dt><dd className="inline font-[500]">{i.value}</dd></div>)}</dl>
          ) : <p className="mb-2 text-[13px] text-fg-3">No supported filters found.</p>}
          {b.ignored.length > 0 && <ul className="mb-3 flex flex-col gap-1 text-[12.5px]" style={{ color: "var(--warn)" }}>{b.ignored.map((x) => <li key={x}>Not applied: {x}.</li>)}</ul>}
          {b.total != null && (
            <>
              <p className="mb-2 text-[14.5px]"><b className="num">{b.total.toLocaleString("en-US")}</b> securities match.<Cite ids={[b.cite]} onCite={onCite} /></p>
              {b.rows.length > 0 && (
                <div className="overflow-x-auto rounded-[12px] border border-line">
                  <table className="t dense text-[13px]">
                    <thead><tr><th>Ticker</th><th className="r">Price</th><th className="r">Day</th><th>Preferred count</th><th className="r">Conf.</th><th className="r">Fib zone</th></tr></thead>
                    <tbody>{b.rows.map((r) => (
                      <tr key={r.symbol}><td><Link href={`/terminal/${r.symbol}`} className="tk hover:text-brand">{r.symbol}</Link><div className="max-w-[180px] truncate text-[11.5px] text-fg-3">{r.name}</div></td>
                        <td className="r num">{r.price}</td><td className={`r num ${r.change.startsWith("−") ? "text-neg" : "text-pos"}`}>{r.change}</td><td className="whitespace-nowrap">{r.count}</td><td className="r num">{r.score}</td><td className="r num">{r.zone}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      );
    case "portfolio":
      return (
        <div className="rounded-[12px] border border-line">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5"><Link href={b.href} className="card-t hover:text-brand">{b.name}</Link><Cite ids={[b.cite]} onCite={onCite} /></div>
          <dl className="grid grid-cols-3 sm:grid-cols-6">{b.metrics.map((m) => <div key={m.label} className="border-r border-line px-3 py-2 last:border-r-0"><dt className="text-[11px] text-fg-3">{m.label}</dt><dd className={`num text-[14px] font-[500] ${TONE(m.tone)}`}>{m.value}</dd></div>)}</dl>
          {b.holdings.length > 0 && <ul className="border-t border-line text-[13px]">{b.holdings.map((h) => <li key={h.symbol} className="flex gap-3 border-b border-line px-4 py-1.5 last:border-b-0"><span className="tk w-16">{h.symbol === "USD" ? "Cash" : h.symbol}</span><span className="num w-14 text-right">{h.weight}</span><span className="text-fg-3">{h.note}</span></li>)}</ul>}
        </div>
      );
    case "market":
      return (
        <div>
          <Label>{b.title}<Cite ids={b.cite} onCite={onCite} /></Label>
          {b.metrics.length > 0 && <dl className="mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3">{b.metrics.map((m) => <div key={m.label} className="bg-panel px-3 py-2"><dt className="text-[11px] text-fg-3">{m.label}</dt><dd className={`num text-[14px] font-[500] ${TONE(m.tone)}`}>{m.value}</dd></div>)}</dl>}
          <ul className="flex flex-col gap-1.5 text-[13.5px] text-fg-2">{b.lines.map((l) => <li key={l} className="flex gap-2"><span className="f-diamond mt-[6px] h-[6px] w-[6px]" /><span>{l}</span></li>)}</ul>
        </div>
      );
    case "events":
      return (
        <div>
          <Label>{b.title}<Cite ids={[b.cite]} onCite={onCite} /></Label>
          <ol className="flex flex-col">{b.items.map((e, i) => (
            <li key={i} className="f-row grid grid-cols-[76px_56px_minmax(0,1fr)] gap-2 py-1.5 text-[13px]">
              <span className="num text-fg-3">{e.day}</span>
              {e.symbol ? <Link href={`/terminal/${e.symbol}`} className="tk hover:text-brand">{e.symbol}</Link> : <span />}
              <span className={e.tone === "pos" ? "text-pos" : e.tone === "neg" ? "text-neg" : "text-fg-2"}>{e.text}</span>
            </li>
          ))}</ol>
        </div>
      );
    case "unavailable":
      return (
        <div className="flex gap-3 rounded-[10px] px-4 py-3" style={{ background: "var(--warn-bg)" }}>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--warn)" }}>Not available</span>
          <p className="text-[13px] leading-snug text-fg-2"><b className="font-[600] text-fg">{b.what[0].toUpperCase() + b.what.slice(1)}.</b> {b.why}</p>
        </div>
      );
    case "actions":
      return null;
  }
}

export function Actions({ items, onAsk, onWatch }: { items: Action[]; onAsk: (q: string) => void; onWatch: (symbols: string[]) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a, i) => a.kind === "link"
        ? <Link key={i} href={a.href} className="btn sm">{a.label}</Link>
        : a.kind === "ask" ? <button key={i} className="btn sm" onClick={() => onAsk(a.q)}>{a.label}</button>
          : <button key={i} className="btn sm" onClick={() => onWatch(a.symbols)}><Icon name="watchlist" className="h-[13px] w-[13px]" />{a.label}</button>)}
    </div>
  );
}

export function CitationList({ citations, active, onCite }: { citations: Citation[]; active?: number | null; onCite?: OnCite }) {
  return (
    <ol className="flex flex-col gap-2">
      {citations.map((c) => (
        <li key={c.id} id={`cite-${c.id}`} className={`rounded-[10px] border px-3 py-2 text-[12.5px] transition-colors ${active === c.id ? "border-brand bg-[var(--accent-bg)]" : "border-line"}`}>
          <button className="flex w-full items-baseline gap-2 text-left" onClick={() => onCite?.(c.id)}>
            <span className="rounded-[3px] bg-[var(--accent-bg)] px-1 font-mono text-[9.5px] text-brand">{c.id}</span>
            <span className="font-[600] text-fg">{c.title}</span>
          </button>
          <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-3">{({ market_data: "Market data provider", viridia_engine: "Viridia structure engine", viridia_scanner: "Viridia scanner", viridia_events: "Viridia change detection", viridia_portfolio: "Viridia portfolio calculation", viridia_regime: "Viridia market regime", glossary: "Viridia reference", user_data: "Your data" })[c.kind]}{c.asOf ? ` · ${c.asOf}` : ""}</p>
          {c.detail && <p className="mt-1 leading-snug text-fg-2">{c.detail}</p>}
          {c.href && <Link href={c.href} className="mt-1 inline-block text-brand hover:underline">Open source →</Link>}
        </li>
      ))}
    </ol>
  );
}
