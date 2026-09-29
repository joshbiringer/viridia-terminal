import { describe, expect, it } from "vitest";
import { looksLikeQuestion, parseScanQuery } from "../src/lib/command/scan-query";

describe("command bar scanner queries", () => {
  it("maps structure, trend, liquidity and type words to scanner filters", () => {
    const q = parseScanQuery("wave 3 stocks near a fib zone in an uptrend over $100M")!;
    const u = new URL(`https://x${q.href}`);
    expect(u.searchParams.get("s")).toBe("wave3");
    expect(u.searchParams.get("sort")).toBe("zone");
    expect(u.searchParams.get("trend")).toBe("uptrend");
    expect(u.searchParams.get("dv")).toBe("100000000");
    expect(u.searchParams.get("type")).toBe("common");
  });
  it("recognizes corrections, confidence and 52-week extremes", () => {
    expect(parseScanQuery("completed corrections with high confidence")!.href).toMatch(/s=abc_done.*score=70|score=70.*s=abc_done/);
    expect(parseScanQuery("etfs near 52 week highs")!.href).toMatch(/near=high/);
  });
  it("ignores plain searches", () => {
    expect(parseScanQuery("nvidia")).toBeNull();
    expect(parseScanQuery("stocks")).toBeNull();
  });
  it("tells questions from searches", () => {
    expect(looksLikeQuestion("why is NVDA a sell?")).toBe(true);
    expect(looksLikeQuestion("Explain today's market")).toBe(true);
    expect(looksLikeQuestion("AAPL")).toBe(false);
  });
});
