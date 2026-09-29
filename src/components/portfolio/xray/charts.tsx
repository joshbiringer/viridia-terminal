"use client";

import { useMemo, useState } from "react";

/**
 * The X-Ray's charts. Plain SVG, sized by viewBox, colored with the app's tokens so light and dark
 * both work. Each answers one question; each has a hover layer and a text equivalent nearby.
 */

export const pctS = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(d)}%`);
export const pctU = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
export const usd = (v: number | null | undefined, signed = false) =>
  v == null || !isFinite(v) ? "—" : `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Tooltip positioned by fractions of the chart box (xf, yf in 0–1), flipping left past the middle. */
function Tip({ xf, yf, px, children }: { xf: number; yf: number; px?: { x: number; y: number }; children: React.ReactNode }) {
  const style: React.CSSProperties = px
    ? { left: px.x + 12, top: px.y }
    : { top: `calc(${(yf * 100).toFixed(2)}% + 4px)`, ...(xf > 0.55 ? { right: `calc(${((1 - xf) * 100).toFixed(2)}% + 12px)` } : { left: `calc(${(xf * 100).toFixed(2)}% + 12px)` }) };
  return (
    <div className="pointer-events-none absolute z-10 min-w-[140px] max-w-[240px] rounded-[var(--r-sm)] border border-line bg-panel px-2.5 py-1.5 text-[12px] leading-snug text-fg-2"
      style={{ ...style, boxShadow: "var(--shadow-md)" }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- performance line chart

export function PerfChart({ dates, series }: { dates: string[]; series: { id: string; label: string; values: number[]; color: string; dash?: boolean }[] }) {
  const W = 760, H = 240, L = 44, R = 96, T = 12, B = 24;
  const [hover, setHover] = useState<number | null>(null);
  const n = dates.length;
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const y0 = lo - pad, y1 = hi + pad;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = useMemo(() => {
    const step = (y1 - y0) / 4;
    return Array.from({ length: 5 }, (_, i) => y0 + i * step);
  }, [y0, y1]);
  const months = useMemo(() => dates.map((d, i) => [d, i] as const).filter(([d], i) => i > 0 && d.slice(5, 7) !== dates[i - 1].slice(5, 7) && ["01", "04", "07", "10"].includes(d.slice(5, 7))), [dates]);
  if (n < 2) return <p className="px-4 py-6 text-[13px] text-fg-3">Not enough shared history to chart.</p>;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.round(Math.min(Math.max((px - L) / (W - L - R), 0), 1) * (n - 1)));
  };
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={`Growth of 100: ${series.map((s) => `${s.label} ${s.values.at(-1)!.toFixed(1)}`).join(", ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" className="num" fontSize={10.5} fill="var(--text-3)">{t.toFixed(0)}</text>
          </g>
        ))}
        {y0 < 100 && y1 > 100 && <line x1={L} x2={W - R} y1={y(100)} y2={y(100)} stroke="var(--border-2)" strokeDasharray="3 3" />}
        {months.map(([d, i]) => <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--text-3)">{new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>)}
        {series.map((s) => (
          <g key={s.id}>
            <polyline fill="none" stroke={s.color} strokeWidth={s.id === "portfolio" ? 2 : 1.5} strokeDasharray={s.dash ? "4 3" : undefined} strokeLinejoin="round"
              points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
            <text x={W - R + 6} y={y(s.values.at(-1)!) + 3.5} fontSize={11} fill="var(--text-2)" className="num">{s.label.split(" (")[0]} {s.values.at(-1)!.toFixed(1)}</text>
          </g>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--text-3)" strokeWidth={1} />
            {series.map((s) => <circle key={s.id} cx={x(hover)} cy={y(s.values[hover])} r={3.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover != null && (
        <Tip xf={x(hover) / W} yf={0.02}>
          <div className="mb-0.5 font-medium text-fg">{dates[hover]}</div>
          {series.map((s) => <div key={s.id} className="flex gap-2"><span>{s.label}</span><span className="num ml-auto text-fg">{s.values[hover].toFixed(1)}</span></div>)}
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- weight vs risk contribution

export function WeightRiskChart({ rows, flagged }: { rows: { symbol: string; weight: number; contribution: number | null }[]; flagged: string[] }) {
  const W = 420, H = 300, L = 40, R = 14, T = 12, B = 34;
  const pts = rows.filter((r) => r.contribution != null);
  const max = Math.max(0.05, ...pts.map((r) => Math.max(r.weight, r.contribution!))) * 1.1;
  const x = (v: number) => L + (v / max) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const [hover, setHover] = useState<string | null>(null);
  const ticks = [0, max / 4, max / 2, (3 * max) / 4];
  const h = pts.find((p) => p.symbol === hover);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Portfolio weight against share of modeled risk for each holding">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={L - 5} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)" className="num">{(t * 100).toFixed(0)}%</text>
            <text x={x(t)} y={H - B + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)" className="num">{(t * 100).toFixed(0)}%</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke="var(--border-2)" strokeDasharray="4 3" />
        <text x={x(max * 0.72)} y={y(max * 0.72) - 6} fontSize={10} fill="var(--text-3)" transform={`rotate(${-Math.atan((H - T - B) / (W - L - R)) * 57.3} ${x(max * 0.72)} ${y(max * 0.72) - 6})`}>risk = weight</text>
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">Portfolio weight</text>
        <text x={11} y={(T + H - B) / 2} textAnchor="middle" fontSize={10.5} fill="var(--text-2)" transform={`rotate(-90 11 ${(T + H - B) / 2})`}>Share of risk</text>
        {pts.map((p) => {
          const f = flagged.includes(p.symbol);
          return (
            <g key={p.symbol} onPointerEnter={() => setHover(p.symbol)} onPointerLeave={() => setHover(null)}>
              <circle cx={x(p.weight)} cy={y(p.contribution!)} r={12} fill="transparent" />
              <circle cx={x(p.weight)} cy={y(p.contribution!)} r={f ? 5 : 4} fill={f ? "var(--warn)" : "var(--brand)"} stroke="var(--panel)" strokeWidth={2} />
              {(f || p.contribution! >= 0.08) && <text x={x(p.weight) + 7} y={y(p.contribution!) + 3.5} fontSize={10.5} fill="var(--text)" fontWeight={600}>{p.symbol}</text>}
            </g>
          );
        })}
      </svg>
      {h && (
        <Tip xf={x(h.weight) / W} yf={y(h.contribution!) / H}>
          <div className="font-medium text-fg">{h.symbol}</div>
          <div>Weight <span className="num text-fg">{pctU(h.weight)}</span></div>
          <div>Share of risk <span className="num text-fg">{pctU(h.contribution)}</span></div>
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- horizontal bars (sectors, allocation, stress)

export function HBars({ rows, max, signed = false, format = (v: number) => pctU(v) }: {
  rows: { label: string; value: number; note?: string; muted?: boolean; tone?: "pos" | "neg" | "warn" }[]; max?: number; signed?: boolean; format?: (v: number) => string;
}) {
  const m = max ?? Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="flex flex-col">
      {rows.map((r) => {
        const width = `${(Math.min(1, Math.abs(r.value) / m) * (signed ? 50 : 100)).toFixed(2)}%`;
        const color = r.tone ? `var(--${r.tone === "pos" ? "pos-chart" : r.tone})` : r.muted ? "var(--border-2)" : "var(--brand)";
        return (
          <li key={r.label} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_64px] items-center gap-3 py-[5px]" title={r.note}>
            <span className={`truncate text-[12.5px] ${r.muted ? "text-fg-3" : "text-fg-2"}`}>{r.label}</span>
            <span className="relative h-2.5">
              {signed && <i className="absolute inset-y-[-3px] left-1/2 w-px bg-line" />}
              <i className="absolute inset-y-0 rounded-[2px]" style={{ width, background: color, ...(signed ? (r.value >= 0 ? { left: "50%" } : { right: "50%" }) : { left: 0 }) }} />
            </span>
            <span className="num text-right text-[12.5px] font-[560]">{format(r.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- one stacked bar

export function StackBar({ parts, height = 10 }: { parts: { label: string; value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="flex gap-[2px] overflow-hidden rounded-[3px]" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${pctU(p.value / total)}`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => <i key={p.label} title={`${p.label} ${pctU(p.value / total)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: p.color }} />{p.label} <span className="num font-[600] text-fg">{pctU(p.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- correlation heatmap

const cellColor = (c: number | null) =>
  c == null ? "var(--hover)" : c >= 0 ? `color-mix(in oklab, var(--brand) ${Math.round(Math.min(1, c) * 88)}%, var(--panel))` : `color-mix(in oklab, var(--neg) ${Math.round(Math.min(1, -c) * 88)}%, var(--panel))`;

export function Heatmap({ symbols, matrix, focus, onFocus }: { symbols: string[]; matrix: (number | null)[][]; focus: string | null; onFocus: (s: string | null) => void }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const n = symbols.length;
  const cell = n > 20 ? 18 : n > 12 ? 24 : 30;
  const lab = 52;
  const size = lab + n * cell;
  const fi = focus ? symbols.indexOf(focus) : -1;
  return (
    <div className="relative overflow-x-auto">
      <svg width={size + 4} height={size + 4} role="img" aria-label="Pairwise correlation of daily returns between holdings" onPointerLeave={() => setHover(null)}>
        {symbols.map((s, i) => (
          <g key={s}>
            <text x={lab - 5} y={lab + i * cell + cell / 2 + 3.5} textAnchor="end" fontSize={10.5} fontWeight={fi === i ? 700 : 500} fill={fi === i ? "var(--text)" : "var(--text-2)"} className="cursor-pointer" onClick={() => onFocus(focus === s ? null : s)}>{s}</text>
            <text transform={`translate(${lab + i * cell + cell / 2 + 3.5} ${lab - 5}) rotate(-90)`} fontSize={10.5} fontWeight={fi === i ? 700 : 500} fill={fi === i ? "var(--text)" : "var(--text-2)"} className="cursor-pointer" onClick={() => onFocus(focus === s ? null : s)}>{s}</text>
          </g>
        ))}
        {matrix.map((row, i) => row.map((c, j) => (
          <rect key={`${i}-${j}`} x={lab + j * cell + 1} y={lab + i * cell + 1} width={cell - 2} height={cell - 2} rx={2} fill={cellColor(c)}
            opacity={fi >= 0 && fi !== i && fi !== j ? 0.25 : 1} onPointerEnter={() => setHover([i, j])} />
        )))}
      </svg>
      {hover && (
        <Tip xf={0} yf={0} px={{ x: lab + hover[1] * cell, y: lab + hover[0] * cell + cell }}>
          <div className="font-medium text-fg">{symbols[hover[0]]} / {symbols[hover[1]]}</div>
          <div>Correlation <span className="num text-fg">{matrix[hover[0]][hover[1]]?.toFixed(2) ?? "—"}</span></div>
        </Tip>
      )}
      <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-3">
        <span>−1</span>
        <span className="h-2 w-40 rounded-[2px]" style={{ background: `linear-gradient(90deg, ${cellColor(-1)}, ${cellColor(0)}, ${cellColor(1)})` }} />
        <span>+1</span>
        <span className="ml-2">Click a ticker to highlight its row and column.</span>
      </div>
    </div>
  );
}
