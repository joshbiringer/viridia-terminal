"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time,
} from "lightweight-charts";
import {
  TIMEFRAMES, chartTime, fmtPrice, fmtVolume, isIntraday,
  type BarRow, type BarsResponse, type ChartTimeframe, type HistoryStatus,
} from "@/lib/market-data/bars";
import { DEGREES, DEGREE_LABEL, PIVOT_ALGORITHM_VERSION, SWING_LABEL, type ClientPivots, type Degree } from "@/lib/analysis/pivots";
import { SourceFooter } from "./SourceFooter";
import type { ConfluenceZone } from "@/lib/analysis/candidates";

type Legend = { o: number; h: number; l: number; c: number; v: number; label: string } | null;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function alpha(hex: string, a: number) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}
function palette() {
  return { fib: css("--fib") || "#5B4FC4", panel: css("--panel"), text: css("--text-3"), grid: css("--hover"), border: css("--border"), pos: css("--pos-chart"), neg: css("--neg"), pivot: css("--neutral") || "#64748B", ink: css("--text-2") };
}

const PLANNED_OVERLAYS = [
  { id: "waves", label: "Waves", color: "var(--wave)", phase: "Wave labels arrive with candidate counts (Phases 4–8)" },
  { id: "channels", label: "Channels", color: "var(--alt)", phase: "Channels arrive with the chart overlays (Phase 8)" },
];

const METHOD: Record<ChartTimeframe, string> = {
  "1h": "Regular-session hours (09:30–16:00 ET) built from 30-minute bars",
  "4h": "Resampled from 1H: 09:30–13:30 and 13:30–16:00 ET",
  "1d": "Daily bars, split-adjusted",
  "1w": "Resampled from daily bars (weeks start Monday)",
  "1mo": "Resampled from daily bars",
};

