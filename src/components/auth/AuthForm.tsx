"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";

type Mode = "signin" | "signup";

/** Only same-site paths are honored as a post-sign-in destination. */
export function safeNext(next: string | null, fallback = "/terminal") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Plain-language versions of Supabase Auth errors. */
export function authMessage(e: { message?: string; code?: string } | null): string {
  const m = (e?.message ?? "").toLowerCase();
  if (e?.code === "invalid_credentials" || m.includes("invalid login")) return "That email and password don't match an account.";
  if (e?.code === "email_not_confirmed" || m.includes("not confirmed")) return "Confirm your email first. We sent a link when you signed up.";
  if (e?.code === "user_already_exists" || m.includes("already registered")) return "An account with this email already exists. Sign in instead.";
  if (e?.code === "weak_password" || m.includes("password should")) return "Use a longer password: at least 8 characters.";
  if (m.includes("rate limit") || e?.code === "over_email_send_rate_limit") return "Too many attempts. Wait a minute and try again.";
  if (m.includes("signups not allowed")) return "New sign-ups are paused right now.";
  return e?.message || "Something went wrong. Try again.";
}

export function FormError({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-[var(--r-md)] px-3 py-2 text-[13px] text-neg" style={{ background: "var(--neg-soft)" }}>{children}</p>;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), mode === "signup" ? "/onboarding" : "/terminal");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sent, setSent] = useState(false);

  useEffect(() => { if (mode === "signup") void track("signup_started"); }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const sb = browserClient();
    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/onboarding")}` },
      });
      if (error) { setError(authMessage(error)); setBusy(false); return; }
      // Supabase returns a user with no identities when the email is already registered (and confirmation is on)
      if (data.user && data.user.identities?.length === 0) { setError(authMessage({ code: "user_already_exists" })); setBusy(false); return; }
      void track("signup_completed");
      if (data.session) { router.push("/onboarding"); router.refresh(); return; }
      setSent(true); setBusy(false);
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setError(authMessage(error)); setBusy(false); return; }
    void track("signin_completed");
    // people who never finished onboarding go back to it; otherwise honor ?next, then their landing page
    const { data: prof } = await sb.from("profiles").select("onboarded_at").maybeSingle();
    let dest = next;
    if (!prof?.onboarded_at) dest = "/onboarding";
    else if (!params.get("next")) {
      const { data: pref } = await sb.from("user_preferences").select("landing_page").maybeSingle();
      dest = pref?.landing_page ?? "/terminal";
    }
    router.push(dest);
    router.refresh();
  };

  if (sent) {
    return (
      <div>
        <h1 className="page-title">Check your email</h1>
        <p className="page-desc mt-2">
          We sent a confirmation link to <b className="font-medium text-fg">{email}</b>. Open it to finish creating your account.
        </p>
        <p className="caption mt-6">Wrong address? <button className="font-medium text-brand hover:underline" onClick={() => setSent(false)}>Start over</button></p>
      </div>
    );
  }

  const carry = params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : "";
  return (
    <div>
      <h1 className="page-title">{mode === "signup" ? "Create your account" : "Sign in to Viridia"}</h1>
      <p className="page-desc mt-1.5">
        {mode === "signup" ? "Save watchlists and preferences, and pick up where you left off on any device." : "Welcome back."}
      </p>
      <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Email</span>
          <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between text-[13px] font-medium">
            Password
            {mode === "signin" && <Link href="/forgot-password" className="text-[12.5px] font-normal text-fg-3 hover:text-fg">Forgot password?</Link>}
          </span>
          <input
            className="field" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} aria-describedby={mode === "signup" ? "pw-help" : undefined}
          />
          {mode === "signup" && <span id="pw-help" className="caption">At least 8 characters.</span>}
        </label>
        {error && <FormError>{error}</FormError>}
        <button type="submit" className="btn pri lg mt-1 w-full" aria-busy={busy} disabled={!email || password.length < (mode === "signup" ? 8 : 1)}>
          {mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-[13px] text-fg-2">
        {mode === "signup"
          ? <>Already have an account? <Link href={`/signin${carry}`} className="font-medium text-brand hover:underline">Sign in</Link></>
          : <>New to Viridia? <Link href={`/signup${carry}`} className="font-medium text-brand hover:underline">Create an account</Link></>}
      </p>
      {mode === "signup" && <p className="caption mt-8">Free during the beta. No card required.</p>}
    </div>
  );
}
