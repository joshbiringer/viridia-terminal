"use client";

import { useCallback, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Wraps a save function with visible state for an inline "Saving… / Saved ✓" indicator.
 * Saves are debounced when `delay` > 0 (text fields), immediate otherwise (toggles, selects).
 */
export function useSaved(save: () => Promise<{ error: unknown } | void>, delay = 0) {
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    setState("saving");
    const r = await saveRef.current();
    const err = r && (r as { error: unknown }).error;
    if (err) { setState("error"); setMessage((err as { message?: string }).message ?? "Couldn't save"); return; }
    setState("saved"); setMessage(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  }, []);

  const trigger = useCallback(() => {
    clearTimeout(timer.current);
    if (delay > 0) { setState("saving"); timer.current = setTimeout(flush, delay); } else void flush();
  }, [delay, flush]);

  return { state, message, trigger, flush };
}

export function SavedIndicator({ state, message }: { state: SaveState; message?: string | null }) {
  return (
    <span aria-live="polite" className={`min-w-[64px] text-right text-[12.5px] transition-opacity duration-[var(--t-base)] ${state === "idle" ? "opacity-0" : "opacity-100"} ${state === "error" ? "text-neg" : "text-fg-3"}`}>
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : state === "error" ? message ?? "Couldn't save" : ""}
    </span>
  );
}
