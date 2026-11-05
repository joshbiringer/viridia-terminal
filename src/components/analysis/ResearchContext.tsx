"use client";

import { createContext, useContext, useState } from "react";
import type { TechnicalPayload } from "@/lib/analysis/technical";

export type CountMode = "preferred" | "alternate";
type Ctx = {
  tech: TechnicalPayload | null; setTech: (t: TechnicalPayload | null) => void;
  countMode: CountMode; setCountMode: (m: CountMode) => void;
};
const ResearchCtx = createContext<Ctx | null>(null);

/**
 * One research state for a security page: the chart publishes the unified technical payload it
 * loaded (Elliott Wave counts, Fibonacci zones, RSI, MACD, divergences, confluence) and the levels
 * rail reads it, so the count shown, its confirmation and invalidation levels and the momentum read
 * always describe the same timeframe, degree and count.
 */
export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [tech, setTech] = useState<TechnicalPayload | null>(null);
  const [countMode, setCountMode] = useState<CountMode>("preferred");
  return <ResearchCtx.Provider value={{ tech, setTech, countMode, setCountMode }}>{children}</ResearchCtx.Provider>;
}

export const useResearch = () => useContext(ResearchCtx);
