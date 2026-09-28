"use client";

import { useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { SettingsRow, SettingsSection } from "../ui/SettingsRow";
import { SavedIndicator, useSaved } from "./useSaved";

/** Only events Viridia's engine can actually detect are offered. */
const MARKET: [string, string, string][] = [
  ["wave_change", "Wave structure changes", "A watched security's candidate counts change, or its latest count completes."],
  ["zone_reached", "Fibonacci zone reached", "Price trades into a confluence zone on a watched security."],
  ["invalidation", "Invalidation triggered", "Price crosses the level that breaks a count you're following."],
  ["target_reached", "Target reached", "Price reaches a Fibonacci target for the wave in progress."],
];

export function NotificationsForm({ userId, initial }: { userId: string; initial: Record<string, boolean> }) {
  const [n, setN] = useState<Record<string, boolean>>(initial);
  const latest = useRef(initial);
  const saver = useSaved(async () => browserClient().from("user_preferences").update({ notifications: latest.current }).eq("user_id", userId));
  const toggle = (k: string, v: boolean) => {
    const next = { ...latest.current, [k]: v };
    latest.current = next;
    setN(next);
    saver.trigger();
  };
  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-[var(--r-md)] border border-line bg-panel-2 px-4 py-3 text-[13px] text-fg-2">
        Alerts are in development. Your choices are saved now and take effect when delivery launches. Nothing is sent yet.
      </div>
      <SettingsSection title="Market alerts" description="For securities on your watchlists, by email.">
        <div className="-mt-2 mb-1 flex justify-end"><SavedIndicator state={saver.state} message={saver.message} /></div>
        {MARKET.map(([k, label, help]) => (
          <SettingsRow key={k} label={label} help={help} htmlFor={`n-${k}`}>
            <input id={`n-${k}`} type="checkbox" className="switch" checked={!!n[k]} onChange={(e) => toggle(k, e.target.checked)} />
          </SettingsRow>
        ))}
      </SettingsSection>
      <SettingsSection title="Account" description="Required for your account's security.">
        <SettingsRow label="Security and sign-in emails" help="Email confirmation, password resets and email changes. These are always sent.">
          <input type="checkbox" className="switch" checked disabled aria-label="Security emails are always on" />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
