import { describe, expect, it } from "vitest";
import { subsolarPoint, sunElevation } from "@/lib/sun";

describe("subsolarPoint", () => {
  it("sits on the equator near Greenwich at the March equinox noon", () => {
    const s = subsolarPoint(new Date("2026-03-20T12:07:00Z"));
    expect(Math.abs(s.lat)).toBeLessThan(0.5);
    expect(Math.abs(s.lon)).toBeLessThan(3); // equation of time is about −7 min
  });

  it("reaches the Tropic of Cancer at the June solstice", () => {
    expect(subsolarPoint(new Date("2026-06-21T12:00:00Z")).lat).toBeCloseTo(23.44, 0);
  });

  it("reaches the Tropic of Capricorn at the December solstice", () => {
    expect(subsolarPoint(new Date("2026-12-21T12:00:00Z")).lat).toBeCloseTo(-23.44, 0);
  });

  it("moves west 15 degrees per hour", () => {
    const a = subsolarPoint(new Date("2026-10-22T12:00:00Z")), b = subsolarPoint(new Date("2026-10-22T13:00:00Z"));
    expect(((a.lon - b.lon + 360) % 360)).toBeCloseTo(15, 0);
  });

  it("is daytime in New York at 2pm Eastern and night in Tokyo", () => {
    const s = subsolarPoint(new Date("2026-10-22T18:00:00Z"));
    expect(sunElevation(40.71, -74.01, s)).toBeGreaterThan(0.3);
    expect(sunElevation(35.68, 139.77, s)).toBeLessThan(0);
  });
});
