/**
 * Fundamentals from SEC filings (client-safe): the per-security record, derived ratios, sector medians
 * and the Signals fundamentals and valuation dimensions. Figures are as filed in XBRL for the fiscal
 * year nearest the calendar year; nothing is estimated.
 */
export interface Fundamentals {
  symbol: string; sector: string | null; industry: string | null; fy_end: string | null;
  revenue: number | null; revenue_prior: number | null; net_income: number | null; operating_income: number | null;
  gross_profit: number | null; shares: number | null; shares_as_of: string | null; market_cap: number | null;
  multi_class: boolean | null; revenue_concept: string | null;
}

export interface SectorMedian { sector: string; n: number; pe: number | null; ps: number | null; op_margin: number | null; growth: number | null }

export interface Ratios {
  growth: number | null; grossMargin: number | null; opMargin: number | null; netMargin: number | null;
  pe: number | null; ps: number | null;
}

const div = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && b !== 0 && isFinite(a / b) ? a / b : null);

export function ratios(f: Fundamentals | null | undefined): Ratios {
  if (!f) return { growth: null, grossMargin: null, opMargin: null, netMargin: null, pe: null, ps: null };
  const growth = f.revenue != null && f.revenue_prior != null && f.revenue_prior > 0 ? f.revenue / f.revenue_prior - 1 : null;
  return {
    growth,
    grossMargin: f.revenue && f.revenue > 0 ? div(f.gross_profit, f.revenue) : null,
    opMargin: f.revenue && f.revenue > 0 ? div(f.operating_income, f.revenue) : null,
    netMargin: f.revenue && f.revenue > 0 ? div(f.net_income, f.revenue) : null,
    pe: f.market_cap != null && f.net_income != null && f.net_income > 0 ? f.market_cap / f.net_income : null,
    ps: f.market_cap != null && f.revenue != null && f.revenue > 0 ? f.market_cap / f.revenue : null,
  };
}

export function fmtBig(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  return `${s}$${Math.round(a).toLocaleString("en-US")}`;
}
const pc = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(d)}%`;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
export const multiple = (x: number | null) => (x == null ? "—" : x >= 100 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`);

export const FUNDAMENTALS_SOURCE = "SEC EDGAR XBRL filings (fiscal year nearest the calendar year) and SEC SIC codes. Market cap is shares outstanding from the latest filing × the last close.";

type Dim = { key: "fundamentals" | "valuation"; label: string; state: string; tone: "pos" | "neg" | "neutral" | "warn" | "na"; detail: string; rule: string };

/** Signals dimensions from a fundamentals record and its sector's medians. */
export function fundamentalDims(f: Fundamentals | null | undefined, sector: SectorMedian | null | undefined): Dim[] {
  const r = ratios(f);
  const fy = f?.fy_end ? new Date(`${f.fy_end}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : null;
  const out: Dim[] = [];
  if (!f || f.revenue == null) {
    out.push({ key: "fundamentals", label: "Fundamentals", state: "Not reported", tone: "na",
      detail: f ? "No revenue figure in this company's XBRL filings for the last two fiscal years." : "Fundamentals cover U.S.-listed operating companies that file with the SEC; funds and many foreign issuers aren't covered.",
      rule: "Revenue growth and margins from SEC filings" });
  } else {
    const losing = f.net_income != null && f.net_income < 0;
    const state = r.growth == null ? (losing ? "Unprofitable" : "Profitable") : r.growth >= 0.05 ? (losing ? "Growing, unprofitable" : "Growing") : r.growth <= -0.05 ? "Shrinking" : losing ? "Flat, unprofitable" : "Steady";
    const tone = state === "Growing" ? "pos" : state === "Shrinking" ? "neg" : losing ? "warn" : "neutral";
    const parts = [`Revenue ${fmtBig(f.revenue)}${r.growth != null ? ` (${pc(r.growth)} year on year)` : ""}`];
    if (r.opMargin != null) parts.push(`operating margin ${pct(r.opMargin)}`);
    if (r.netMargin != null) parts.push(`net margin ${pct(r.netMargin)}`);
    if (sector?.op_margin != null && r.opMargin != null) parts.push(`${f.sector} median operating margin ${pct(sector.op_margin)}`);
    out.push({ key: "fundamentals", label: "Fundamentals", state, tone, detail: `${parts.join("; ")}${fy ? `. Fiscal year ended ${fy}.` : "."}`,
      rule: "Revenue growth (5% either way) and profitability from SEC filings" });
  }

  if (!f || f.market_cap == null) {
    out.push({ key: "valuation", label: "Valuation", state: f?.multi_class ? "Not computed" : "Not available", tone: "na",
      detail: f?.multi_class ? "The company has more than one listed share class, so a market cap from one class's price would be wrong." : "Needs shares outstanding from filings and a last close.",
      rule: "P/E or P/S against the sector median" });
  } else {
    const useP = r.pe != null;
    const mine = useP ? r.pe : r.ps, med = useP ? sector?.pe ?? null : sector?.ps ?? null;
    const name = useP ? "P/E" : "P/S";
    let state = `${name} ${multiple(mine)}`, tone: Dim["tone"] = "neutral";
    if (mine != null && med != null && sector && sector.n >= 10) {
      const rel = mine / med;
      state = rel >= 1.5 ? "Above sector" : rel <= 0.67 ? "Below sector" : "In line with sector";
      tone = rel >= 1.5 ? "warn" : "neutral";
    }
    const detail = `Market cap ${fmtBig(f.market_cap)}. ${name} ${multiple(mine)}${med != null ? ` against a ${f.sector} median of ${multiple(med)} (${sector!.n} companies)` : ""}.${useP ? "" : " P/E isn't meaningful while earnings are negative."} Trailing multiples are backward-looking, not a fair-value estimate.`;
    out.push({ key: "valuation", label: "Valuation", state, tone, detail, rule: `${name} against the sector median (1.5× apart counts as above or below)` });
  }
  return out;
}
