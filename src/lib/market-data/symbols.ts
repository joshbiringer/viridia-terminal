/**
 * Canonical → vendor symbol mapping. Canonical formats are defined in
 * supabase/functions/sync-security-master/security-master.ts.
 * Rows in security_provider_symbols override these rules for edge cases.
 */
export type ProviderId = "massive" | "twelvedata";

export function toProviderSymbol(canonical: string, provider: ProviderId): string {
  const s = canonical.toUpperCase();
  if (s.startsWith("^")) {
    const idx = s.slice(1);
    if (provider === "massive") return `I:${idx === "IXIC" ? "COMP" : idx}`;
    return idx;
  }
  const pref = s.match(/^([A-Z.]+)-P([A-Z]*)$/);
  if (pref) {
    // Massive writes preferreds as ABRpD; Twelve Data as ABR/PD. Verify per symbol in Phase 2.
    return provider === "massive" ? `${pref[1]}p${pref[2]}` : `${pref[1]}/P${pref[2]}`;
  }
  return s; // class shares (BRK.B) and plain tickers pass through
}

export function fromProviderSymbol(providerSymbol: string, provider: ProviderId): string {
  if (provider === "massive") {
    if (providerSymbol.startsWith("I:")) {
      const idx = providerSymbol.slice(2);
      return `^${idx === "COMP" ? "IXIC" : idx}`;
    }
    const pref = providerSymbol.match(/^([A-Z.]+)p([A-Z]*)$/);
    if (pref) return `${pref[1]}-P${pref[2]}`;
  }
  if (provider === "twelvedata") {
    const pref = providerSymbol.match(/^([A-Z.]+)\/P([A-Z]*)$/);
    if (pref) return `${pref[1]}-P${pref[2]}`;
  }
  return providerSymbol.toUpperCase();
}
