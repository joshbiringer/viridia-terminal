"use client";

import { useState } from "react";
import type { Lesson } from "@/lib/learn/lessons";

/** One multiple-choice question per lesson; the answer and reason show after a pick. */
export function SelfCheck({ c, id }: { c: Lesson["check"]; id: string }) {
  const [pick, setPick] = useState<number | null>(null);
  const done = pick != null;
  return (
    <div className="rounded-[var(--r-md)] border border-line bg-panel-2 p-3" role="group" aria-labelledby={`${id}-q`}>
      <p id={`${id}-q`} className="text-[12.5px] font-medium">Check yourself: {c.q}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {c.options.map((o, i) => {
          const right = i === c.answer;
          const state = !done ? "border-line hover:border-line-2 hover:bg-hover" : right ? "border-[var(--pos)] bg-[var(--pos-bg)]" : i === pick ? "border-[var(--neg)] bg-[var(--neg-bg)]" : "border-line opacity-60";
          return (
            <button key={i} disabled={done} onClick={() => setPick(i)} className={`rounded-[var(--r-sm)] border px-3 py-1.5 text-left text-[12.5px] transition-colors ${state}`}>
              {o}{done && right && <span className="ml-2 text-[11.5px] font-medium text-pos">Correct</span>}
            </button>
          );
        })}
      </div>
      {done && (
        <p className="mt-2 text-[12.5px] leading-snug text-fg-2" aria-live="polite">
          {pick === c.answer ? "" : "Not quite. "}{c.why}
          <button onClick={() => setPick(null)} className="ml-2 text-[12px] text-brand hover:underline">Try again</button>
        </p>
      )}
    </div>
  );
}
