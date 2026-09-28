import { authClient } from "@/lib/supabase/server";

export interface Viewer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  initials: string;
  onboarded: boolean;
  createdAt: string;
}

export interface Preferences {
  theme: "light" | "dark" | "system";
  default_timeframe: "1h" | "4h" | "1d" | "1w" | "1mo";
  default_degree: "auto" | "primary" | "intermediate" | "minor";
  chart_density: "comfortable" | "compact";
  landing_page: "/terminal" | "/watchlist" | "/markets" | "/scanner";
  notifications: Record<string, boolean>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system", default_timeframe: "1d", default_degree: "auto", chart_density: "comfortable", landing_page: "/terminal", notifications: {},
};

/** The signed-in user with their profile, or null. Verifies the session with Supabase Auth. */
export async function getViewer(): Promise<Viewer | null> {
  const sb = await authClient();
  const { data } = await sb.auth.getUser();
  const u = data.user;
  if (!u) return null;
  const { data: p } = await sb.from("profiles").select("first_name, last_name, onboarded_at").eq("id", u.id).maybeSingle();
  const first = p?.first_name ?? null, last = p?.last_name ?? null;
  const email = u.email ?? "";
  const displayName = [first, last].filter(Boolean).join(" ") || email.split("@")[0];
  const initials = (first || last ? `${first?.[0] ?? ""}${last?.[0] ?? ""}` : email[0] ?? "?").toUpperCase();
  return { id: u.id, email, firstName: first, lastName: last, displayName, initials, onboarded: !!p?.onboarded_at, createdAt: u.created_at };
}

export async function getPreferences(): Promise<Preferences | null> {
  const sb = await authClient();
  const { data } = await sb.from("user_preferences").select("theme, default_timeframe, default_degree, chart_density, landing_page, notifications").maybeSingle();
  return data ? { ...DEFAULT_PREFERENCES, ...(data as Preferences) } : null;
}
