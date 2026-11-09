/**
 * Brain screens: the reader's fundamental screens (Graham value, Buffett quality, O'Neil growth and
 * any others they share), stored as criteria and evaluated against SEC fundamentals. A missing
 * figure never counts as a pass; the result says which criteria couldn't be checked.
 */

/** As-filed figures for one company, from SEC XBRL (all optional: a company may not report a concept). */
export interface CompanyFigures {
  symbol: string; name?: string | null; sector?: string | null;
  market_cap?: number | null; revenue?: number | null; net_income?: number | null;
  equity?: number | null; debt?: number | null; cash?: number | null;
  assets_current?: number | null; liabilities_current?: number | null;
  operating_cash_flow?: number | null; capex?: number | null;
  eps?: number | null; eps_prior?: number | null; eps_5y_ago?: number | null;
  eps_q?: number | null; eps_q_year_ago?: number | null;
  revenue_q?: number | null; revenue_q_year_ago?: number | null;
}

export type MetricId =
  | "pe" | "pb" | "ps" | "p_fcf" | "fcf_yield" | "current_ratio" | "debt_equity" | "roe" | "net_margin"
  | "eps_growth_5y" | "eps_growth_this_year" | "eps_growth_qoq" | "sales_growth_qoq";

export const METRICS: Record<MetricId, { label: string; unit: "x" | "%"; compute: (f: CompanyFigures) => number | null }> = {
  pe: { label: "P/E", unit: "x", compute: (f) => (pos(f.market_cap) && pos(f.net_income) ? f.market_cap! / f.net_income! : null) },
  pb: { label: "P/B", unit: "x", compute: (f) => (pos(f.market_cap) && pos(f.equity) ? f.market_cap! / f.equity! : null) },
  ps: { label: "P/S", unit: "x", compute: (f) => (pos(f.market_cap) && pos(f.revenue) ? f.market_cap! / f.revenue! : null) },
  p_fcf: { label: "Price/Free Cash Flow", unit: "x", compute: (f) => { const c = fcf(f); return pos(f.market_cap) && c != null && c > 0 ? f.market_cap! / c : null; } },
  fcf_yield: { label: "FCF yield", unit: "%", compute: (f) => { const c = fcf(f); return pos(f.market_cap) && c != null ? c / f.market_cap! : null; } },
  current_ratio: { label: "Current ratio", unit: "x", compute: (f) => (f.assets_current != null && pos(f.liabilities_current) ? f.assets_current / f.liabilities_current! : null) },
  debt_equity: { label: "Debt/Equity", unit: "x", compute: (f) => (f.debt != null && pos(f.equity) ? f.debt / f.equity! : null) },
  roe: { label: "Return on equity", unit: "%", compute: (f) => (f.net_income != null && pos(f.equity) ? f.net_income / f.equity! : null) },
  net_margin: { label: "Net margin", unit: "%", compute: (f) => (f.net_income != null && pos(f.revenue) ? f.net_income / f.revenue! : null) },
  eps_growth_5y: { label: "EPS growth, past 5 years (a year)", unit: "%", compute: (f) => (pos(f.eps) && pos(f.eps_5y_ago) ? Math.pow(f.eps! / f.eps_5y_ago!, 1 / 5) - 1 : null) },
  eps_growth_this_year: { label: "EPS growth, latest year", unit: "%", compute: (f) => growth(f.eps, f.eps_prior) },
  eps_growth_qoq: { label: "EPS growth, quarter vs a year ago", unit: "%", compute: (f) => growth(f.eps_q, f.eps_q_year_ago) },
  sales_growth_qoq: { label: "Sales growth, quarter vs a year ago", unit: "%", compute: (f) => growth(f.revenue_q, f.revenue_q_year_ago) },
};

const pos = (x: number | null | undefined) => x != null && x > 0;
const fcf = (f: CompanyFigures) => (f.operating_cash_flow != null && f.capex != null ? f.operating_cash_flow - Math.abs(f.capex) : null);
/** Growth needs a positive base: growth from a loss isn't a percentage. */
const growth = (a: number | null | undefined, b: number | null | undefined) => (a != null && pos(b) ? a / b! - 1 : null);

