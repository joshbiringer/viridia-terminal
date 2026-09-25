import { EXAMPLE } from "@/lib/illustration";
import { IllustrativeChart } from "./IllustrativeChart";
import { ViridiaMark } from "../ViridiaMark";

/** The product as the hero visual: an illustrative stock view on the synthetic example series. */
export function HeroTerminalMock() {
  const rows: [string, React.ReactNode][] = [
    ["Primary trend", <span key="t" className="text-pos">Bullish</span>],
    ["Current structure", "Impulse"],
    ["Current wave", <span key="w" className="text-brand">3</span>],
    ["Pattern confidence", <span key="c" className="num">{EXAMPLE.confidence} / 100</span>],
    ["Invalidation", <span key="i" className="num">{EXAMPLE.invalidation.toFixed(2)}</span>],
    ["Next Fib zone", <span key="f" className="num whitespace-nowrap text-fib">{EXAMPLE.zone.lo.toFixed(2)}–{EXAMPLE.zone.hi.toFixed(2)}</span>],
    ["Higher timeframe", <span key="h" className="text-pos">Bullish</span>],
  ];
  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-panel" style={{ boxShadow: "var(--shadow-lg)" }}>
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <ViridiaMark size={16} className="text-brand" />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">EXAMPLE</span>
        <span className="text-[12.5px] text-fg-3">Illustrative Corp. · Daily</span>
        <span className="ml-auto hidden gap-1 text-[12px] text-fg-3 sm:flex">
          {["1H", "4H", "1D", "1W", "1M"].map((t) => (
            <span key={t} className={`rounded-md px-2 py-0.5 ${t === "1D" ? "bg-hover font-semibold text-fg" : ""}`}>{t}</span>
          ))}
        </span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="px-2 pb-2 pt-3">
          <IllustrativeChart animate className="h-auto w-full" />
        </div>
        <dl className="flex flex-col gap-3.5 border-t border-line px-6 py-6 lg:border-l lg:border-t-0">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">Market structure</div>
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0">
              <dt className="whitespace-nowrap text-[13px] text-fg-3">{k}</dt>
              <dd className="text-[14.5px] font-[600] tracking-[-0.01em]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="border-t border-line bg-bg px-5 py-2.5 text-[12px] text-fg-3">
        Illustrative example on a synthetic price series. It is not an analysis of any real security.
      </div>
    </div>
  );
}
