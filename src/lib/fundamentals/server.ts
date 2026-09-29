import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import type { Fundamentals, SectorMedian } from "./model";

export async function getFundamentals(symbols: string[]): Promise<Fundamentals[]> {
  if (!symbols.length) return [];
  const { data, error } = await db().rpc("get_fundamentals", { p_symbols: symbols.slice(0, 60) });
  if (error) throw new Error(error.message);
  return (data ?? []) as Fundamentals[];
}

/** Sector medians change with filings and prices once a day at most, so they're cached for six hours. */
export const getSectorMedians = unstable_cache(async (): Promise<SectorMedian[]> => {
  const { data, error } = await db().rpc("sector_medians");
  if (error) throw new Error(error.message);
  return (data ?? []) as SectorMedian[];
}, ["sector-medians-v1"], { revalidate: 21_600 });
