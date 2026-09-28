"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { SettingsRow, SettingsSection } from "../ui/SettingsRow";
import { FormError } from "../auth/AuthForm";

export function DataPrivacy({ email }: { email: string }) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [del, setDel] = useState<{ busy: boolean; err: string | null }>({ busy: false, err: null });

  const exportData = async () => {
    setExporting(true);
    const sb = browserClient();
    const [{ data: user }, profile, prefs, lists, items] = await Promise.all([
      sb.auth.getUser(),
      sb.from("profiles").select("*").maybeSingle(),
      sb.from("user_preferences").select("*").maybeSingle(),
      sb.from("watchlists").select("id, name, created_at"),
      sb.from("watchlist_items").select("watchlist_id, added_at, securities(symbol, name)"),
    ]);
    const blob = new Blob([JSON.stringify({
      exported_at: new Date().toISOString(),
      account: { id: user.user?.id, email: user.user?.email, created_at: user.user?.created_at },
      profile: profile.data, preferences: prefs.data, watchlists: lists.data, watchlist_items: items.data,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `viridia-account-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExporting(false);
  };

  const deleteAccount = async () => {
    setDel({ busy: true, err: null });
    const sb = browserClient();
    const { error } = await sb.rpc("delete_my_account");
    if (error) { setDel({ busy: false, err: error.message }); return; }
    await sb.auth.signOut();
    router.push("/?deleted=1");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="What Viridia stores" description="Nothing beyond what runs your account.">
        <ul className="flex flex-col gap-1.5 text-[13.5px] text-fg-2">
          <li>Your email, name and sign-in details</li>
          <li>Your preferences and notification choices</li>
          <li>Your watchlists</li>
          <li>Product events such as &ldquo;opened an analysis&rdquo;, without IP address or device details</li>
        </ul>
      </SettingsSection>
      <SettingsSection title="Export">
        <SettingsRow label="Download your data" help="A JSON file with your account, preferences and watchlists.">
          <button className="btn" onClick={exportData} aria-busy={exporting}>Download</button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Delete account" description="Permanently deletes your account, preferences and watchlists. This can't be undone.">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px]">Type <b className="font-semibold">delete</b> to confirm deleting <b className="font-medium">{email}</b></span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="field flex-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            <button className="btn danger" onClick={deleteAccount} aria-busy={del.busy} disabled={confirm.trim().toLowerCase() !== "delete"}>Delete account</button>
          </div>
        </label>
        {del.err && <div className="mt-3"><FormError>{del.err}</FormError></div>}
      </SettingsSection>
    </div>
  );
}
