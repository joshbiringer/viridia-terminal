import { describe, expect, it } from "vitest";
import { LESSONS, SOURCES, sourceOf } from "../src/lib/learn/lessons";
import { route } from "../src/lib/ask/router";
import { findConcept } from "../src/lib/ask/glossary";

describe("Learn lessons", () => {
  it("are complete, unique and credit a known source", () => {
    const ids = new Set<string>();
    for (const l of LESSONS) {
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(sourceOf(l.source)).toBeDefined();
      expect(l.principle.length).toBeGreaterThan(80);
      expect(l.example.length).toBeGreaterThan(80);
      expect(l.recognize.length).toBeGreaterThanOrEqual(2);
      expect(l.wrong.length).toBeGreaterThan(20);
      expect(l.check.answer).toBeGreaterThanOrEqual(0);
      expect(l.check.answer).toBeLessThan(l.check.options.length);
      for (const t of l.tryIt) expect(t.href.startsWith("/")).toBe(true);
    }
    expect(SOURCES.length).toBeGreaterThan(0);
  });
  it("diagram labels point at real path vertices inside the box", () => {
    for (const l of LESSONS) {
      if (!l.diagram) continue;
      for (const [x, y] of l.diagram.path) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(240); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(140); }
      for (const lb of l.diagram.labels ?? []) expect(lb.at).toBeLessThan(l.diagram.path.length);
    }
  });
});

describe("Ask Viridia learns the lesson concepts", () => {
  it("answers zigzag, degree and previous-fourth-wave questions as education with a link to the lesson", () => {
    expect(route("What is a zigzag?").intent).toBe("FINANCIAL_EDUCATION");
    expect(findConcept("what is a zigzag")?.see?.href).toBe("/analysis/learn#zigzag-channel");
    expect(findConcept("explain wave degrees")?.id).toBe("wave_degree");
    expect(findConcept("what is the previous fourth wave")?.id).toBe("previous_fourth");
  });
  it("leaves security questions about a wave alone", () => {
    expect(route("What is QCOM's current wave structure?").intent).toBe("VIRIDIA_STRUCTURE");
    expect(findConcept("what primary wave is NVDA in")).toBeNull();
  });
});
