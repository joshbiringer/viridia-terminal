"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { FormError, authMessage } from "@/components/auth/AuthForm";

/** Reached from the reset email (the callback signs the user in first). */
export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const { error } = await browserClient().auth.updateUser({ password });
    if (error) { setError(authMessage(error)); setBusy(false); return; }
    router.push("/account/security?updated=password");
    router.refresh();
  };
  return (
    <div>
      <h1 className="page-title">Choose a new password</h1>
      <p className="page-desc mt-1.5">You&apos;ll stay signed in on this device.</p>
      <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">New password</span>
          <input className="field" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <span className="caption">At least 8 characters.</span>
        </label>
        {error && <FormError>{error}</FormError>}
        <button type="submit" className="btn pri lg w-full" aria-busy={busy} disabled={password.length < 8}>Update password</button>
      </form>
    </div>
  );
}
