"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { publishContext } from "@/lib/ask/page-context";
import type { Degree } from "@/lib/analysis/pivots";
import { useViewer } from "../ViewerProvider";

type Ctx = { degree: Degree; setDegree: (d: Degree) => void };
const DegreeCtx = createContext<Ctx | null>(null);

/**
 * One wave degree for the whole security page: the summary card, the chart's pivots and count overlay,
 * and the candidate list all follow it. Starts at the reader's saved degree, else the degree the
 * engine summarized automatically (intermediate first).
 */
export function DegreeProvider({ auto, children }: { auto: Degree | null; children: React.ReactNode }) {
  const { prefs } = useViewer();
  const saved = prefs?.default_degree && prefs.default_degree !== "auto" ? (prefs.default_degree as Degree) : null;
  const [degree, setDegree] = useState<Degree>(saved ?? auto ?? "intermediate");
  // Ask Viridia reads the selected degree as page context
  useEffect(() => { publishContext({ degree }); }, [degree]);
  return <DegreeCtx.Provider value={{ degree, setDegree }}>{children}</DegreeCtx.Provider>;
}

/** The page's degree, or local state when a component is used outside a DegreeProvider. */
export function useDegree(fallback: Degree): Ctx {
  const ctx = useContext(DegreeCtx);
  const [local, setLocal] = useState<Degree>(fallback);
  return ctx ?? { degree: local, setDegree: setLocal };
}
