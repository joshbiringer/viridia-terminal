"use client";
import { browserClient } from "@/lib/supabase/client";

/** A saved portfolio. Row-level security limits every read and write to its owner. */
export interface SavedPortfolio {
  id: string; name: string; holdings_text: string; targets: Record<string, number>;
  review_snapshot: unknown | null; reviewed_at: string | null; created_at: string; updated_at: string;
}

const COLS = "id, name, holdings_text, targets, review_snapshot, reviewed_at, created_at, updated_at";

export async function listPortfolios(): Promise<SavedPortfolio[]> {
  const { data, error } = await browserClient().from("portfolios").select(COLS).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedPortfolio[];
}

export async function getPortfolio(id: string): Promise<SavedPortfolio | null> {
  const { data, error } = await browserClient().from("portfolios").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as SavedPortfolio | null;
}

export async function savePortfolio(p: { id?: string | null; name: string; holdings_text: string; targets?: Record<string, number> }): Promise<SavedPortfolio> {
  const sb = browserClient();
  const row = { name: p.name.trim().slice(0, 80) || "Untitled portfolio", holdings_text: p.holdings_text.slice(0, 20_000), ...(p.targets ? { targets: p.targets } : {}) };
  const q = p.id ? sb.from("portfolios").update(row).eq("id", p.id) : sb.from("portfolios").insert(row);
  const { data, error } = await q.select(COLS).single();
  if (error) throw error;
  return data as SavedPortfolio;
}

export async function saveReview(id: string, snapshot: unknown): Promise<void> {
  const { error } = await browserClient().from("portfolios").update({ review_snapshot: snapshot, reviewed_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function deletePortfolio(id: string): Promise<void> {
  const { error } = await browserClient().from("portfolios").delete().eq("id", id);
  if (error) throw error;
}
