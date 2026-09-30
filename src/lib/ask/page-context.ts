"use client";
/**
 * What the current page is showing, for Ask Viridia's context resolver. Pages publish selections
 * (the degree, a Fibonacci zone, the open portfolio) with publishContext; each selection is tied to
 * the path it was published on, so it never leaks onto another page.
 */
import type { PageContext } from "./types";

let current: PageContext & { at?: string } = {};
const EVT = "viridia:context";

export function publishContext(patch: PageContext) {
  const at = typeof window !== "undefined" ? window.location.pathname : "";
  current = current.at === at ? { ...current, ...patch, at } : { ...patch, at };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT, { detail: current }));
}
/** Published selections for this path only. */
export function readContext(path: string): PageContext {
  if (current.at !== path) return {};
  const { at, ...rest } = current;
  void at;
  return rest;
}
export function onContext(f: () => void): () => void {
  window.addEventListener(EVT, f);
  return () => window.removeEventListener(EVT, f);
}
