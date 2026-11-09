import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import type { Fundamentals, SectorMedian } from "./model";

/** On since Nov 9 2026, when the SEC EDGAR load (migration 0040) completed. */
export const FUNDAMENTALS_LIVE = true;

export async function getFundamentals(symbols: string[]): Promise<Fundamentals[]> {
  if (!FUNDAMENTALS_LIVE) throw new Error("fundamentals not enabled");
  if (!symbols.length) return [];
  const { data, error } = await db().rpc("get_fundamentals", { p_symbols: symbols.slice(0, 60) });
  if (error) throw new Error(error.message);
  return (data ?? []) as Fundamentals[];
}

/** Sector medians change with filings and prices once a day at most, so they're cached for six hours. */
export const getSectorMedians = unstable_cache(async (): Promise<SectorMedian[]> => {
  if (!FUNDAMENTALS_LIVE) return [];
  const { data, error } = await db().rpc("sector_medians");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("sector medians empty");
  return data as SectorMedian[];
}, ["sector-medians-v2"], { revalidate: 21_600 });
