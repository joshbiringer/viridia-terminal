/**
 * X-Ray snapshots: the figures an advisor compares between review meetings, stored per saved
 * portfolio (portfolio_snapshots). A diff lists only what materially changed; thresholds are stated
 * next to each check.
 */
import type { FactorKey, Workspace } from "./workspace";

export interface XRaySnapshot {
  v: 2; at: string; asOf: string | null; total: number;
  positions: { symbol: string; weight: number; value: number; close: number; trend: string | null; pattern: string | null; wave: string | null; dir: string | null; nearInv: boolean; contribution: number | null }[];
  metrics: { vol: number | null; beta: number | null; sharpe: number | null; r1y: number | null; top5: number; enb: number | null; cash: number };
  sectors: { sector: string; weight: number }[];
  factors: Partial<Record<FactorKey, number>>;
  structure: { uptrend: number; downtrend: number; nearInvalidation: number };
}

export function snapshotOfWorkspace(ws: Workspace, at = new Date()): XRaySnapshot {
  const risk = new Map(ws.risk.rows.map((r) => [r.symbol, r.contribution]));
  const near = new Set(ws.structure.nearInvalidation.symbols);
  return {
    v: 2, at: at.toISOString(), asOf: ws.asOf, total: ws.total,
    positions: ws.positions.map((p) => ({
      symbol: p.symbol, weight: p.weight, value: p.value, close: p.close, trend: p.ctx?.trend ?? null, pattern: p.ctx?.glance_pattern ?? null,
      wave: p.ctx?.glance_wave ?? null, dir: p.ctx?.glance_wave_dir ?? null, nearInv: near.has(p.symbol), contribution: risk.get(p.symbol) ?? null,
    })),
    metrics: { vol: ws.metrics.vol, beta: ws.metrics.beta, sharpe: ws.metrics.sharpe, r1y: ws.metrics.r1y, top5: ws.concentration.top5, enb: ws.risk.enb, cash: ws.metrics.cash },
    sectors: ws.sectors.slice(0, 12),
    factors: Object.fromEntries(ws.factors.rows.filter((f) => f.key !== "profitability" && f.loading != null).map((f) => [f.key, f.loading!])),
    structure: { uptrend: ws.structure.trend.uptrend, downtrend: ws.structure.trend.downtrend, nearInvalidation: ws.structure.nearInvalidation.weight },
  };
}

export interface Change { kind: "value" | "holdings" | "weight" | "structure" | "risk" | "sector" | "factor"; text: string; tone?: "pos" | "neg" | "warn" }

