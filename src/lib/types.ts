export interface Security {
  id: number;
  symbol: string;
  name: string;
  exchange: string | null;
  asset_type: "stock" | "etf" | "index" | "crypto" | "fx" | "future" | "commodity";
  asset_subtype: string;
  sector: string | null;
  industry: string | null;
  currency: string;
  country: string;
  is_active: boolean;
  listed_on: string | null;
  delisted_on: string | null;
  market_cap: number | null;
  cik: string | null;
  provider_symbol: string | null;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
  last_updated: string;
}

export interface SearchHit {
  id: number;
  symbol: string;
  name: string;
  exchange: string | null;
  asset_type: string;
  asset_subtype: string;
  is_active: boolean;
  score: number;
}

export interface SecurityEvent {
  id: number;
  security_id: number;
  event_type: "listed" | "delisted" | "renamed" | "exchange_change" | "type_change";
  old_value: string | null;
  new_value: string | null;
  effective_at: string;
  created_at: string;
}

export interface SyncRun {
  id: number;
  job: string;
  provider: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "succeeded" | "failed" | "aborted";
  stats: Record<string, number | boolean | string>;
  error: string | null;
}
