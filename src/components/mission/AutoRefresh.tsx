"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Re-fetches the server-rendered page every few minutes while the tab is visible, and on return to
 * a tab that has been hidden longer than that. The server caches market data, so a refresh costs
 * one request and never a burst of database queries. The plan is end of day, so there's nothing to
 * stream; this just picks up a newly published session without a manual reload.
 */
export function AutoRefresh({ everyMs = 5 * 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < everyMs) return;
      last.current = Date.now();
      router.refresh();
    };
    const t = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, [router, everyMs]);
  return null;
}
