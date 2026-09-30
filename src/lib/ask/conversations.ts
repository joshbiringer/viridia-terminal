"use client";
import { browserClient } from "@/lib/supabase/client";
import type { Answer, Audience, Depth } from "./types";

/** One turn of a saved conversation. The answer keeps its internal trace; the UI doesn't show it. */
export type Turn =
  | { role: "user"; q: string; audience: Audience; depth: Depth; at: string }
  | { role: "assistant"; answer: Answer; at: string };

export interface Conversation {
  id: string; title: string; workspace: string | null; archived: boolean; entities: string[];
  messages: Turn[]; created_at: string; updated_at: string;
}

const COLS = "id, title, workspace, archived, entities, messages, created_at, updated_at";

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await browserClient().from("ask_conversations").select(COLS).order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function createConversation(c: { title: string; workspace?: string | null; messages: Turn[]; entities: string[] }): Promise<Conversation> {
  const { data, error } = await browserClient().from("ask_conversations")
    .insert({ title: c.title.slice(0, 120) || "New conversation", workspace: c.workspace?.slice(0, 80) || null, messages: c.messages, entities: c.entities.slice(0, 50) })
    .select(COLS).single();
  if (error) throw error;
  return data as Conversation;
}

export async function updateConversation(id: string, patch: Partial<Pick<Conversation, "title" | "workspace" | "archived" | "messages" | "entities">>): Promise<Conversation> {
  const row: Record<string, unknown> = { ...patch };
  if (typeof patch.title === "string") row.title = patch.title.slice(0, 120) || "Untitled";
  if (patch.workspace !== undefined) row.workspace = patch.workspace?.slice(0, 80) || null;
  const { data, error } = await browserClient().from("ask_conversations").update(row).eq("id", id).select(COLS).single();
  if (error) throw error;
  return data as Conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await browserClient().from("ask_conversations").delete().eq("id", id);
  if (error) throw error;
}
