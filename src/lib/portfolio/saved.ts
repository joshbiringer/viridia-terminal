"use client";
import { browserClient } from "@/lib/supabase/client";
import type { XRaySnapshot } from "./snapshot";

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

export async function renamePortfolio(id: string, name: string): Promise<SavedPortfolio> {
  const { data, error } = await browserClient().from("portfolios").update({ name: name.trim().slice(0, 80) || "Untitled portfolio" }).eq("id", id).select(COLS).single();
  if (error) throw error;
  return data as SavedPortfolio;
}

/** A stored X-Ray snapshot (portfolio_snapshots); owner-only by row-level security. */
export interface SavedSnapshot { id: string; portfolio_id: string; label: string | null; snapshot: XRaySnapshot; created_at: string }

export async function listSnapshots(portfolioId: string): Promise<SavedSnapshot[]> {
  const { data, error } = await browserClient().from("portfolio_snapshots").select("id, portfolio_id, label, snapshot, created_at")
    .eq("portfolio_id", portfolioId).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  return ((data ?? []) as SavedSnapshot[]).filter((s) => s.snapshot?.v === 2);
}

export async function saveSnapshot(portfolioId: string, snapshot: XRaySnapshot, label?: string | null): Promise<SavedSnapshot> {
  const { data, error } = await browserClient().from("portfolio_snapshots").insert({ portfolio_id: portfolioId, snapshot, label: label?.trim().slice(0, 80) || null })
    .select("id, portfolio_id, label, snapshot, created_at").single();
  if (error) throw error;
  return data as SavedSnapshot;
}

export async function deleteSnapshot(id: string): Promise<void> {
  const { error } = await browserClient().from("portfolio_snapshots").delete().eq("id", id);
  if (error) throw error;
}
