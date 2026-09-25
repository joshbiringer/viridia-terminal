/**
 * analysis-worker: keeps the analysis cache current.
 *
 * Runs every five minutes (pg_cron → trigger_analysis_worker). Each run:
 *   1. takes a lease so runs never overlap
 *   2. asks Postgres for securities whose cached analysis is missing or stale (analysis_batch)
 *   3. runs the engine on their bars: pivots (Phase 3), then candidate wave counts validated against
 *      the hard rules (Phases 4–5). These are the same engine files the app and tests use.
 *   4. stores results (store_analysis_results), until the time budget is spent
 *
 * The engine is deterministic and uses only the bars it is given; nothing is estimated or generated.
 * Auth: x-cron-secret (Vault "kestrel_cron_secret").
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DEGREES, analyzePivots, compact, swingStructure, type PivotBar, type Timeframe } from "../_shared/engine/pivots.ts";
import { ANALYSIS_VERSION, compactSet, generateCandidates } from "../_shared/engine/candidates.ts";

const TIME_BUDGET_MS = 100_000;
// Small batches: after a version change every row is stale and cold bar reads approach the 8 s statement limit.
const BATCH = 15;
const TIMEFRAMES: Timeframe[] = ["1d", "1w"];

type BatchRow = {
  security_id: number;
  symbol: string;
  source_first_ts: string | null;
  source_last_ts: string | null;
  bars: [string, number, number, number, number][];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const started = Date.now();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: authorized, error: authErr } = await db.rpc("check_cron_secret", {
    p_secret: req.headers.get("x-cron-secret") ?? "",
  });
  if (authErr || authorized !== true) return json({ error: "unauthorized" }, 401);

  const { data: leased, error: leaseErr } = await db.rpc("analysis_acquire_lease", { p_seconds: 150 });
  if (leaseErr) return json({ error: leaseErr.message }, 500);
  if (!leased) return json({ skipped: "another run holds the lease" });

  const summary: Record<string, number | string> = { version: ANALYSIS_VERSION, started_at: new Date(started).toISOString() };
  try {
    // Alternate timeframes batch by batch so neither starves when the budget runs out.
    const done: Record<string, number> = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, 0]));
    const active = new Set<Timeframe>(TIMEFRAMES);
    let counts = 0;
    while (active.size && Date.now() - started < TIME_BUDGET_MS) {
      for (const tf of [...active]) {
        if (Date.now() - started >= TIME_BUDGET_MS) break;
        const { data, error } = await db.rpc("analysis_batch", { p_timeframe: tf, p_version: ANALYSIS_VERSION, p_limit: BATCH });
        if (error) throw new Error(`analysis_batch ${tf}: ${error.message}`);
        const rows = (data ?? []) as BatchRow[];
        if (rows.length < BATCH) active.delete(tf);
        if (!rows.length) continue;

        const out = rows.map((r) => {
          const bars: PivotBar[] = r.bars.map(([ts, open, high, low, close]) => ({ ts, open, high, low, close }));
          const a = analyzePivots(bars, tf);
          const pivots_json = Object.fromEntries(DEGREES.map((d) => {
            const s = a.degrees[d];
            return [d, { params: s.params, pivots: s.pivots.map(compact), pending: s.pending }];
          }));
          const swing_structure = Object.fromEntries(DEGREES.map((d) => [d, swingStructure(a.degrees[d].pivots).structure]));
          let candidate_count = 0;
          const candidate_counts_json = Object.fromEntries(DEGREES.map((d) => {
            const s = a.degrees[d];
            const set = generateCandidates({ timeframe: tf, degree: d, pivots: s.pivots, bars, pending: s.pending });
            candidate_count += set.candidates.length;
            return [d, compactSet(set)];
          }));
          counts += candidate_count;
          return {
            security_id: r.security_id, timeframe: tf, algorithm_version: ANALYSIS_VERSION,
            // a security with no usable bars still gets a row, so it is not reselected every run
            analysis_timestamp: a.lastTs ?? r.source_last_ts ?? new Date().toISOString(),
            source_first_ts: r.source_first_ts, source_last_ts: r.source_last_ts,
            input_bars: a.bars, expires_at: null, swing_structure, pivots_json, candidate_counts_json, candidate_count,
          };
        });
        const { error: storeErr } = await db.rpc("store_analysis_results", { p_rows: out });
        if (storeErr) throw new Error(`store_analysis_results ${tf}: ${storeErr.message}`);
        done[tf] += out.length;
      }
    }
    Object.assign(summary, done);
    summary.candidates = counts;
    summary.ms = Date.now() - started;
    await db.rpc("analysis_release_lease", { p_summary: summary });
    return json(summary);
  } catch (e) {
    summary.error = (e as Error).message;
    summary.ms = Date.now() - started;
    await db.rpc("analysis_release_lease", { p_summary: summary });
    return json(summary, 500);
  }
});
