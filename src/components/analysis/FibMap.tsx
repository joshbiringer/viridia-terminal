"use client";

import { useState } from "react";
import { fmtPrice } from "@/lib/market-data/bars";
import { DEGREE_LABEL } from "@/lib/analysis/pivots";
import { FIB_METHOD, type ClientFib, type ConfluenceZone } from "@/lib/analysis/candidates";

const KIND: Record<ConfluenceZone["levels"][number]["kind"], string> = {
  retracement: "Retracement", projection: "Projection", channel: "Channel", prior_fourth: "Prior 4th", swing: "Swing",
};

const H = 420; // ladder height in px

/**
 * Fibonacci map: every confluence zone on one vertical price scale around the latest close, with its
 * distance, number of relationships, degrees and strength. Selecting a zone lists each relationship
 * that forms it. `onSelect` lets a parent (e.g. the price chart, later) highlight the same zone.
 */
export function FibMap({ fib, onSelect }: { fib: ClientFib | null; onSelect?: (z: ConfluenceZone | null) => void }) {
  const zones = [...(fib?.zones ?? [])].sort((a, b) => b.mid - a.mid);
  const nearest = zones.length ? zones.reduce((a, z) => (Math.abs(z.distancePct) < Math.abs(a.distancePct) ? z : a), zones[0]) : null;
  const [sel, setSel] = useState<ConfluenceZone | null>(nearest);
  const pick = (z: ConfluenceZone) => { const next = sel === z ? null : z; setSel(next); onSelect?.(next); };

  if (!fib) return <Shell><p className="px-5 py-6 text-[13.5px] text-fg-3">Appears once daily bars are stored.</p></Shell>;
  if (!zones.length) return <Shell close={fib.close}><p className="px-5 py-6 text-[13.5px] text-fg-2">No price band within 35% of the close has two or more independent Fibonacci relationships.</p></Shell>;

  const prices = [fib.close, ...zones.flatMap((z) => [z.low, z.high])];
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = (hi - lo) * 0.06 || fib.close * 0.02;
  const top = hi + pad, bottom = lo - pad;
  const y = (p: number) => ((top - p) / (top - bottom)) * H;
  const maxStrength = Math.max(1, ...zones.map((z) => z.strength));
  // rows sit at their price, nudged apart when zones are closer than a row's height (order is kept)
  const centers: number[] = [];
  zones.forEach((z, i) => centers.push(Math.max(y(z.mid), i ? centers[i - 1] + 24 : 11)));
  const height = Math.max(H, (centers.at(-1) ?? 0) + 14);

  return (
    <Shell close={fib.close}>
      <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bg-panel px-4 py-4">
          <div className="relative" style={{ height }} role="list" aria-label="Confluence zones by price">
            {/* price axis */}
            <div className="absolute inset-y-0 left-[64px] w-px bg-line-2" aria-hidden />
            {zones.map((z, i) => {
              const h = Math.min(20, Math.max(6, y(z.low) - y(z.high)));
              const on = sel === z;
              return (
                <button
                  key={`${z.low}-${z.high}`} role="listitem" onClick={() => pick(z)} aria-pressed={on}
                  className="absolute left-0 right-0 flex items-center gap-2 text-left"
                  style={{ top: centers[i] - 11, height: 22 }}
                  title={`${fmtPrice(z.low)}–${fmtPrice(z.high)} · ${z.count} relationships · strength ${z.strength}`}
                >
                  <span className="num w-[58px] shrink-0 text-right text-[11.5px] text-fg-3">{fmtPrice(z.mid)}</span>
                  <span className="relative flex-1 self-stretch">
                    <span
                      className="absolute left-[6px] rounded-[3px] transition-colors"
                      style={{
                        top: 11 - h / 2, height: h, width: `${Math.max(12, (z.strength / maxStrength) * 70)}%`,
                        background: on ? "var(--fib)" : "color-mix(in oklab, var(--fib) 38%, transparent)",
                        outline: on ? "2px solid color-mix(in oklab, var(--fib) 40%, transparent)" : undefined,
                      }}
                      aria-hidden
                    />
                  </span>
                  <span className={`num w-[54px] shrink-0 text-right text-[11.5px] ${z.side === "above" ? "text-pos" : "text-neg"}`}>
                    {z.distancePct >= 0 ? "+" : "−"}{Math.abs(z.distancePct * 100).toFixed(1)}%
                  </span>
                  <span className="num w-7 shrink-0 text-right text-[11.5px] text-fg-2" title="Relationships">×{z.count}</span>
                </button>
              );
            })}
            {/* current price */}
            <div className="pointer-events-none absolute left-0 right-0 flex items-center gap-2" style={{ top: y(fib.close) - 9 }} aria-label={`Close ${fmtPrice(fib.close)}`}>
              <span className="num w-[58px] shrink-0 rounded-[3px] bg-fg px-1 text-right text-[11.5px] font-[650] text-panel">{fmtPrice(fib.close)}</span>
              <span className="h-px flex-1 border-t border-dashed border-fg" />
              <span className="text-[11px] font-medium text-fg">close</span>
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-fg-3">Bar length is the zone&apos;s strength (a weighted count of relationships, not a probability). Select a zone to see what forms it.</p>
        </div>

        <div className="bg-panel px-5 py-4">
          {sel ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="num text-[16px] font-[650]">{fmtPrice(sel.low)}{sel.high - sel.low > 1e-9 ? ` – ${fmtPrice(sel.high)}` : ""}</span>
                <span className={`num text-[13px] ${sel.side === "above" ? "text-pos" : "text-neg"}`}>{sel.distancePct >= 0 ? "+" : "−"}{Math.abs(sel.distancePct * 100).toFixed(1)}% from the close</span>
              </div>
              <p className="mt-1 text-[12.5px] text-fg-2">
                {sel.count} relationships · strength {sel.strength} · {sel.degrees.map((d) => DEGREE_LABEL[d]).join(", ")} degree{sel.degrees.length > 1 ? "s" : ""}
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
                {sel.levels.slice().sort((a, b) => b.price - a.price).map((l, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="num w-[72px] shrink-0 text-right font-medium">{fmtPrice(l.price)}</span>
                    <span className="chip fib shrink-0">{KIND[l.kind]}</span>
                    <span className="text-fg-2">{l.label}<span className="text-fg-3"> · {DEGREE_LABEL[l.degree]} · {l.source}{l.primary ? "" : " · secondary ratio"}</span></span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-[13px] text-fg-3">Select a zone on the map to list the relationships that form it.</p>}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ close, children }: { close?: number; children: React.ReactNode }) {
  return (
    <div className="card" id="fibonacci">
      <div className="card-h">
        <h2 className="card-t">Fibonacci map</h2>
        <span className="card-s">Confluence zones above and below the close</span>
        {close != null && <span className="card-s num ml-auto">Close {fmtPrice(close)}</span>}
      </div>
      {children}
      <div className="src"><span><b>Method</b> {FIB_METHOD}</span></div>
    </div>
  );
}
