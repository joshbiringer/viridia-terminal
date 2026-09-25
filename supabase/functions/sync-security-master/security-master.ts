/**
 * Security-master normalization.
 *
 * Pure and dependency-free so the same file runs inside the Supabase Edge
 * Function (Deno) and inside the Next.js app and its unit tests (Node).
 *
 * Sources (free, authoritative, no API key):
 *   - Nasdaq Trader symbol directory: nasdaqlisted.txt (Nasdaq-listed) and
 *     otherlisted.txt (NYSE, NYSE American, NYSE Arca, Cboe BZX, IEX)
 *   - SEC company_tickers_exchange.json for CIK enrichment
 *
 * Canonical symbol format (what the app stores and displays):
 *   class shares   BRK.B
 *   preferred      ABR-PD        (series D)
 *   warrants       XYZ.WS / XYZ.WS.A
 *   units          XYZ.U
 *   rights         XYZ.RT
 *   indexes        ^SPX
 * Provider-specific formats live in security_provider_symbols / provider adapters.
 */

export type AssetType = "stock" | "etf" | "index";
export type AssetSubtype =
  | "common" | "etf" | "preferred" | "warrant" | "unit" | "right" | "note" | "index" | "other";

export interface StagedSecurity {
  symbol: string;
  raw_symbol: string;
  name: string;
  exchange: string;
  asset_type: AssetType;
  asset_subtype: AssetSubtype;
  cik: string | null;
  source_file: "nasdaqlisted" | "otherlisted";
}

/** otherlisted.txt "Exchange" column → ISO 10383 MIC */
export const OTHER_EXCHANGE_MIC: Record<string, string> = {
  A: "XASE", // NYSE American
  N: "XNYS", // NYSE
  P: "ARCX", // NYSE Arca
  Z: "BATS", // Cboe BZX
  V: "IEXG", // IEX
};

export const EXCHANGE_LABEL: Record<string, string> = {
  XNAS: "NASDAQ", XNYS: "NYSE", XASE: "NYSE American", ARCX: "NYSE Arca",
  BATS: "Cboe BZX", IEXG: "IEX", INDEX: "Index",
};

