import { describe, expect, it } from "vitest";
import { withTimeout } from "@/lib/timeout";

describe("withTimeout", () => {
  it("passes a fast result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it("rejects a slow one", async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 200)), 20, "slow")).rejects.toThrow("slow timed out after 20 ms");
  });
});
