import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ browserClient: () => ({}) }));
vi.mock("@/lib/track", () => ({ track: async () => {} }));
const { safeNext, authMessage } = await import("../src/components/auth/AuthForm");

describe("safeNext (post-sign-in redirect)", () => {
  it("keeps same-site paths", () => expect(safeNext("/terminal/NVDA?x=1")).toBe("/terminal/NVDA?x=1"));
  it("rejects protocol-relative and absolute URLs (open-redirect)", () => {
    expect(safeNext("//evil.example")).toBe("/terminal");
    expect(safeNext("https://evil.example")).toBe("/terminal");
    expect(safeNext("javascript:alert(1)")).toBe("/terminal");
  });
  it("falls back when missing", () => expect(safeNext(null, "/onboarding")).toBe("/onboarding"));
});

describe("authMessage", () => {
  it("maps Supabase codes to plain language", () => {
    expect(authMessage({ code: "invalid_credentials" })).toMatch(/don't match/);
    expect(authMessage({ code: "email_not_confirmed" })).toMatch(/Confirm your email/);
    expect(authMessage({ message: "User already registered" })).toMatch(/already exists/);
    expect(authMessage({ code: "weak_password" })).toMatch(/8 characters/);
  });
  it("never returns an empty string", () => expect(authMessage(null)).toBeTruthy());
});
