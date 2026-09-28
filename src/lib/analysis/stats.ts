/**
 * Price statistics from daily closes, shared by Viridia Signals and Portfolio X-Ray. Pure functions,
 * no data access. Returns are simple daily returns on split-adjusted closes; annualized with 252
 * sessions.
 */
export interface Close { ts: string; close: number }

export const TRADING_DAYS = 252;

/** Daily simple returns keyed by date (YYYY-MM-DD). */
export function dailyReturns(bars: Close[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (a > 0 && b > 0) out.set(bars[i].ts.slice(0, 10), b / a - 1);
  }
  return out;
}

/** Total return over the last `n` sessions, or null without enough history. */
export function periodReturn(bars: Close[], n: number): number | null {
  if (bars.length <= n) return null;
  const a = bars[bars.length - 1 - n].close, b = bars[bars.length - 1].close;
  return a > 0 ? b / a - 1 : null;
}

const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
function stdev(x: number[]): number {
  if (x.length < 2) return NaN;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}

/** Annualized volatility of the last `n` daily returns. */
export function volatility(bars: Close[], n: number): number | null {
  const r = [...dailyReturns(bars).values()].slice(-n);
  if (r.length < Math.min(n, 20)) return null;
  return stdev(r) * Math.sqrt(TRADING_DAYS);
}

/** Largest peak-to-trough fall in the last `n` sessions (a negative number, or 0). */
export function maxDrawdown(bars: Close[], n: number): number | null {
  const x = bars.slice(-n - 1);
  if (x.length < 20) return null;
  let peak = x[0].close, dd = 0;
  for (const b of x) { peak = Math.max(peak, b.close); dd = Math.min(dd, b.close / peak - 1); }
  return dd;
}

/** Aligned pairs of returns on the dates both series traded (last `n` of them). */
function aligned(a: Map<string, number>, b: Map<string, number>, n: number): [number[], number[]] {
  const xs: number[] = [], ys: number[] = [];
  for (const [d, v] of a) { const w = b.get(d); if (w !== undefined) { xs.push(v); ys.push(w); } }
  return [xs.slice(-n), ys.slice(-n)];
}

/** Beta of `a` against benchmark `b` over the last `n` common sessions. */
export function beta(a: Map<string, number>, b: Map<string, number>, n = TRADING_DAYS): number | null {
  const [x, y] = aligned(a, b, n);
  if (x.length < 60) return null;
  const mx = mean(x), my = mean(y);
  let cov = 0, vy = 0;
  for (let i = 0; i < x.length; i++) { cov += (x[i] - mx) * (y[i] - my); vy += (y[i] - my) ** 2; }
  return vy > 0 ? cov / vy : null;
}

/** Pearson correlation of daily returns over the last `n` common sessions. */
export function correlation(a: Map<string, number>, b: Map<string, number>, n = TRADING_DAYS): number | null {
  const [x, y] = aligned(a, b, n);
  if (x.length < 60) return null;
  const mx = mean(x), my = mean(y);
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < x.length; i++) { c += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : null;
}
