/**
 * Advisor Mode: architecture hooks only. Nothing here is exposed in the product yet.
 *
 * The data model already supports it (migration 0035):
 *  - portfolios.kind       'personal' (default) | 'client' | 'model'
 *  - portfolios.household  free-text household grouping for client portfolios
 *  - portfolios.benchmark  the saved benchmark choice ({ id } or { custom: {SYMBOL: weight} })
 *  - portfolios.targets    target weights (current vs target, drift monitoring)
 *  - portfolio_snapshots   review snapshots (what changed between meetings)
 *
 * Planned surfaces, in order: client portfolio list grouped by household; model portfolios whose
 * targets client portfolios can adopt; drift monitoring across clients (DRIFT_BAND in xray.ts);
 * review-meeting preparation from snapshots (portfolio/review); PDF portfolio reports rendered from
 * the same Workspace object. Each will read the Workspace (workspace.ts) so figures never differ
 * between screens and reports.
 */
export type PortfolioKind = "personal" | "client" | "model";

export interface AdvisorPortfolioMeta {
  kind: PortfolioKind;
  household: string | null;
  benchmark: { id: string } | { custom: Record<string, number> } | null;
}

/** Feature flag: Advisor Mode stays hidden until its surfaces are built. */
export const ADVISOR_MODE_ENABLED = false;
