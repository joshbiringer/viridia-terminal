/**
 * Market-data abstraction. Every vendor adapter implements MarketDataProvider,
 * so the rest of the app never depends on a vendor's symbol format, rate limit
 * or response shape. Adapters for Massive and Twelve Data arrive in Phase 2.
 */

/** Timeframes fetched from vendors. 4h, 1w and 1mo are derived by resampling. */
export type NativeTimeframe = "1h" | "1d";
export type Timeframe = NativeTimeframe | "4h" | "1w" | "1mo";

export interface Bar {
  ts: string;          // ISO-8601, bar open time in UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  asOf: string;
  delayed: boolean;
}

export interface ProviderSymbolHit {
  providerSymbol: string;
  name: string;
  exchange?: string;
  assetType?: string;
}

export interface ProviderSecurityDetails {
  providerSymbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  cik?: string;
  currency?: string;
}

export interface ProviderCapabilities {
  /** Requests allowed per minute; the ingestion queue throttles to this. */
  requestsPerMinute: number;
  /** Requests allowed per day, if the plan has a daily cap. */
  requestsPerDay?: number;
  /** How far back daily history goes, in years. */
  dailyHistoryYears: number;
  intraday: boolean;
  /** One call returns every symbol's bar for a date (makes nightly scans cheap). */
  wholeMarketDaily: boolean;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  searchSymbols(query: string): Promise<ProviderSymbolHit[]>;
  getSecurityDetails(canonicalSymbol: string): Promise<ProviderSecurityDetails | null>;
  getHistoricalBars(canonicalSymbol: string, tf: NativeTimeframe, from: Date, to: Date): Promise<Bar[]>;
  getLatestQuote(canonicalSymbol: string): Promise<Quote | null>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Market-data provider "${provider}" is not configured. Set MARKET_DATA_PROVIDER and its API key (Phase 2).`);
  }
}
