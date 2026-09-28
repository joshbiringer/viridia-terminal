"use client";
import { browserClient } from "@/lib/supabase/client";

/**
 * First-party funnel events (table public.product_events). Only a fixed list of event names is
 * accepted by the database; no IP address, user agent or typed text is recorded. Anonymous
 * visitors get a random id kept in this browser so a funnel can be followed before sign-up.
 */
export type ProductEvent =
  | "landing_view" | "signup_started" | "signup_completed" | "signin_completed" | "onboarding_started" | "onboarding_completed"
  | "ticker_searched" | "analysis_viewed" | "watchlist_created" | "watchlist_item_added" | "alert_created";

function anonId(): string {
  try {
    let id = localStorage.getItem("viridia.aid");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("viridia.aid", id); }
    return id;
  } catch { return "unknown"; }
}

export async function track(event: ProductEvent, props: Record<string, string | number | boolean> = {}) {
  try {
    const sb = browserClient();
    const { data } = await sb.auth.getSession();
    await sb.from("product_events").insert({
      event, props, path: location.pathname.slice(0, 200), anon_id: anonId(), user_id: data.session?.user.id ?? null,
    });
  } catch { /* analytics must never break the product */ }
}
