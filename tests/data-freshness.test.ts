import { describe, expect, it } from "vitest";
import { expectedSession, freshness, sessionsBetween } from "@/lib/data-freshness";

// 2026-11-05 is a Thursday. Eastern is UTC-5 in November.
const at = (iso: string) => new Date(iso);

describe("expectedSession", () => {
  it("is yesterday's session after 00:30 ET", () => {
    expect(expectedSession(at("2026-11-05T13:30:00Z"))).toBe("2026-11-04");
  });
  it("is the session before that just after midnight", () => {
    expect(expectedSession(at("2026-11-05T05:10:00Z"))).toBe("2026-11-03"); // 00:10 ET Thu
  });
  it("skips the weekend", () => {
    expect(expectedSession(at("2026-11-09T15:00:00Z"))).toBe("2026-11-06"); // Monday → Friday
    expect(expectedSession(at("2026-11-08T15:00:00Z"))).toBe("2026-11-06"); // Sunday → Friday
  });
  it("skips NYSE holidays", () => {
    expect(expectedSession(at("2026-11-27T15:00:00Z"))).toBe("2026-11-25"); // Fri after Thanksgiving
  });
});

describe("freshness", () => {
  it("is current when the last session is the published one, and says today isn't included while trading", () => {
    const f = freshness({ last_session: "2026-11-04" }, at("2026-11-05T16:00:00Z")); // 11:00 ET
    expect(f.state).toBe("current");
    expect(f.sessionLive).toBe(true);
    expect(f.label).toBe("Close of Wed, Nov 4");
    expect(f.detail).toMatch(/Today's session isn't included/);
  });
  it("is behind and names the missing sessions", () => {
    const f = freshness({ last_session: "2026-10-30" }, at("2026-11-05T13:30:00Z"));
    expect(f.state).toBe("behind");
    expect(f.missing).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(f.detail).toMatch(/3 sessions/);
    expect(f.detail).toMatch(/prices shown are from Oct 30/);
  });
  it("is unknown without a session", () => {
    expect(freshness(null).state).toBe("unknown");
  });
  it("lists sessions between two dates, excluding weekends", () => {
    expect(sessionsBetween("2026-11-05", "2026-11-09")).toEqual(["2026-11-06", "2026-11-09"]);
  });
});
