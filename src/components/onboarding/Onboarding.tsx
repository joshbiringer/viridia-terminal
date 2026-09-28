"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SearchHit } from "@/lib/types";
import { browserClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";
import { addToWatchlist } from "@/lib/watchlist";
import { SecuritySearch } from "../SecuritySearch";
import { Icon } from "../Icon";
import { FormError } from "../auth/AuthForm";

export type Suggestion = { id: number; symbol: string; name: string };
type Focus = "stocks" | "etfs" | "both";
type Style = "short_term" | "swing" | "position" | "long_term";

/** Each answer sets a real default; nothing here is asked for its own sake. */
const STYLE: Record<Style, { label: string; help: string; tf: "1h" | "4h" | "1d" | "1w"; degree: "minor" | "intermediate" | "primary"; tfLabel: string }> = {
  short_term: { label: "Short term", help: "Days", tf: "1h", degree: "minor", tfLabel: "1H" },
  swing: { label: "Swing", help: "Days to weeks", tf: "1d", degree: "intermediate", tfLabel: "1D" },
  position: { label: "Position", help: "Weeks to months", tf: "1d", degree: "primary", tfLabel: "1D" },
  long_term: { label: "Long term", help: "Months to years", tf: "1w", degree: "primary", tfLabel: "1W" },
};
const DEGREE_LABEL = { minor: "Minor", intermediate: "Intermediate", primary: "Primary" };

function Option({ selected, onClick, title, help }: { selected: boolean; onClick: () => void; title: string; help?: string }) {
  return (
    <button
      type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-[var(--r-md)] border px-4 py-3 text-left transition-colors duration-[var(--t-fast)] ${
        selected ? "border-brand bg-panel-2" : "border-line bg-panel hover:border-line-2"}`}
    >
      <span>
        <span className="block text-[14px] font-medium">{title}</span>
        {help && <span className="block text-[12.5px] text-fg-3">{help}</span>}
      </span>
      <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${selected ? "border-brand bg-brand" : "border-line-2"}`}>
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
    </button>
  );
}