export function PriceChart({ symbol, zones = [] }: { symbol: string; zones?: ConfluenceZone[] }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barsRef = useRef<BarRow[]>([]);
  const tfRef = useRef<ChartTimeframe>("1d");
  const zigRef = useRef<ISeriesApi<"Line"> | null>(null);
  const pendRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const [tf, setTf] = useState<ChartTimeframe>("1d");
  const [bars, setBars] = useState<BarRow[]>([]);
  const [history, setHistory] = useState<HistoryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<Legend>(null);
  const [pivots, setPivots] = useState<ClientPivots | null>(null);
  const [showPivots, setShowPivots] = useState(true);
  const [showFib, setShowFib] = useState(true);
  const zoneLines = useRef<IPriceLine[]>([]);
  const [degree, setDegree] = useState<Degree>("intermediate");
  const [themeTick, setThemeTick] = useState(0);

  // Create the chart once; re-theme it when the app theme changes.
  useEffect(() => {
    if (!box.current) return;
    const p = palette();
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: p.panel }, textColor: p.text, fontFamily: "Inter, system-ui, sans-serif", fontSize: 11.5, attributionLogo: false },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderColor: p.border, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: p.border, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      // Pin the locale: some environments report tags like "en-US@posix" that Intl rejects.
      localization: { locale: "en-US" },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: p.pos, downColor: p.neg, wickUpColor: p.pos, wickDownColor: p.neg, borderVisible: false,
      priceLineVisible: false,
    });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const lineOpts = { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, lineWidth: 2 as const, color: p.pivot };
    const zig = chart.addSeries(LineSeries, lineOpts);
    const pend = chart.addSeries(LineSeries, { ...lineOpts, lineStyle: LineStyle.Dashed, lineWidth: 1 as const });
    zigRef.current = zig; pendRef.current = pend;
    markersRef.current = createSeriesMarkers(candles, []);
    chart.subscribeCrosshairMove((param) => {
      // The logical index is the bar's position in the data array.
      const bar = param.time === undefined || param.logical === undefined ? undefined : barsRef.current[Math.round(param.logical)];
      setLegend(bar ? { o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume, label: bar.ts } : null);
    });
    chartRef.current = chart; candleRef.current = candles; volRef.current = vol;

    const mo = new MutationObserver(() => {
      const q = palette();
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: q.panel }, textColor: q.text },
        grid: { vertLines: { color: q.grid }, horzLines: { color: q.grid } },
        rightPriceScale: { borderColor: q.border }, timeScale: { borderColor: q.border },
      });
      candles.applyOptions({ upColor: q.pos, downColor: q.neg, wickUpColor: q.pos, wickDownColor: q.neg });
      paintVolume(vol, barsRef.current, tfRef.current);
      setThemeTick((n) => n + 1);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mo.disconnect(); chart.remove(); chartRef.current = null; zigRef.current = null; pendRef.current = null; markersRef.current = null; };
  }, []);

  // Load bars for the selected timeframe; poll while a history fetch is queued.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    let wasQueued = false;
    setLoading(true); setError(null); setLegend(null);

    const load = async () => {
      try {
        const res = await fetch(`/api/bars/${encodeURIComponent(symbol)}?tf=${tf}`, { cache: "no-store" });
        const body = (await res.json()) as BarsResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (cancelled) return;
        setBars(body.bars); setPivots(body.pivots ?? null); setHistory(body.history); setLoading(false);
        if (body.history?.status === "queued" && Date.now() - started < 8 * 60_000) {
          wasQueued = true;
          timer = setTimeout(load, 5_000);
        } else if (wasQueued) {
          router.refresh(); // update the header stats with the newly fetched history
        }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [symbol, tf, router]);

  // Push data into the chart.
  useEffect(() => {
    const chart = chartRef.current, candles = candleRef.current, vol = volRef.current;
    if (!chart || !candles || !vol) return;
    barsRef.current = bars;
    tfRef.current = tf;
    candles.setData(bars.map((b) => ({ time: chartTime(b.ts, tf) as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    paintVolume(vol, bars, tf);
    chart.applyOptions({ timeScale: { timeVisible: isIntraday(tf), secondsVisible: false } });
    chart.timeScale().fitContent();
  }, [bars, tf]);

  // Pivot overlay: a zigzag through confirmed pivots, a dashed leg to the swing still in progress,
  // and HH/HL/LH/LL labels. Pivots come from the engine, computed on exactly these bars.
  useEffect(() => {
    const zig = zigRef.current, pend = pendRef.current, markers = markersRef.current;
    if (!zig || !pend || !markers) return;
    const series = showPivots && bars.length ? pivots?.degrees[degree] : null;
    if (!series) { zig.setData([]); pend.setData([]); markers.setMarkers([]); return; }
    const color = palette().pivot, ink = palette().ink;
    zig.applyOptions({ color }); pend.applyOptions({ color });
    const t = (ts: string) => chartTime(ts, tf) as Time;
    zig.setData(series.pivots.map((p) => ({ time: t(p.ts), value: p.price })));
    const last = series.pivots.at(-1);
    pend.setData(last && series.pending ? [{ time: t(last.ts), value: last.price }, { time: t(series.pending.ts), value: series.pending.price }] : []);
    const labelled = series.pivots.length <= 60; // HH/HL/LH/LL text only where it stays legible
    markers.setMarkers(series.pivots.map((p): SeriesMarker<Time> => ({
      time: t(p.ts), position: p.type === "high" ? "aboveBar" : "belowBar", shape: "circle", size: 0.6,
      color: ink, text: labelled ? p.label : "",
    })));
  }, [pivots, showPivots, degree, bars, tf, themeTick]);

  // Fibonacci confluence zones (engine Phase 6): a solid line at each zone's midpoint and dashed lines
  // at its edges, labeled with the number of relationships that meet there.
  useEffect(() => {
    const candles = candleRef.current;
    if (!candles) return;
    for (const l of zoneLines.current) candles.removePriceLine(l);
    zoneLines.current = [];
    if (!showFib || !bars.length) return;
    const color = palette().fib;
    for (const z of zones) {
      zoneLines.current.push(candles.createPriceLine({ price: z.mid, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Zone ×${z.count}` }));
      if (z.high - z.low > 1e-9) for (const edge of [z.low, z.high])
        zoneLines.current.push(candles.createPriceLine({ price: edge, color: alpha(color, 0.45), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" }));
    }
  }, [zones, showFib, bars, themeTick]);

  const last = bars.at(-1);
  const shown = legend ?? (last ? { o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume, label: last.ts } : null);
  const queued = history?.status === "queued";
  const eta = history?.eta_seconds ? Math.max(1, Math.round(history.eta_seconds / 60)) : null;

  return (
    <section className="card flex flex-col">
      <div className="card-h gap-y-3">
        <div className="flex min-w-0 flex-col">
          <span className="card-t">{symbol} · {TIMEFRAMES.find((t) => t.id === tf)?.label}</span>
          {shown ? (
            <span className="num mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-fg-3">
              <span>O <b className="font-medium text-fg-2">{fmtPrice(shown.o)}</b></span>
              <span>H <b className="font-medium text-fg-2">{fmtPrice(shown.h)}</b></span>
              <span>L <b className="font-medium text-fg-2">{fmtPrice(shown.l)}</b></span>
              <span>C <b className={`font-medium ${shown.c >= shown.o ? "text-pos" : "text-neg"}`}>{fmtPrice(shown.c)}</b></span>
              <span>Vol <b className="font-medium text-fg-2">{fmtVolume(shown.v)}</b></span>
            </span>
          ) : <span className="mt-0.5 text-[12.5px] text-fg-3">Loading bars…</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Overlays">
            {PLANNED_OVERLAYS.map((o) => (
              <button key={o.id} disabled aria-pressed="false" title={o.phase}>
                <span className="h-2 w-2 rounded-[2px]" style={{ background: o.color }} aria-hidden />{o.label}
              </button>
            ))}
            <button aria-pressed={showFib} disabled={!zones.length} onClick={() => setShowFib((v) => !v)} title={zones.length ? "Fibonacci confluence zones (daily analysis)" : "No confluence zones for this security yet"}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--fib)" }} aria-hidden />Fib
            </button>
            <button aria-pressed={showPivots} onClick={() => setShowPivots((v) => !v)} title="Adaptive swing pivots">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--neutral)" }} aria-hidden />Pivots
            </button>
          </div>
          <div className="seg" role="tablist" aria-label="Timeframe">
            {TIMEFRAMES.map((t) => (
              <button key={t.id} role="tab" aria-selected={tf === t.id} onClick={() => setTf(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {showPivots && pivots && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-2.5 text-[12.5px]">
          <div className="seg" role="tablist" aria-label="Pivot degree">
            {DEGREES.map((d) => (
              <button key={d} role="tab" aria-selected={degree === d} onClick={() => setDegree(d)}>{DEGREE_LABEL[d]}</button>
            ))}
          </div>
          <span className="text-fg-2">
            <b className="font-medium text-fg">{SWING_LABEL[pivots.degrees[degree].structure]}</b>
            <span className="text-fg-3"> · {pivots.degrees[degree].pivots.length} confirmed swings</span>
            {pivots.degrees[degree].thresholdPct != null && (
              <span className="num text-fg-3"> · reversal needed {(pivots.degrees[degree].thresholdPct! * 100).toFixed(1)}%</span>
            )}
          </span>
        </div>
      )}

      <div className="relative min-h-[380px] flex-1 sm:min-h-[480px]">
        <div ref={box} className="absolute inset-0" />
        {(loading && !bars.length) && <div className="skel absolute inset-3 z-10" aria-label="Loading chart" />}
        {!loading && !bars.length && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-panel px-6 text-center text-fg-2">
            {error ? (
              <><b className="text-fg">Price data could not load</b><span>{error}</span></>
            ) : queued ? (
              <>
                <b className="text-fg">Fetching {isIntraday(tf) ? "180 days of hourly" : "2 years of daily"} history for {symbol}</b>
                <span>This is the first time anyone opened {symbol} at this timeframe. It should take about {eta ?? 1} minute{eta === 1 ? "" : "s"}; the chart fills in by itself.</span>
              </>
            ) : history?.status === "no_data" ? (
              <><b className="text-fg">No bars available for {symbol}</b><span>Massive returned no trading history in the plan&apos;s window. Newly listed or thinly traded securities can have none.</span></>
            ) : history?.status === "busy" ? (
              <><b className="text-fg">The history queue is full right now</b><span>Try again in a few minutes.</span></>
            ) : (
              <span>No bars yet.</span>
            )}
          </div>
        )}
        {queued && bars.length > 0 && (
          <div className="chip acc absolute left-4 top-4 z-10">Refreshing history, about {eta ?? 1} min</div>
        )}
      </div>

      <SourceFooter
        source="Massive, end of day"
        updated={last ? `Last bar ${new Date(last.ts).toLocaleString("en-US", isIntraday(tf)
          ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }
          : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "—"}
        method={showPivots && pivots ? `${METHOD[tf]} · Pivots: adaptive ZigZag, ${PIVOT_ALGORITHM_VERSION}` : METHOD[tf]}
      />
    </section>
  );
}

function paintVolume(vol: ISeriesApi<"Histogram">, bars: BarRow[], tf: ChartTimeframe) {
  const pos = alpha(css("--pos-chart"), 0.28), neg = alpha(css("--neg"), 0.28);
  vol.setData(bars.map((b) => ({ time: chartTime(b.ts, tf) as Time, value: b.volume, color: b.close >= b.open ? pos : neg })));
}