export interface Criterion { metric: MetricId; op: "<" | ">"; value: number }
export interface Screen { id: string; name: string; philosophy: "value" | "quality" | "growth" | "income" | "momentum"; criteria: Criterion[]; notes: string | null; source: string | null; active: boolean }

export interface ScreenResult {
  screen: string; philosophy: Screen["philosophy"]; passed: boolean; met: number; total: number;
  checks: { metric: MetricId; label: string; op: Criterion["op"]; value: number; actual: number | null; ok: boolean | null }[];
}

export const fmtMetric = (id: MetricId, v: number | null) =>
  v == null ? "—" : METRICS[id].unit === "%" ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(2)}×`;
export const fmtCriterion = (c: Criterion) => `${METRICS[c.metric].label} ${c.op === "<" ? "under" : "over"} ${METRICS[c.metric].unit === "%" ? `${Math.round(c.value * 100)}%` : c.value}`;

export function evaluate(screen: Screen, f: CompanyFigures): ScreenResult {
  const checks = screen.criteria.map((c) => {
    const actual = METRICS[c.metric]?.compute(f) ?? null;
    // P/E, P/B and P/FCF of a loss-maker are undefined: the criterion is unknown (not passed), and the screen fails
    const ok = actual == null ? null : c.op === "<" ? actual < c.value : actual > c.value;
    return { metric: c.metric, label: METRICS[c.metric]?.label ?? c.metric, op: c.op, value: c.value, actual, ok };
  });
  const met = checks.filter((c) => c.ok === true).length;
  return { screen: screen.name, philosophy: screen.philosophy, passed: met === checks.length && checks.length > 0, met, total: checks.length, checks };
}

/** Run screens over a universe; returns, per screen, the companies passing every criterion. */
export function runScreens(screens: Screen[], universe: CompanyFigures[]) {
  return screens.filter((s) => s.active).map((s) => {
    const results = universe.map((f) => ({ f, r: evaluate(s, f) }));
    const passing = results.filter((x) => x.r.passed);
    const checkable = results.filter((x) => x.r.checks.every((c) => c.actual != null)).length;
    return { screen: s, passing, checkable };
  });
}

/** The three screens the reader shared on Nov 9, 2026, as stored criteria. */
export const SHARED_SCREENS: Omit<Screen, "id" | "active">[] = [
  {
    name: "Graham Value", philosophy: "value", source: "Shared screener, Nov 9 2026",
    notes: "Benjamin Graham-style defensive value: cheap on earnings, book and free cash flow, liquid and lightly indebted.",
    criteria: [{ metric: "pe", op: "<", value: 15 }, { metric: "pb", op: "<", value: 2 }, { metric: "p_fcf", op: "<", value: 10 }, { metric: "current_ratio", op: ">", value: 1.5 }, { metric: "debt_equity", op: "<", value: 0.5 }],
  },
  {
    name: "Buffett Quality", philosophy: "quality", source: "Shared screener, Nov 9 2026",
    notes: "Durable, profitable compounders: steady earnings growth, high returns on equity, wide margins, little debt.",
    criteria: [{ metric: "eps_growth_5y", op: ">", value: 0.10 }, { metric: "roe", op: ">", value: 0.15 }, { metric: "debt_equity", op: "<", value: 0.5 }, { metric: "net_margin", op: ">", value: 0.10 }],
  },
  {
    name: "O'Neil Growth", philosophy: "growth", source: "Shared screener, Nov 9 2026",
    notes: "CAN SLIM-style growth: accelerating current earnings and sales with high returns on equity.",
    criteria: [{ metric: "eps_growth_this_year", op: ">", value: 0.25 }, { metric: "eps_growth_qoq", op: ">", value: 0.25 }, { metric: "sales_growth_qoq", op: ">", value: 0.25 }, { metric: "roe", op: ">", value: 0.15 }],
  },
];