export function Onboarding({ userId, firstName, stocks, etfs }: { userId: string; firstName: string; stocks: Suggestion[]; etfs: Suggestion[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(firstName);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const [picked, setPicked] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void track("onboarding_started"); }, []);

  const suggested = focus === "etfs" ? etfs : focus === "stocks" ? stocks : [...stocks.slice(0, 5), ...etfs.slice(0, 3)];
  const toggle = (s: Suggestion) => setPicked((p) => (p.some((x) => x.id === s.id) ? p.filter((x) => x.id !== s.id) : [...p, s]));
  const add = (h: SearchHit) => setPicked((p) => (p.some((x) => x.id === h.id) ? p : [...p, { id: h.id, symbol: h.symbol, name: h.name }]));

  const finish = async () => {
    if (!focus || !style) return;
    setBusy(true); setError(null);
    const sb = browserClient();
    try {
      const s = STYLE[style];
      const [p1, p2] = await Promise.all([
        sb.from("profiles").update({ first_name: name.trim() || null, market_focus: focus, trading_style: style, onboarded_at: new Date().toISOString() }).eq("id", userId),
        sb.from("user_preferences").update({ default_timeframe: s.tf, default_degree: s.degree }).eq("user_id", userId),
      ]);
      if (p1.error || p2.error) throw p1.error ?? p2.error;
      for (const x of picked) await addToWatchlist(userId, x.id, x.symbol);
      void track("onboarding_completed", { watched: picked.length, focus, style });
      router.push(picked.length ? `/terminal/${encodeURIComponent(picked[0].symbol)}?welcome=1` : "/terminal?welcome=1");
      router.refresh();
    } catch (e) {
      setError((e as Error).message ?? "Couldn't save. Try again.");
      setBusy(false);
    }
  };

  const steps = ["Markets", "Style", "Watchlist"];
  return (
    <div>
      <ol className="mb-8 flex items-center gap-2 text-[12.5px]" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${i < step ? "bg-brand text-white" : i === step ? "bg-fg text-panel" : "bg-hover text-fg-3"}`}>
              {i < step ? <Icon name="check" className="h-3 w-3" /> : i + 1}
            </span>
            <span className={i === step ? "font-medium" : "text-fg-3"}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line-2" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section>
          <h1 className="page-title">What do you want to analyze?</h1>
          <p className="page-desc mt-1.5">We&apos;ll suggest securities to start with.</p>
          <div role="radiogroup" className="mt-6 grid gap-2 sm:grid-cols-3">
            <Option selected={focus === "stocks"} onClick={() => setFocus("stocks")} title="Stocks" />
            <Option selected={focus === "etfs"} onClick={() => setFocus("etfs")} title="ETFs" />
            <Option selected={focus === "both"} onClick={() => setFocus("both")} title="Both" />
          </div>
          <label className="mt-6 flex max-w-[280px] flex-col gap-1.5">
            <span className="text-[13px] font-medium">First name <span className="font-normal text-fg-3">(optional)</span></span>
            <input className="field" value={name} maxLength={80} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="mt-8 flex justify-end"><button className="btn pri" disabled={!focus} onClick={() => setStep(1)}>Continue</button></div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="page-title">How do you usually analyze markets?</h1>
          <p className="page-desc mt-1.5">This sets the chart timeframe and wave degree Viridia opens with. You can change both anytime.</p>
          <div role="radiogroup" className="mt-6 grid gap-2 sm:grid-cols-2">
            {(Object.keys(STYLE) as Style[]).map((k) => <Option key={k} selected={style === k} onClick={() => setStyle(k)} title={STYLE[k].label} help={STYLE[k].help} />)}
          </div>
          {style && (
            <p className="caption mt-4 text-[12.5px]">
              Charts open on <b className="font-medium text-fg-2">{STYLE[style].tfLabel}</b>; wave counts open at <b className="font-medium text-fg-2">{DEGREE_LABEL[STYLE[style].degree]}</b> degree.
            </p>
          )}
          <div className="mt-8 flex justify-between"><button className="btn ghost" onClick={() => setStep(0)}>Back</button><button className="btn pri" disabled={!style} onClick={() => setStep(2)}>Continue</button></div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="page-title">Build your first watchlist</h1>
          <p className="page-desc mt-1.5">Pick a few you follow. Your watchlist shows each one&apos;s trend, swing structure and Fibonacci zones at a glance.</p>
          <div className="mt-6"><SecuritySearch onPick={add} exclude={picked.map((p) => p.id)} autoFocus /></div>
          {suggested.length > 0 && (
            <div className="mt-5">
              <div className="caption mb-2">Most actively traded today</div>
              <div className="flex flex-wrap gap-2">
                {suggested.map((s) => {
                  const on = picked.some((p) => p.id === s.id);
                  return (
                    <button
                      key={s.id} onClick={() => toggle(s)} aria-pressed={on} title={s.name}
                      className={`flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border px-3 text-[13px] font-medium transition-colors duration-[var(--t-fast)] ${
                        on ? "border-brand bg-panel-2 text-fg" : "border-line bg-panel text-fg-2 hover:border-line-2 hover:text-fg"}`}
                    >
                      {on ? <Icon name="check" className="h-3.5 w-3.5 text-brand" /> : <Icon name="plus" className="h-3.5 w-3.5 text-fg-3" />}{s.symbol}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {picked.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <div className="caption mb-2">Your watchlist · {picked.length}</div>
              <ul className="flex flex-col divide-y divide-line">
                {picked.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2 text-[13.5px]">
                    <span className="tk w-14">{p.symbol}</span><span className="min-w-0 flex-1 truncate text-fg-2">{p.name}</span>
                    <button className="btn ghost sm px-2" aria-label={`Remove ${p.symbol}`} onClick={() => toggle(p)}><Icon name="x" className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <div className="mt-4"><FormError>{error}</FormError></div>}
          <div className="mt-8 flex items-center justify-between">
            <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn pri" onClick={finish} aria-busy={busy}>{picked.length ? `Open ${picked[0].symbol}` : "Open Viridia"}</button>
          </div>
        </section>
      )}
    </div>
  );
}
