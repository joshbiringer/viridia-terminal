import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Read-only Supabase client using the publishable key. Row-level security
 * restricts it to public reads of the security master. Writes (price bars,
 * analysis cache) will use a server-only secret key from Phase 2 on.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
