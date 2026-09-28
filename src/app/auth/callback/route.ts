import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/supabase/server";

/**
 * Landing point for links in Supabase Auth emails (confirm sign-up, reset password, change email).
 * Handles both the PKCE `code` flow and the `token_hash` flow, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/terminal";
  const sb = await authClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await sb.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: { message: "This link is missing its sign-in token." } };

  const dest = url.clone();
  dest.search = "";
  if (error) {
    dest.pathname = "/signin";
    dest.searchParams.set("error", "That link has expired or was already used. Sign in, or request a new link.");
    return NextResponse.redirect(dest);
  }
  dest.pathname = next;
  return NextResponse.redirect(dest);
}
