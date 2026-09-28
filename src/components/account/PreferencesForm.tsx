"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Preferences } from "@/lib/auth";
import { applyTheme } from "@/lib/theme";
import { browserClient } from "@/lib/supabase/client";
import { SettingsRow, SettingsSection } from "../ui/SettingsRow";
import { SavedIndicator, useSaved } from "./useSaved";

type Key = "theme" | "default_timeframe" | "default_degree" | "chart_density" | "landing_page";

const OPTIONS: Record<Key, [string, string][]> = {
  theme: [["light", "Light"], ["dark", "Dark"], ["system", "System"]],
  default_timeframe: [["1h", "1H"], ["4h", "4H"], ["1d", "1D"], ["1w", "1W"], ["1mo", "1M"]],
  default_degree: [["auto", "Auto"], ["primary", "Primary"], ["intermediate", "Intermediate"], ["minor", "Minor"]],
  chart_density: [["comfortable", "Comfortable"], ["compact", "Compact"]],
  landing_page: [["/terminal", "Home"], ["/watchlist", "Watchlist"], ["/markets", "Markets"], ["/scanner", "Wave Scanner"]],
};

/** Segmented control that saves the moment it changes. */
function Choice({ k, value, onChange }: { k: Key; value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {OPTIONS[k].map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function PreferencesForm({ userId, initial }: { userId: string; initial: Preferences }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const pending = useRef<Partial<Preferences>>({});
  const saver = useSaved(async () => {
    const patch = pending.current;
    pending.current = {};
    const r = await browserClient().from("user_preferences").update(patch).eq("user_id", userId);
    router.refresh(); // server components read the new defaults
    return r;
  });
  const set = (k: Key, v: string) => {
    setP((x) => ({ ...x, [k]: v }));
    pending.current = { ...pending.current, [k]: v };
    if (k === "theme") applyTheme(v as Preferences["theme"]);
    saver.trigger();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="-mb-4 flex justify-end"><SavedIndicator state={saver.state} message={saver.message} /></div>
      <SettingsSection title="Appearance">
        <SettingsRow label="Theme" help="System follows your device setting."><Choice k="theme" value={p.theme} onChange={(v) => set("theme", v)} /></SettingsRow>
      </SettingsSection>
      <SettingsSection title="Charts and analysis" description="Defaults for every security page. You can still change them on the page.">
        <SettingsRow label="Default timeframe"><Choice k="default_timeframe" value={p.default_timeframe} onChange={(v) => set("default_timeframe", v)} /></SettingsRow>
        <SettingsRow label="Default wave degree" help="Auto opens the most detailed degree that has counts.">
          <Choice k="default_degree" value={p.default_degree} onChange={(v) => set("default_degree", v)} />
        </SettingsRow>
        <SettingsRow label="Chart density" help="Compact uses a shorter chart so more analysis fits on screen.">
          <Choice k="chart_density" value={p.chart_density} onChange={(v) => set("chart_density", v)} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Navigation">
        <SettingsRow label="Open after sign-in"><Choice k="landing_page" value={p.landing_page} onChange={(v) => set("landing_page", v)} /></SettingsRow>
      </SettingsSection>
    </div>
  );
}