/** Convert ACT/CQS-style suffix markers into the canonical format. */
export function normalizeSymbol(raw: string): { symbol: string; marker: AssetSubtype | null } {
  const s = raw.trim().toUpperCase().replace(/\//g, ".");
  const i = s.search(/[$+=^#*~%]/);
  if (i < 0) return { symbol: s, marker: null };
  const base = s.slice(0, i);
  const mark = s[i];
  const rest = s.slice(i + 1).replace(/[^A-Z0-9]/g, "");
  switch (mark) {
    case "$": return { symbol: `${base}-P${rest}`, marker: "preferred" };
    case "+": return { symbol: `${base}.WS${rest ? "." + rest : ""}`, marker: "warrant" };
    case "=": return { symbol: `${base}.U${rest ? "." + rest : ""}`, marker: "unit" };
    case "^": return { symbol: `${base}.RT${rest ? "." + rest : ""}`, marker: "right" };
    case "#": return { symbol: `${base}.WI${rest ? "." + rest : ""}`, marker: "other" };
    default:  return { symbol: `${base}.${rest || "X"}`, marker: "other" };
  }
}

/** Classify from the ETF flag, the symbol marker and the raw security name. */
export function classify(rawName: string, isEtf: boolean, marker: AssetSubtype | null):
  { asset_type: AssetType; asset_subtype: AssetSubtype } {
  if (isEtf) return { asset_type: "etf", asset_subtype: "etf" };
  if (marker) return { asset_type: "stock", asset_subtype: marker };
  const n = rawName.toLowerCase();
  if (/american depositary|global depositary/.test(n)) return { asset_type: "stock", asset_subtype: "common" };
  if (/common units|limited partner/.test(n)) return { asset_type: "stock", asset_subtype: "common" };
  // Units first: SPAC unit names mention the warrant or right they contain
  // ("Units, each consisting of one Class A share and one-third of one redeemable warrant").
  if (/\bunits?\b/.test(n)) return { asset_type: "stock", asset_subtype: "unit" };
  if (/\bwarrants?\b/.test(n)) return { asset_type: "stock", asset_subtype: "warrant" };
  if (/\brights?\b/.test(n)) return { asset_type: "stock", asset_subtype: "right" };
  if (/preferred|depositary shares|\bpfd\b|perpetual|cumulative/.test(n)) return { asset_type: "stock", asset_subtype: "preferred" };
  if (/\bnotes? due\b|debentures|senior notes|subordinated notes|\bbaby bonds?\b/.test(n)) return { asset_type: "stock", asset_subtype: "note" };
  return { asset_type: "stock", asset_subtype: "common" };
}

/** "NVIDIA Corporation - Common Stock" → "NVIDIA Corporation"; keeps share class and instrument type. */
export function cleanName(raw: string): string {
  let n = raw.replace(/\s+/g, " ").trim();
  const idx = n.indexOf(" - ");
  if (idx > 0) {
    const base = n.slice(0, idx);
    const rest = n.slice(idx + 3);
    const cls = rest.match(/\bClass [A-Z]\b/);
    const instrument = /warrant|\bunits?\b|\brights?\b|preferred|depositary shares|notes?\b/i.test(rest) &&
      !/american depositary/i.test(rest)
      ? rest.replace(/\b(Common Stock|Ordinary Shares)\b/gi, "").replace(/\s+/g, " ").trim()
      : "";
    n = base + (cls ? " " + cls[0] : "") + (!cls && instrument ? " " + instrument : "");
  }
  return n.replace(/\s+(Common Stock|Ordinary Shares|Common Shares)$/i, "").trim();
}

export function parsePipeFile(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("File Creation Time"));
  if (!lines.length) return [];
  const header = lines[0].split("|").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split("|");
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

export function parseNasdaqListed(text: string): StagedSecurity[] {
  const rows = parsePipeFile(text);
  if (rows.length && !("Symbol" in rows[0])) throw new Error("nasdaqlisted.txt: unexpected header");
  return rows.filter((r) => r["Symbol"] && r["Test Issue"] !== "Y").map((r) => {
    const { symbol, marker } = normalizeSymbol(r["Symbol"]);
    return {
      symbol, raw_symbol: r["Symbol"], name: cleanName(r["Security Name"]), exchange: "XNAS",
      ...classify(r["Security Name"], r["ETF"] === "Y", marker), cik: null, source_file: "nasdaqlisted",
    };
  });
}

export function parseOtherListed(text: string): StagedSecurity[] {
  const rows = parsePipeFile(text);
  if (rows.length && !("ACT Symbol" in rows[0])) throw new Error("otherlisted.txt: unexpected header");
  return rows.filter((r) => r["ACT Symbol"] && r["Test Issue"] !== "Y").map((r) => {
    const { symbol, marker } = normalizeSymbol(r["ACT Symbol"]);
    return {
      symbol, raw_symbol: r["ACT Symbol"], name: cleanName(r["Security Name"]),
      exchange: OTHER_EXCHANGE_MIC[r["Exchange"]] ?? r["Exchange"],
      ...classify(r["Security Name"], r["ETF"] === "Y", marker), cik: null, source_file: "otherlisted",
    };
  });
}

/** SEC uses BRK-B for classes and BAC-PL for preferreds. Returns canonical symbol → zero-padded CIK. */
export function normalizeSecTicker(t: string): string {
  const s = t.trim().toUpperCase();
  if (/^[A-Z]+-P[A-Z]*$/.test(s)) return s;
  const m = s.match(/^([A-Z]+)-([A-Z])$/);
  return m ? `${m[1]}.${m[2]}` : s;
}

export function parseSecTickers(json: { fields: string[]; data: unknown[][] }): Map<string, string> {
  const out = new Map<string, string>();
  const ci = json.fields.indexOf("cik"), ti = json.fields.indexOf("ticker");
  if (ci < 0 || ti < 0) return out;
  for (const row of json.data) {
    const cik = row[ci], ticker = row[ti];
    if (cik == null || typeof ticker !== "string") continue;
    const sym = normalizeSecTicker(ticker);
    if (!out.has(sym)) out.set(sym, String(cik).padStart(10, "0"));
  }
  return out;
}

/** Keep one row per canonical symbol; Nasdaq's own file wins for Nasdaq-listed names. */
export function dedupe(rows: StagedSecurity[]): StagedSecurity[] {
  const m = new Map<string, StagedSecurity>();
  for (const r of rows) {
    const cur = m.get(r.symbol);
    if (!cur || (r.source_file === "nasdaqlisted" && cur.source_file !== "nasdaqlisted")) m.set(r.symbol, r);
  }
  return [...m.values()];
}
