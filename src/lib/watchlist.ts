"use client";
import { browserClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";

/**
 * Watchlist operations for the signed-in user. Row-level security limits every read and write to
 * the user's own lists, so these run directly from the browser.
 */
export async function ensureWatchlist(userId: string): Promise<string> {
  const sb = browserClient();
  const { data } = await sb.from("watchlists").select("id").order("position").order("created_at").limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: created, error } = await sb.from("watchlists").insert({ user_id: userId, name: "My watchlist" }).select("id").single();
  if (error) throw error;
  void track("watchlist_created");
  return created.id as string;
}

export async function addToWatchlist(userId: string, securityId: number, symbol?: string) {
  const list = await ensureWatchlist(userId);
  const { error } = await browserClient().from("watchlist_items")
    .upsert({ watchlist_id: list, security_id: securityId, user_id: userId }, { onConflict: "watchlist_id,security_id", ignoreDuplicates: true });
  if (error) throw error;
  void track("watchlist_item_added", symbol ? { symbol } : {});
}

export async function removeFromWatchlist(securityId: number) {
  const { error } = await browserClient().from("watchlist_items").delete().eq("security_id", securityId);
  if (error) throw error;
}

export async function isWatched(securityId: number): Promise<boolean> {
  const { count } = await browserClient().from("watchlist_items").select("security_id", { count: "exact", head: true }).eq("security_id", securityId);
  return (count ?? 0) > 0;
}

export async function saveWatchNote(securityId: number, notes: string) {
  const { error } = await browserClient().from("watchlist_items").update({ notes: notes.trim().slice(0, 1000) || null }).eq("security_id", securityId);
  if (error) throw error;
}