const pct = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(d)}%`;
const pts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)} pts`;
const w = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Material changes from snapshot `a` (earlier) to `b` (later). */
export function diffSnapshots(a: XRaySnapshot, b: XRaySnapshot): Change[] {
  const out: Change[] = [];
  if (a.total > 0) out.push({ kind: "value", text: `Value ${pct(b.total / a.total - 1)} (${usd(b.total - a.total)}).`, tone: b.total >= a.total ? "pos" : "neg" });
  const A = new Map(a.positions.map((p) => [p.symbol, p])), B = new Map(b.positions.map((p) => [p.symbol, p]));
  const added = b.positions.filter((p) => !A.has(p.symbol)).map((p) => p.symbol), removed = a.positions.filter((p) => !B.has(p.symbol)).map((p) => p.symbol);
  if (added.length) out.push({ kind: "holdings", text: `Added: ${added.join(", ")}.` });
  if (removed.length) out.push({ kind: "holdings", text: `No longer held: ${removed.join(", ")}.` });
  // weight moves of 2 points or more
  const moves = b.positions.filter((p) => A.has(p.symbol) && Math.abs(p.weight - A.get(p.symbol)!.weight) >= 0.02)
    .sort((x, y) => Math.abs(y.weight - A.get(y.symbol)!.weight) - Math.abs(x.weight - A.get(x.symbol)!.weight));
  if (moves.length) out.push({ kind: "weight", text: `Weight changes of 2+ points: ${moves.slice(0, 6).map((p) => `${p.symbol} ${w(A.get(p.symbol)!.weight)} → ${w(p.weight)}`).join(", ")}.` });
  // structure: trend state, preferred count, near invalidation
  const trend = b.positions.filter((p) => A.has(p.symbol) && (A.get(p.symbol)!.trend ?? null) !== (p.trend ?? null));
  if (trend.length) out.push({ kind: "structure", text: `Trend state changed: ${trend.map((p) => `${p.symbol} ${A.get(p.symbol)!.trend ?? "none"} → ${p.trend ?? "none"}`).join(", ")}.`, tone: "warn" });
  const count = b.positions.filter((p) => { const q = A.get(p.symbol); return q && (q.pattern !== p.pattern || q.wave !== p.wave || q.dir !== p.dir); });
  if (count.length) out.push({ kind: "structure", text: `Preferred count changed: ${count.map((p) => { const q = A.get(p.symbol)!; return `${p.symbol} (${label(q)} → ${label(p)})`; }).join(", ")}.` });
  const newNear = b.positions.filter((p) => p.nearInv && !A.get(p.symbol)?.nearInv).map((p) => p.symbol);
  if (newNear.length) out.push({ kind: "structure", text: `Newly within 3% of invalidation: ${newNear.join(", ")}.`, tone: "warn" });
  if (Math.abs(b.structure.uptrend - a.structure.uptrend) >= 0.05) out.push({ kind: "structure", text: `Weight in uptrends ${w(a.structure.uptrend)} → ${w(b.structure.uptrend)}.` });
  // risk: beta 0.1+, volatility 2 points+, effective exposures 0.5+
  const m = a.metrics, n = b.metrics;
  if (m.beta != null && n.beta != null && Math.abs(n.beta - m.beta) >= 0.1) out.push({ kind: "risk", text: `Beta ${m.beta.toFixed(2)} → ${n.beta.toFixed(2)}.` });
  if (m.vol != null && n.vol != null && Math.abs(n.vol - m.vol) >= 0.02) out.push({ kind: "risk", text: `Volatility ${w(m.vol)} → ${w(n.vol)}.` });
  if (m.enb != null && n.enb != null && Math.abs(n.enb - m.enb) >= 0.5) out.push({ kind: "risk", text: `Independent exposures ${m.enb.toFixed(1)} → ${n.enb.toFixed(1)}.` });
  if (Math.abs(n.top5 - m.top5) >= 0.03) out.push({ kind: "risk", text: `Top five positions ${w(m.top5)} → ${w(n.top5)} of value.` });
  // sectors: 3 points or more
  const S = new Map(a.sectors.map((s) => [s.sector, s.weight]));
  const sec = b.sectors.map((s) => ({ s: s.sector, d: s.weight - (S.get(s.sector) ?? 0) })).filter((x) => Math.abs(x.d) >= 0.03 && x.s !== "Unclassified");
  if (sec.length) out.push({ kind: "sector", text: `Sector exposure: ${sec.map((x) => `${x.s} ${pts(x.d)}`).join(", ")}.` });
  // factors: 0.15 or more
  const f = (Object.keys(b.factors) as FactorKey[]).filter((k) => a.factors[k] != null && Math.abs(b.factors[k]! - a.factors[k]!) >= 0.15);
  if (f.length) out.push({ kind: "factor", text: `Factor loadings: ${f.map((k) => `${k} ${a.factors[k]!.toFixed(2)} → ${b.factors[k]!.toFixed(2)}`).join(", ")}.` });
  return out;
}

const label = (p: { pattern: string | null; wave: string | null; dir: string | null }) => (p.pattern ? `${p.pattern.replace("_", " ")} ${p.wave ?? ""}${p.dir === "up" ? "↑" : p.dir === "down" ? "↓" : ""}`.trim() : "no count");
const usd = (v: number) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
