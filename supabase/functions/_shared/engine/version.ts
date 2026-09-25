/** Version stamped on every cached analysis row: a change to any engine stage recomputes the cache. */
import { PIVOT_ALGORITHM_VERSION } from "./pivots.ts";
import { RULES_VERSION } from "./rules.ts";
import { CANDIDATES_VERSION } from "./candidates.ts";
import { FIB_VERSION } from "./fib.ts";

export const ANALYSIS_VERSION = [PIVOT_ALGORITHM_VERSION, RULES_VERSION, CANDIDATES_VERSION, FIB_VERSION].join("+");
