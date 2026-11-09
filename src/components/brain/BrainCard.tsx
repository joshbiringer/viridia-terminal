import Link from "next/link";
import { brainSignals, getBrain } from "@/lib/brain/server";
import { SIGNAL_TONE, type Component } from "@/lib/brain/signal";

const line = (label: string, c: Component | null) => (
  <div className="flex items-baseline gap-2 text-[12.5px]">
    <span className="w-[84px] shrink-0 text-fg-3">{label}</span>
    {c ? <span className="min-w-0"><span className={`num font-medium ${c.score > 0.1 ? "text-pos" : c.score < -0.1 ? "text-neg" : "text-fg-2"}`}>{c.score > 0 ? "+" : ""}{c.score.toFixed(2)}</span> <span className="text-fg-2">{c.reasons[0]}</span></span> : <span className="text-fg-3">—</span>}
  </div>
);

/** On a security page: the viewer's brain signal for it and the theses behind it. Renders nothing when signed out. */
export async function BrainCard({ symbol }: { symbol: string }) {
  const brain = await getBrain().catch(() => null);
  if (!brain?.signedIn) return null;
  const live = brain.theses.filter((t) => t.status === "active" || t.status === "watching");
  const { signals } = await brainSignals(live, [symbol]).catch(() => ({ signals: [] }));
  const s = signals.find((x) => x.symbol === symbol.toUpperCase());
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="brain-t">
      <header className="flex items-baseline gap-2">
        <h3 id="brain-t" className="card-t">Your brain</h3>
        <Link href="/brain" className="ml-auto text-[12px] text-brand hover:underline">All theses</Link>
      </header>
      {s ? (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-[20px] font-[680]" style={{ color: SIGNAL_TONE[s.label] }}>{s.label}</span>
            <span className="num text-[13px] text-fg-2">{s.score > 0 ? "+" : ""}{s.score.toFixed(2)}</span>
            <span className="text-[12px] text-fg-3">{s.components} of 3 inputs</span>
            {s.conflict && <span className="text-[12px] font-medium" style={{ color: "var(--warn)" }}>your theses disagree</span>}
          </div>
          <div className="flex flex-col gap-1">{line("Your theses", s.thesis)}{line("Value", s.value)}{line("Technicals", s.technical)}</div>
          {s.theses.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-line pt-2">
              {s.theses.map((t) => (
                <li key={t.id} className="text-[12.5px] leading-snug">
                  <span className="font-medium" style={{ color: t.stance === "bullish" ? "var(--pos)" : t.stance === "bearish" ? "var(--neg)" : "var(--text-2)" }}>{t.stance}</span>{" "}
                  <Link href={`/brain#t-${t.id}`} className="text-fg hover:text-brand">{t.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-[12.5px] leading-snug text-fg-3">None of your theses touch {symbol.toUpperCase()} yet. Share research about it with Viridia in chat and it will be filed here.</p>
      )}
      <p className="text-[11px] text-fg-3">Equal thirds of your theses, value and technicals. Research signal, not advice.</p>
    </section>
  );
}
