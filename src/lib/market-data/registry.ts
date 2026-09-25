import { ProviderNotConfiguredError, type MarketDataProvider } from "./types";

/**
 * Server-side provider hook for future adapters. In Phase 2 all vendor calls run inside Supabase
 * (supabase/functions/market-data-worker), which keeps the API key out of the app entirely;
 * the app reads bars through get_bars() and queues fetches through request_price_history().
 */
export function getMarketDataProvider(): MarketDataProvider | null {
  const id = process.env.MARKET_DATA_PROVIDER;
  if (!id) return null;
  throw new ProviderNotConfiguredError(id);
}

export const MARKET_DATA_PLAN = {
  primary: {
    id: "massive",
    plan: "Stocks Basic (free)",
    use: "Nightly whole-market daily bars via the grouped-daily endpoint; 2 years of history",
  },
  secondary: {
    id: "twelvedata",
    plan: "Basic (free)",
    use: "Optional fallback for deeper history if the Massive free window is not enough",
  },
} as const;
