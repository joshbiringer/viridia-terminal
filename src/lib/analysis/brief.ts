import { db } from "@/lib/supabase";
import { PATTERN_LABEL, SETUP_LABEL, type CandidatePattern, type SetupKind } from "./candidates";

export interface ChangeRow {
  symbol: string; name: string; day: string; prev_day: string; adv20: number | null; close: number | null; change_pct: number | null;
  pattern: string | null; complete: boolean | null; wave: string | null; wave_dir: string | null; score: number | null;
  setup_side: string | null; setup_kind: string | null;
  p_pattern: string | null; p_complete: boolean | null; p_wave: string | null; p_wave_dir: string | null; p_score: number | null;
  p_setup_side: string | null; p_setup_kind: string | null;
  direction_flip: boolean; pattern_change: boolean; setup_new: boolean; setup_gone: boolean; confidence_move: boolean;
}

/** Structure changes between each security's last two recorded sessions (same engine version only). */
export async function getChanges(opts: { symbols?: string[] | null; minDollarVolume?: number | null; limit?: number } = {}): Promise<ChangeRow[]> {
  const { data } = await db().rpc("brief_changes", {
    p_symbols: opts.symbols ?? null, p_min_dollar_volume: opts.minDollarVolume ?? null, p_limit: opts.limit ?? 40,
  });
  return (data ?? []) as ChangeRow[];
}

const countText = (pattern: string | null, complete: boolean | null, wave: string | null, dir: string | null) =>
  pattern ? `${PATTERN_LABEL[pattern as CandidatePattern] ?? pattern} ${complete ? "complete" : `wave ${wave}`} ${dir === "up" ? "↑" : "↓"}` : "no count";

/** One plain sentence per change, most important first. */
export function describeChange(r: ChangeRow): string[] {
  const out: string[] = [];
  const now = countText(r.pattern, r.complete, r.wave, r.wave_dir), before = countText(r.p_pattern, r.p_complete, r.p_wave, r.p_wave_dir);
  if (r.direction_flip) out.push(`Preferred count flipped from ${before} to ${now}.`);
  else if (r.pattern_change) out.push(`Count moved on: ${before} → ${now}.`);
  if (r.setup_new) out.push(`New ${r.setup_side} setup: ${SETUP_LABEL[r.setup_kind as SetupKind] ?? r.setup_kind}.`);
  if (r.setup_gone) out.push(`The ${r.p_setup_side} setup (${SETUP_LABEL[r.p_setup_kind as SetupKind] ?? r.p_setup_kind}) no longer applies.`);
  if (r.confidence_move && r.score != null && r.p_score != null) out.push(`Pattern Confidence ${r.p_score} → ${r.score}.`);
  return out;
}
