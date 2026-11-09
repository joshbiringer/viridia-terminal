import { db } from "@/lib/supabase";
import { authClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { withTimeout } from "@/lib/timeout";
import { FUNDAMENTALS_LIVE, getFundamentals, getSectorMedians } from "@/lib/fundamentals/server";
import { ratios } from "@/lib/fundamentals/model";
import { unstable_cache } from "next/cache";
import { brainSignal, thesisUniverse, type BrainSignal, type MarketRow, type Thesis, type ValueInputs } from "./signal";
import { evaluate, runScreens, type CompanyFigures, type Screen } from "./screens";

export interface BrainSource { id: string; kind: string; title: string; publisher: string | null; author: string | null; published_on: string | null; summary: string | null; created_at: string }
export interface Brain { signedIn: boolean; theses: Thesis[]; sources: BrainSource[]; screens: Screen[] }

/** The viewer's theses and sources, through their own session (row-level security keeps them private). */
export async function getBrain(): Promise<Brain> {
  const viewer = await withTimeout(getViewer(), 4_000, "viewer").catch(() => null);
  if (!viewer) return { signedIn: false, theses: [], sources: [], screens: [] };
  const sb = await authClient();
  const [t, s, sc] = await Promise.all([
    withTimeout(sb.from("brain_theses").select("id, title, stance, conviction, horizon, status, style, thesis, invalidation, tags, created_at, expires_on, source:brain_sources(title, publisher, published_on, kind), links:brain_links(kind, value, stance, weight)").order("created_at", { ascending: false }), 6_000),
    withTimeout(sb.from("brain_sources").select("id, kind, title, publisher, author, published_on, summary, created_at").order("published_on", { ascending: false, nullsFirst: false }), 6_000),
    withTimeout(sb.from("brain_screens").select("id, name, philosophy, criteria, notes, source, active").order("created_at"), 6_000),
  ]).catch(() => [{ data: [] }, { data: [] }, { data: [] }] as const);
  return { signedIn: true, theses: (t.data ?? []) as unknown as Thesis[], sources: (s.data ?? []) as BrainSource[], screens: (sc.data ?? []) as Screen[] };
}

/** Value inputs from SEC fundamentals once that pipeline is on; null until then (the value third is left out, not guessed). */
async function valueInputs(symbols: string[]): Promise<Map<string, ValueInputs>> {
  const out = new Map<string, ValueInputs>();
  if (!FUNDAMENTALS_LIVE || !symbols.length) return out;
  const [funds, medians] = await Promise.all([getFundamentals(symbols).catch(() => []), getSectorMedians().catch(() => [])]);
  for (const f of funds) {
    const r = ratios(f);
    const m = medians.find((x) => x.sector === f.sector);
    const cap = f.market_cap;
    const fcf = f.operating_cash_flow != null && f.capex != null ? f.operating_cash_flow - Math.abs(f.capex) : null;
    out.set(f.symbol, {
      pe: r.pe, sectorPe: m?.pe ?? null, ps: r.ps, sectorPs: m?.ps ?? null, opMargin: r.opMargin, sectorOpMargin: m?.op_margin ?? null, growth: r.growth,
      pb: cap && f.equity && f.equity > 0 ? cap / f.equity : null,
      fcfYield: cap && fcf != null ? fcf / cap : null,
      netCashToCap: cap && f.cash != null && f.debt != null ? (f.cash - f.debt) / cap : null,
    });
  }
  return out;
}

export async function marketRows(symbols: string[]): Promise<MarketRow[]> {
  if (!symbols.length) return [];
  const { data, error } = await withTimeout(db().rpc("brain_market", { p_symbols: symbols.slice(0, 200) }), 8_000, "brain market");
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketRow[];
}

/** Screen inputs for every company with filings; the same for every reader, so cached for six hours. */
const screenUniverse = unstable_cache(async (): Promise<CompanyFigures[]> => {
  if (!FUNDAMENTALS_LIVE) return [];
  const { data, error } = await db().rpc("fundamentals_universe");
  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyFigures[];
}, ["fundamentals-universe-v1"], { revalidate: 21_600 });

export interface ScreenRun { screen: Screen; passing: string[]; checkable: number }

/** Run the reader's screens: who passes each, and how many companies had every figure to check. */
export async function runBrainScreens(screens: Screen[]): Promise<{ runs: ScreenRun[]; universe: Map<string, CompanyFigures> }> {
  const all = await withTimeout(screenUniverse(), 10_000, "screen universe").catch(() => [] as CompanyFigures[]);
  const universe = new Map(all.map((f) => [f.symbol, f]));
  const runs = runScreens(screens, all).map((r) => ({
    screen: r.screen, checkable: r.checkable,
    passing: r.passing.sort((a, b) => (b.f.market_cap ?? 0) - (a.f.market_cap ?? 0)).map((p) => p.f.symbol),
  }));
  return { runs, universe };
}

/**
 * Signals for every security the theses touch, every company passing one of the reader's screens
 * (largest first, up to 25 per screen) and any extra symbols asked for.
 */
export async function brainSignals(theses: Thesis[], extra: string[] = [], screens: Screen[] = [], opts: { screenPasses?: boolean } = {}): Promise<{ signals: (BrainSignal & { row: MarketRow })[]; valueLive: boolean; runs: ScreenRun[] }> {
  const { runs, universe: figs } = screens.length ? await runBrainScreens(screens) : { runs: [] as ScreenRun[], universe: new Map<string, CompanyFigures>() };
  const universe = [...new Set([...thesisUniverse(theses), ...(opts.screenPasses === false ? [] : runs.flatMap((r) => r.passing.slice(0, 25))), ...extra.map((s) => s.toUpperCase())])];
  const [rows, values] = await Promise.all([marketRows(universe).catch(() => []), valueInputs(universe)]);
  const active = screens.filter((s) => s.active);
  const signals = rows.map((row) => {
    const f = figs.get(row.symbol);
    const sc = f ? active.map((s) => { const r = evaluate(s, f); return { name: s.name, philosophy: s.philosophy, passed: r.passed, met: r.met, total: r.total }; }) : [];
    const v = values.get(row.symbol) ?? (sc.length ? {} : null);
    return { ...brainSignal(row, theses, v ? { ...v, screens: sc } : null), row };
  });
  signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  return { signals, valueLive: FUNDAMENTALS_LIVE, runs };
}
