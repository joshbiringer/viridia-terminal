"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useViewer } from "./ViewerProvider";
import { addToWatchlist, isWatched, removeFromWatchlist } from "@/lib/watchlist";

/** Watch / Watching toggle for a security page. Signed-out visitors are sent to create an account. */
export function WatchButton({ securityId, symbol }: { securityId: number; symbol: string }) {
  const { viewer } = useViewer();
  const [watched, setWatched] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (viewer) isWatched(securityId).then(setWatched).catch(() => setWatched(false)); }, [viewer, securityId]);

  const toggle = async () => {
    if (!viewer || busy) return;
    setBusy(true); setErr(null);
    const next = !watched;
    setWatched(next); // optimistic
    try { if (next) await addToWatchlist(viewer.id, securityId, symbol); else await removeFromWatchlist(securityId); }
    catch (e) { setWatched(!next); setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const on = () => { if (!watched) void toggle(); };
    window.addEventListener("viridia:watch", on);
    return () => window.removeEventListener("viridia:watch", on);
  });

  if (!viewer) {
    return (
      <Link href={`/signup?next=${encodeURIComponent(`/terminal/${symbol}`)}`} className="btn" title="Create a free account to save watchlists">
        <Icon name="watchlist" /> Watch
      </Link>
    );
  }
  return (
    <button className="btn" onClick={toggle} disabled={watched === null} aria-pressed={!!watched} title={err ?? undefined}>
      <Icon name={watched ? "check" : "watchlist"} className={`h-[15px] w-[15px] ${watched ? "text-brand" : ""}`} />
      {watched ? "Watching" : "Watch"}
    </button>
  );
}
