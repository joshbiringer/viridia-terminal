/**
 * SEC EDGAR access for fundamentals (Cycle 5). Public data from data.sec.gov: XBRL "frames" (one
 * concept for every filer in one period) and company submissions (SIC code). SEC asks automated
 * clients to identify themselves and stay under 10 requests a second.
 */
export const SEC_UA = "Viridia Terminal research app joshbiringer@users.noreply.github.com";

export async function secJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": SEC_UA, "Accept": "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC ${r.status} for ${url}`);
  return r.json() as Promise<T>;
}

/** Concepts pulled from XBRL frames: [taxonomy, tag, unit, period kind]. */
export const FRAME_CONCEPTS: { taxonomy: "us-gaap" | "dei"; tag: string; unit: string; instant?: boolean }[] = [
  { taxonomy: "us-gaap", tag: "Revenues", unit: "USD" },
  { taxonomy: "us-gaap", tag: "RevenueFromContractWithCustomerExcludingAssessedTax", unit: "USD" },
  { taxonomy: "us-gaap", tag: "SalesRevenueNet", unit: "USD" },
  { taxonomy: "us-gaap", tag: "NetIncomeLoss", unit: "USD" },
  { taxonomy: "us-gaap", tag: "OperatingIncomeLoss", unit: "USD" },
  { taxonomy: "us-gaap", tag: "GrossProfit", unit: "USD" },
  { taxonomy: "dei", tag: "EntityCommonStockSharesOutstanding", unit: "shares", instant: true },
];

export const isFramePeriod = (p: string) => /^CY\d{4}(Q[1-4]I?)?$/.test(p);
