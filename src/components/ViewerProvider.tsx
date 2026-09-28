"use client";

import { createContext, useContext, useEffect } from "react";
import type { Preferences, Viewer } from "@/lib/auth";
import { applyTheme } from "@/lib/theme";
import { browserClient } from "@/lib/supabase/client";

type Ctx = { viewer: Viewer | null; prefs: Preferences | null };
const ViewerContext = createContext<Ctx>({ viewer: null, prefs: null });

/** Makes the signed-in user and their preferences available to client components. */
export function ViewerProvider({ viewer, prefs, children }: Ctx & { children: React.ReactNode }) {
  // A signed-in user's saved theme wins over whatever this browser last used.
  useEffect(() => { if (prefs?.theme) applyTheme(prefs.theme); }, [prefs?.theme]);
  // Theme changes made from the top bar or command palette are saved to the account.
  useEffect(() => {
    if (!viewer) return;
    const save = (e: Event) => {
      const theme = (e as CustomEvent<string>).detail;
      void browserClient().from("user_preferences").update({ theme }).eq("user_id", viewer.id);
    };
    window.addEventListener("viridia:theme-changed", save);
    return () => window.removeEventListener("viridia:theme-changed", save);
  }, [viewer]);
  return <ViewerContext.Provider value={{ viewer, prefs }}>{children}</ViewerContext.Provider>;
}

export const useViewer = () => useContext(ViewerContext);
