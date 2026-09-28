"use client";

import Link from "next/link";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { FormError, authMessage } from "@/components/auth/AuthForm";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const { error } = await browserClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });
    setBusy(false);
    if (error) setError(authMessage(error)); else setSent(true);
  };
  return sent ? (
    <div>
      <h1 className="page-title">Check your email</h1>
      <p className="page-desc mt-2">If an account exists for <b className="font-medium text-fg">{email}</b>, a link to choose a new password is on its way.</p>
      <p className="caption mt-6"><Link href="/signin" className="font-medium text-brand hover:underline">Back to sign in</Link></p>
    </div>
  ) : (
    <div>
      <h1 className="page-title">Reset your password</h1>
      <p className="page-desc mt-1.5">Enter your account email and we&apos;ll send a reset link.</p>
      <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Email</span>
          <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        {error && <FormError>{error}</FormError>}
        <button type="submit" className="btn pri lg w-full" aria-busy={busy} disabled={!email}>Send reset link</button>
      </form>
      <p className="mt-6 text-[13px] text-fg-2"><Link href="/signin" className="font-medium text-brand hover:underline">Back to sign in</Link></p>
    </div>
  );
}
