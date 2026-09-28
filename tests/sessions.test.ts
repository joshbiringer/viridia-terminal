import { describe, expect, it } from "vitest";
import { HUBS, hubStatus } from "../src/lib/market-sessions";

const hub = (id: string) => HUBS.find((h) => h.id === id)!;

describe("market hub sessions", () => {
  it("reads New York open mid-session and closed after the bell", () => {
    expect(hubStatus(hub("ny"), new Date("2026-09-28T15:00:00Z")).state).toBe("open");   // 11:00 ET, Monday
    expect(hubStatus(hub("ny"), new Date("2026-09-28T21:00:00Z")).state).toBe("closed"); // 17:00 ET
  });
  it("knows Tokyo's midday break and weekends", () => {
    expect(hubStatus(hub("tokyo"), new Date("2026-09-28T03:00:00Z")).state).toBe("break"); // 12:00 JST
    expect(hubStatus(hub("tokyo"), new Date("2026-09-27T01:00:00Z")).next).toMatch(/Monday/); // Sunday
  });
  it("uses NYSE holidays for U.S. hubs", () => {
    expect(hubStatus(hub("ny"), new Date("2026-11-26T16:00:00Z")).next).toBe("Closed for a holiday");
  });
});
