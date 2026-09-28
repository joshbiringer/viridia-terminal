"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { SettingsRow, SettingsSection } from "../ui/SettingsRow";
import { SavedIndicator, useSaved } from "./useSaved";
import { authMessage } from "../auth/AuthForm";

export function ProfileForm({ userId, first, last, email }: { userId: string; first: string; last: string; email: string }) {
  const [f, setF] = useState(first);
  const [l, setL] = useState(last);
  const name = useSaved(async () => browserClient().from("profiles").update({ first_name: f.trim() || null, last_name: l.trim() || null }).eq("id", userId), 600);

  const [newEmail, setNewEmail] = useState("");
  const [emailState, setEmailState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailState({ busy: true, msg: null, ok: false });
    const { error } = await browserClient().auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/account/profile")}` },
    );
    setEmailState(error ? { busy: false, msg: authMessage(error), ok: false } : { busy: false, msg: `Confirm the change from the link we sent to ${newEmail}.`, ok: true });
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Name" description="Shown in your account menu.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-medium">First name</span>
            <input className="field" value={f} maxLength={80} autoComplete="given-name" onChange={(e) => { setF(e.target.value); name.trigger(); }} />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-medium">Last name</span>
            <input className="field" value={l} maxLength={80} autoComplete="family-name" onChange={(e) => { setL(e.target.value); name.trigger(); }} />
          </label>
          <SavedIndicator state={name.state} message={name.message} />
        </div>
      </SettingsSection>

      <SettingsSection title="Email" description="Used to sign in and for account messages.">
        <SettingsRow label={email} help="Your current sign-in email.">
          <span className="chip">Verified</span>
        </SettingsRow>
        <form onSubmit={changeEmail} className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-medium">New email</span>
            <input className="field" type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </label>
          <button className="btn" aria-busy={emailState.busy} disabled={!newEmail || newEmail === email}>Change email</button>
        </form>
        {emailState.msg && <p className={`mt-2 text-[12.5px] ${emailState.ok ? "text-fg-2" : "text-neg"}`}>{emailState.msg}</p>}
      </SettingsSection>

      <SettingsSection title="Photo" description="Your initials are used as your avatar.">
        <p className="text-[13px] text-fg-3">Profile photos aren&apos;t supported yet.</p>
      </SettingsSection>
    </div>
  );
}
