"use client";

import { useEffect } from "react";
import { track, type ProductEvent } from "@/lib/track";

/** Records one funnel event when a page mounts. Renders nothing. */
export function TrackEvent({ event, props }: { event: ProductEvent; props?: Record<string, string | number | boolean> }) {
  const key = JSON.stringify(props ?? {});
  useEffect(() => { void track(event, JSON.parse(key)); }, [event, key]);
  return null;
}
