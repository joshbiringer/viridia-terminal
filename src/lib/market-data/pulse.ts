import { db } from "@/lib/supabase";
import type { PulseRow } from "@/lib/analysis/mission";

/** Price, 1-, 5- and 21-session-back closes, trend, 30 closes and the preferred daily count for up to 60 symbols. */
export async function getPulse(symbols: string[]): Promise<PulseRow[]> {
  if (!symbols.length) return [];
  const { data, error } = await db().rpc("market_pulse", { p_symbols: symbols.slice(0, 60) });
  if (error) throw new Error(error.message);
  return (data ?? []) as PulseRow[];
}
