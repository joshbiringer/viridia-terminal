"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { SettingsRow, SettingsSection } from "../ui/SettingsRow";
import { FormError, authMessage } from "../auth/AuthForm";

export function SecurityForm({ updated, lastSignIn }: { updated: boolean; lastSignIn: string | null }) {
  const [pw, setPw] = useState("");
  const [pwState, setPwState] = useState<{ busy: boolean; err: string | null; ok: boolean }>({ busy: false, err: null, ok: updated });
  const [others, setOthers] = useState<{ busy: boolean; done: boolean; err: string | null }>({ busy: false, done: false, err: null });

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwState({ busy: true, err: null, ok: false });
    const { error } = await browserClient().auth.updateUser({ password: pw });
    setPwState({ busy: false, err: error ? authMessage(error) : null, ok: !error });
    if (!error) setPw("");
  };
  const signOutOthers = async () => {
    setOthers({ busy: true, done: false, err: null });
    const { error } = await browserClient().auth.signOut({ scope: "others" });
    setOthers({ busy: false, done: !error, err: error ? authMessage(error) : null });
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Password" description="At least 8 characters.">
        <form onSubmit={changePassword} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-medium">New password</span>
            <input className="field" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <button className="btn" aria-busy={pwState.busy} disabled={pw.length < 8}>Update password</button>
        </form>
        {pwState.err && <div className="mt-3"><FormError>{pwState.err}</FormError></div>}
        {pwState.ok && <p className="mt-2 text-[12.5px] text-pos">Password updated ✓</p>}
      </SettingsSection>

      <SettingsSection title="Sessions" description="Devices where you're signed in.">
        <SettingsRow label="This device" help={lastSignIn ? `Signed in ${new Date(lastSignIn).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : undefined}>
          <span className="chip pos">Current</span>
        </SettingsRow>
        <SettingsRow label="Other devices" help="Signs out every other browser and device. This one stays signed in.">
          {others.done ? <span className="text-[12.5px] text-pos">Signed out ✓</span>
            : <button className="btn" onClick={signOutOthers} aria-busy={others.busy}>Sign out other devices</button>}
        </SettingsRow>
        {others.err && <FormError>{others.err}</FormError>}
      </SettingsSection>

      <SettingsSection title="Two-factor authentication">
        <SettingsRow label="Authenticator app" help="A second step at sign-in using an app such as 1Password or Google Authenticator. In development.">
          <span className="text-[13px] text-fg-3">Not available yet</span>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
