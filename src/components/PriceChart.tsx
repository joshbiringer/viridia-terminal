"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { fetchJson } from "@/lib/http";
import type { ClientCandidates, ConfluenceZone } from "@/lib/analysis/candidates";
import type { TechnicalPayload } from "@/lib/analysis/technical";
import { DIVERGENCE_LABEL, type Divergence } from "@engine/momentum";
import { ConfluencePanel } from "./analysis/ConfluencePanel";
import { useViewer } from "./ViewerProvider";
import { useDegree } from "./analysis/DegreeContext";

type Legend = { o: number; h: number; l: number; c: number; v: number; label: string; rsi: number | null; macd: number | null; signal: number | null; hist: number | null } | null;
/** The wave count drawn on the chart, from the technical payload (any timeframe) or the stored daily analysis. */
type DrawCount = { points: { ts: string; price: number; label: string }[]; direction: "up" | "down"; hold: number | null };

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function alpha(hex: string, a: number) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}
function palette() {
  return { fib: css("--fib") || "#5B4FC4", panel: css("--panel"), text: css("--text-3"), grid: css("--hover"), border: css("--border"), pos: css("--pos-chart"), neg: css("--neg"), pivot: css("--neutral") || "#64748B", ink: css("--text-2"), wave: css("--brand") || "#176B4D", warn: css("--warn") || "#B7791F" };
}


const METHOD: Record<ChartTimeframe, string> = {
  "1h": "Regular-session hours (09:30–16:00 ET) built from 30-minute bars",
  "4h": "Resampled from 1H: 09:30–13:30 and 13:30–16:00 ET",
  "1d": "Daily bars, split-adjusted",
  "1w": "Resampled from daily bars (weeks start Monday)",
  "1mo": "Resampled from daily bars",
};

/** Whether wave point i of a count is a swing high (odd legs move with the pattern). */
const isHigh = (i: number, dir: "up" | "down") => (i % 2 === 1) === (dir === "up");

export function PriceChart({ symbol, zones: storedZones = [], counts = null }: { symbol: string; zones?: ConfluenceZone[]; counts?: ClientCandidates | null }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barsRef = useRef<BarRow[]>([]);
  const tfRef = useRef<ChartTimeframe>("1d");
  const zigRef = useRef<ISeriesApi<"Line"> | null>(null);
  const pendRef = useRef<ISeriesApi<"Line"> | null>(null);
  const countRef = useRef<ISeriesApi<"Line"> | null>(null);
  const holdLine = useRef<IPriceLine | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // indicator panes (RSI, MACD) and their overlays
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sigRef = useRef<ISeriesApi<"Line"> | null>(null);
  const histRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const rsiMarks = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const macdMarks = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const divLines = useRef<ISeriesApi<"Line">[]>([]);
  const scenarioLines = useRef<IPriceLine[]>([]);
  const techRef = useRef<TechnicalPayload | null>(null);

  const { prefs } = useViewer();
  const [tf, setTf] = useState<ChartTimeframe>((prefs?.default_timeframe as ChartTimeframe) ?? "1d");
  const compact = prefs?.chart_density === "compact";
  // the command palette can change the timeframe (⌘K → "Chart timeframe: 1W")
  useEffect(() => {
    const on = (e: Event) => { const v = (e as CustomEvent<string>).detail; if (TIMEFRAMES.some((t) => t.id === v)) setTf(v as ChartTimeframe); };
    window.addEventListener("viridia:set-timeframe", on);
    return () => window.removeEventListener("viridia:set-timeframe", on);
  }, []);
  const [bars, setBars] = useState<BarRow[]>([]);
  const [history, setHistory] = useState<HistoryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [oldBar, setOldBar] = useState(false);
  const [legend, setLegend] = useState<Legend>(null);
  const [pivots, setPivots] = useState<ClientPivots | null>(null);
  const [tech, setTech] = useState<TechnicalPayload | null>(null);
  // zones computed for this timeframe when available, else the stored daily ones
  const zones = useMemo(() => tech?.zones ?? (tf === "1d" ? storedZones : []), [tech, tf, storedZones]);
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(true);
  const [showDiv, setShowDiv] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [showCross, setShowCross] = useState(true);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [countMode, setCountMode] = useState<"preferred" | "alternate">("preferred");
  // selections belong to one symbol, timeframe and degree; they clear themselves when any changes
  const [scenarioSel, setScenarioSel] = useState<{ scope: string; key: string | null }>({ scope: "", key: null });
  const [divSel, setDivSel] = useState<{ scope: string; key: string | null }>({ scope: "", key: null });
  const [showPivots, setShowPivots] = useState(true);
  const [showFib, setShowFib] = useState(true);
  const zoneLines = useRef<IPriceLine[]>([]);
  const { degree, setDegree } = useDegree((prefs?.default_degree && prefs.default_degree !== "auto" ? prefs.default_degree : "intermediate") as Degree);
  const [showCount, setShowCount] = useState(true);
  // The count drawn on the chart: from the unified technical payload for this timeframe (any timeframe),
  // falling back to the stored daily analysis. Preferred (ranked first) or the alternate.
  const stored = counts?.[degree]?.candidates[0]?.score != null ? counts[degree].candidates[0] : null;
  const preferred: DrawCount | null = useMemo(() => {
    const w = tech?.waves[degree]?.[countMode];
    if (w) return { points: w.points, direction: w.direction, hold: w.next.hold };
    if (tech || tf !== "1d" || !stored || countMode === "alternate") return null;
    return { points: stored.points, direction: stored.direction, hold: stored.next.hold ?? stored.invalidation ?? null };
  }, [tech, degree, countMode, tf, stored]);
  const hasAlternate = !!tech?.waves[degree]?.alternate;
  const scope = `${symbol}|${tf}|${degree}`;
  const scenarioKey = scenarioSel.scope === scope ? scenarioSel.key : null;
  const divKey = divSel.scope === scope ? divSel.key : null;
  const setScenarioKey = (key: string | null) => setScenarioSel({ scope, key });
  const setDivKey = (key: string | null) => setDivSel({ scope, key });
  const countOn = showCount && !!preferred;
  const [themeTick, setThemeTick] = useState(0);

  // Create the chart once; re-theme it when the app theme changes.
  useEffect(() => {
    if (!box.current) return;
    const p = palette();
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: p.panel }, textColor: p.text, fontFamily: "\"Geist Variable\", Geist, system-ui, sans-serif", fontSize: 11.5, attributionLogo: false },
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
    const count = chart.addSeries(LineSeries, { ...lineOpts, color: p.wave, lineWidth: 2 as const });
    zigRef.current = zig; pendRef.current = pend; countRef.current = count;
    markersRef.current = createSeriesMarkers(candles, []);
    chart.subscribeCrosshairMove((param) => {
      // The logical index is the bar's position in the data array.
      const bar = param.time === undefined || param.logical === undefined ? undefined : barsRef.current[Math.round(param.logical)];
      const i = param.logical === undefined ? -1 : Math.round(param.logical);
      const t = techRef.current;
      setLegend(bar ? { o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume, label: bar.ts,
        rsi: t?.series.rsi[i] ?? null, macd: t?.series.macd[i] ?? null, signal: t?.series.signal[i] ?? null, hist: t?.series.hist[i] ?? null } : null);
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
    return () => {
      mo.disconnect(); chart.remove(); chartRef.current = null; zigRef.current = null; pendRef.current = null; countRef.current = null; markersRef.current = null;
      // series belong to the removed chart: forget them so the next chart doesn't try to remove them
      rsiRef.current = null; macdRef.current = null; sigRef.current = null; histRef.current = null;
      rsiMarks.current = null; macdMarks.current = null; divLines.current = []; scenarioLines.current = []; zoneLines.current = []; holdLine.current = null;
    };
  }, []);

  // Load bars for the selected timeframe; poll while a history fetch is queued.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    let wasQueued = false;
    setLoading(true); setError(null); setLegend(null);

    const load = async () => {
      const r = await fetchJson<BarsResponse>(`/api/bars/${encodeURIComponent(symbol)}?tf=${tf}`, {
        validate: isBarsResponse, init: { cache: "no-store" }, timeoutMs: 15_000, retries: 2, cacheKey: `viridia.bars.${symbol}.${tf}`,
      });
      if (cancelled) return;
      if (!r.ok) {
        setError(r.status === 404 ? `No price data for ${symbol}.` : "The price service didn't respond. It may be busy; try again in a minute.");
        setLoading(false);
        return;
      }
      const body = r.data;
      setStaleSince(r.stale ? r.savedAt : null);
      setBars(body.bars); setPivots(body.pivots ?? null); setTech(body.technical ?? null); setHistory(body.history); setLoading(false);
      const lastTs = body.bars.at(-1)?.ts;
      setOldBar(!isIntraday(tf) && !!lastTs && Date.now() - Date.parse(lastTs) > 6 * 864e5);
      if (!r.stale && body.history?.status === "queued" && Date.now() - started < 8 * 60_000) {
        wasQueued = true;
        timer = setTimeout(load, 5_000);
      } else if (wasQueued) {
        router.refresh(); // update the header stats with the newly fetched history
      }
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [symbol, tf, router, attempt]);

  // Push data into the chart.
  useEffect(() => {
    const chart = chartRef.current, candles = candleRef.current, vol = volRef.current;
    if (!chart || !candles || !vol) return;
    barsRef.current = bars;
    tfRef.current = tf;
    techRef.current = tech;
    candles.setData(bars.map((b) => ({ time: chartTime(b.ts, tf) as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    paintVolume(vol, bars, tf);
    chart.applyOptions({ timeScale: { timeVisible: isIntraday(tf), secondsVisible: false } });
    chart.timeScale().fitContent();
  }, [bars, tf, tech]);

  // Indicator panes: RSI in one pane, MACD in another, under the price pane on the same time scale,
  // so crosshair and zoom stay in sync. Panes are created and removed with their toggles.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const p = palette();
    for (const r of [rsiRef, macdRef, sigRef, histRef]) { if (r.current) { chart.removeSeries(r.current); r.current = null; } }
    rsiMarks.current = null; macdMarks.current = null;
    const base = { lastValueVisible: true, priceLineVisible: false, crosshairMarkerVisible: true };
    let pane = 1;
    if (showRsi) {
      const rsi = chart.addSeries(LineSeries, { ...base, color: p.fib, lineWidth: 2, priceFormat: { type: "price", precision: 1, minMove: 0.1 }, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) }, pane);
      for (const [lvl, style] of [[70, LineStyle.Dashed], [50, LineStyle.Dotted], [30, LineStyle.Dashed]] as const)
        rsi.createPriceLine({ price: lvl, color: lvl === 50 ? alpha(p.pivot, 0.6) : lvl === 70 ? alpha(p.neg, 0.7) : alpha(p.pos, 0.8), lineWidth: 1, lineStyle: style, axisLabelVisible: true, title: "" });
      rsiRef.current = rsi;
      rsiMarks.current = createSeriesMarkers(rsi, []);
      pane++;
    }
    if (showMacd) {
      const hist = chart.addSeries(HistogramSeries, { lastValueVisible: false, priceLineVisible: false, priceFormat: { type: "price", precision: 3, minMove: 0.001 } }, pane);
      const m = chart.addSeries(LineSeries, { ...base, color: p.wave, lineWidth: 2, priceFormat: { type: "price", precision: 3, minMove: 0.001 } }, pane);
      const sg = chart.addSeries(LineSeries, { ...base, color: p.warn, lineWidth: 1, priceFormat: { type: "price", precision: 3, minMove: 0.001 } }, pane);
      m.createPriceLine({ price: 0, color: alpha(p.pivot, 0.6), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      histRef.current = hist; macdRef.current = m; sigRef.current = sg;
      macdMarks.current = createSeriesMarkers(m, []);
    }
    const panes = chart.panes();
    panes.forEach((pn, i) => pn.setStretchFactor(i === 0 ? 3 : 1));
  }, [showRsi, showMacd, themeTick]);

  // Indicator data and crossover markers.
  useEffect(() => {
    const p = palette();
    const t = (ts: string) => chartTime(ts, tf) as Time;
    const ok = tech && tech.series.rsi.length === bars.length;
    const line = (vals: (number | null)[]) => bars.map((b, i) => (vals[i] == null ? { time: t(b.ts) } : { time: t(b.ts), value: vals[i]! }));
    rsiRef.current?.setData(ok ? line(tech!.series.rsi) : []);
    macdRef.current?.setData(ok ? line(tech!.series.macd) : []);
    sigRef.current?.setData(ok ? line(tech!.series.signal) : []);
    histRef.current?.setData(ok ? bars.map((b, i) => {
      const v = tech!.series.hist[i], prev = tech!.series.hist[i - 1];
      if (v == null) return { time: t(b.ts) };
      const growing = prev == null || Math.abs(v) >= Math.abs(prev);
      return { time: t(b.ts), value: v, color: v >= 0 ? alpha(p.pos, growing ? 0.75 : 0.4) : alpha(p.neg, growing ? 0.75 : 0.4) };
    }) : []);
    const crosses = ok && showCross ? tech!.crossovers.filter((c) => !confirmedOnly || c.status === "confirmed") : [];
    const mk = (kinds: string[]) => crosses.filter((c) => kinds.includes(c.kind)).slice(-40).map((c): SeriesMarker<Time> => ({
      time: t(c.ts), position: c.direction === "bullish" ? "belowBar" : "aboveBar", shape: c.direction === "bullish" ? "arrowUp" : "arrowDown",
      color: c.direction === "bullish" ? p.pos : p.neg, size: 0.7, text: "",
    }));
    macdMarks.current?.setMarkers(mk(["macd_signal_up", "macd_signal_down"]));
    rsiMarks.current?.setMarkers(mk(["rsi_30_up", "rsi_70_down"]));
  }, [tech, bars, tf, showCross, confirmedOnly, showRsi, showMacd, themeTick]);

  // Divergence lines: on the price pane between the two price pivots, and on the indicator's pane
  // between the matching indicator extremes, at their actual timestamps.
  const visibleDivs = useMemo<Divergence[]>(() => {
    if (!tech || !showDiv) return [];
    return tech.divergences
      .filter((d) => d.indicator !== "hist" && (showHidden || d.type.startsWith("regular")) && (!confirmedOnly || d.status === "confirmed"))
      .filter((d) => (d.indicator === "rsi" ? showRsi : showMacd) || d.id === divKey)
      .sort((a, b) => a.confirmedIndex - b.confirmedIndex).slice(-12);
  }, [tech, showDiv, showHidden, confirmedOnly, showRsi, showMacd, divKey]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of divLines.current) chart.removeSeries(s);
    divLines.current = [];
    if (!bars.length) return;
    const p = palette();
    const t = (ts: string) => chartTime(ts, tf) as Time;
    const paneOf = (ind: Divergence["indicator"]) => (ind === "rsi" ? 1 : showRsi ? 2 : 1);
    for (const d of visibleDivs) {
      const on = d.id === divKey, dim = !!divKey && !on;
      const color = alpha(d.direction === "bullish" ? p.pos : p.neg, dim ? 0.3 : 0.95);
      const opts = { color, lineWidth: (on ? 3 : 2) as 2 | 3, lineStyle: d.type.startsWith("hidden") ? LineStyle.Dashed : d.status === "developing" ? LineStyle.Dotted : LineStyle.Solid,
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: true };
      const a = chart.addSeries(LineSeries, opts, 0);
      a.setData([{ time: t(d.first.ts), value: d.first.price }, { time: t(d.second.ts), value: d.second.price }]);
      divLines.current.push(a);
      if (d.indicator === "rsi" ? showRsi : showMacd) {
        const b = chart.addSeries(LineSeries, opts, paneOf(d.indicator));
        b.setData([{ time: t(d.first.valueTs), value: d.first.value }, { time: t(d.second.valueTs), value: d.second.value }]);
        divLines.current.push(b);
      }
    }
  }, [visibleDivs, divKey, bars, tf, showRsi, showMacd, themeTick]);

  // The selected scenario's levels: confirmation, invalidation, Fibonacci zone and targets.
  useEffect(() => {
    const candles = candleRef.current;
    if (!candles) return;
    for (const l of scenarioLines.current) candles.removePriceLine(l);
    scenarioLines.current = [];
    const s = scenarioKey ? tech?.confluence[degree].scenarios.find((x) => `${x.id}:${x.direction}` === scenarioKey) : null;
    if (!s) return;
    const p = palette();
    const add = (price: number, color: string, title: string, style: LineStyle = LineStyle.Dashed) =>
      scenarioLines.current.push(candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    if (s.confirmation) add(s.confirmation.price, p.wave, "Confirm", LineStyle.Solid);
    if (s.invalidation) add(s.invalidation.price, p.neg, "Invalidate", LineStyle.Solid);
    if (s.fibZone) { add(s.fibZone.low, alpha(p.fib, 0.7), "Fib zone"); add(s.fibZone.high, alpha(p.fib, 0.7), ""); }
    s.targets.slice(0, 3).forEach((x, i) => add(x.price, alpha(p.ink, 0.7), `T${i + 1}`, LineStyle.Dotted));
  }, [scenarioKey, tech, degree, themeTick]);
  // Pivot overlay: a zigzag through confirmed pivots, a dashed leg to the swing still in progress,
  // and HH/HL/LH/LL labels. Pivots come from the engine, computed on exactly these bars.
  // Preferred wave count (Phase 7): a line through its labeled points with the wave numbers, and its
  // invalidation level. Pivots draw underneath; where both mark the same bar, the wave label wins.
  useEffect(() => {
    const zig = zigRef.current, pend = pendRef.current, markers = markersRef.current, count = countRef.current, candles = candleRef.current;
    if (!zig || !pend || !markers || !count || !candles) return;
    const pal = palette();
    const t = (ts: string) => chartTime(ts, tf) as Time;
    const out: SeriesMarker<Time>[] = [];
    const taken = new Set<string>();

    if (holdLine.current) { candles.removePriceLine(holdLine.current); holdLine.current = null; }
    if (countOn && bars.length && preferred) {
      count.applyOptions({ color: pal.wave });
      count.setData(preferred.points.map((p) => ({ time: t(p.ts), value: p.price })));
      preferred.points.forEach((p, i) => {
        taken.add(p.ts);
        const high = isHigh(i, preferred.direction);
        out.push({ time: t(p.ts), position: high ? "aboveBar" : "belowBar", shape: high ? "arrowDown" : "arrowUp", size: 0.8,
          color: pal.wave, text: i === 0 ? "" : p.label });
      });
      if (preferred.hold != null) {
        holdLine.current = candles.createPriceLine({
          price: preferred.hold, color: pal.neg, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: "Invalidation",
        });
      }
    } else count.setData([]);

    const series = showPivots && bars.length ? pivots?.degrees[degree] : null;
    if (series) {
      zig.applyOptions({ color: pal.pivot }); pend.applyOptions({ color: pal.pivot });
      zig.setData(series.pivots.map((p) => ({ time: t(p.ts), value: p.price })));
      const last = series.pivots.at(-1);
      pend.setData(last && series.pending ? [{ time: t(last.ts), value: last.price }, { time: t(series.pending.ts), value: series.pending.price }] : []);
      const labelled = series.pivots.length <= 60 && !countOn; // HH/HL/LH/LL text only where it stays legible
      for (const p of series.pivots) {
        if (taken.has(p.ts)) continue;
        out.push({ time: t(p.ts), position: p.type === "high" ? "aboveBar" : "belowBar", shape: "circle", size: 0.6, color: pal.ink, text: labelled ? p.label : "" });
      }
    } else { zig.setData([]); pend.setData([]); }
    // markers must be in time order
    markers.setMarkers(out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)));
  }, [pivots, showPivots, degree, bars, tf, themeTick, countOn, preferred]);

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
  const li = bars.length - 1;
  const shown = legend ?? (last ? { o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume, label: last.ts,
    rsi: tech?.series.rsi[li] ?? null, macd: tech?.series.macd[li] ?? null, signal: tech?.series.signal[li] ?? null, hist: tech?.series.hist[li] ?? null } : null);
  const panesOn = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);
  const selDiv = divKey ? tech?.divergences.find((d) => d.id === divKey) : null;
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
              {showRsi && shown.rsi != null && <span>RSI <b className="font-medium" style={{ color: "var(--fib)" }}>{shown.rsi.toFixed(1)}</b></span>}
              {showMacd && shown.macd != null && <span>MACD <b className="font-medium text-fg-2">{shown.macd.toPrecision(3)}</b> / <b className="font-medium" style={{ color: "var(--warn)" }}>{shown.signal?.toPrecision(3) ?? "—"}</b></span>}
            </span>
          ) : <span className="mt-0.5 text-[12.5px] text-fg-3">Loading bars…</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Overlays">
            <button aria-pressed={showFib} disabled={!zones.length} onClick={() => setShowFib((v) => !v)} title={zones.length ? "Fibonacci confluence zones for this timeframe" : "No confluence zones on this timeframe"}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--fib)" }} aria-hidden />Fib
            </button>
            <button aria-pressed={countOn} disabled={!preferred} onClick={() => setShowCount((v) => !v)}
              title={!preferred ? "No ranked wave count at this degree on this timeframe" : "Wave count and its invalidation level"}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--wave)" }} aria-hidden />Count
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-2.5 text-[12.5px]">
        <div className="seg max-w-full overflow-x-auto" role="group" aria-label="Indicator panes">
          <button aria-pressed={showRsi} onClick={() => setShowRsi((v) => !v)} title="RSI(14), Wilder smoothing, with 30/50/70">RSI</button>
          <button aria-pressed={showMacd} onClick={() => setShowMacd((v) => !v)} title="MACD(12,26,9): line, signal and histogram">MACD</button>
        </div>
        <div className="seg max-w-full overflow-x-auto" role="group" aria-label="Signals">
          <button aria-pressed={showDiv} onClick={() => setShowDiv((v) => !v)} title="Regular divergences between price and RSI/MACD">Divergences</button>
          <button aria-pressed={showHidden} disabled={!showDiv} onClick={() => setShowHidden((v) => !v)} title="Hidden (continuation) divergences, drawn dashed">Hidden</button>
          <button aria-pressed={showCross} onClick={() => setShowCross((v) => !v)} title="MACD signal-line and RSI 30/70 crossovers">Crossovers</button>
          <button aria-pressed={confirmedOnly} onClick={() => setConfirmedOnly((v) => !v)} title="Hide developing signals (built on a swing or bar that can still change)">Confirmed only</button>
        </div>
        <div className="seg max-w-full overflow-x-auto" role="tablist" aria-label="Wave count">
          <button role="tab" aria-selected={countMode === "preferred"} onClick={() => setCountMode("preferred")}>Preferred</button>
          <button role="tab" aria-selected={countMode === "alternate"} disabled={!hasAlternate} onClick={() => setCountMode("alternate")} title={hasAlternate ? "The best-ranked count that tells a different story" : "No alternate count at this degree"}>Alternate</button>
        </div>
        {selDiv && (
          <span className="text-fg-2">
            <b className="font-medium" style={{ color: selDiv.direction === "bullish" ? "var(--pos)" : "var(--neg)" }}>{DIVERGENCE_LABEL[selDiv.type]}</b>
            <span className="text-fg-3"> · {selDiv.indicator.toUpperCase()} · {selDiv.first.ts.slice(0, 10)} → {selDiv.second.ts.slice(0, 10)} · {selDiv.status === "developing" ? "developing" : `confirmed ${selDiv.confirmedTs.slice(0, 10)}`}</span>
          </span>
        )}
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

      <div className="relative flex-1" style={{ minHeight: (compact ? 360 : 480) + panesOn * (compact ? 120 : 150) }}>
        <div ref={box} className="absolute inset-0" />
        {(loading && !bars.length) && <div className="skel absolute inset-3 z-10" aria-label="Loading chart" />}
        {!loading && !bars.length && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-panel px-6 text-center text-fg-2">
            {error ? (
              <>
                <b className="text-fg">The chart couldn&apos;t load</b><span>{error}</span>
                <button className="btn sm mt-1" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
              </>
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
        {staleSince != null && bars.length > 0 && (
          <div className="chip absolute left-4 top-4 z-10" style={{ color: "var(--warn)" }} role="status">
            Showing the copy loaded at {new Date(staleSince).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}; the price service didn&apos;t respond
            <button className="ml-2 underline" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        )}
        {staleSince == null && oldBar && last && bars.length > 0 && !queued && (
          <div className="chip absolute left-4 top-4 z-10" style={{ color: "var(--warn)" }} role="status">
            Latest bar is {new Date(last.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}; newer prices haven&apos;t arrived yet
          </div>
        )}
        {queued && bars.length > 0 && (
          <div className="chip acc absolute left-4 top-4 z-10">Refreshing history, about {eta ?? 1} min</div>
        )}
      </div>

      {tech && (
        <ConfluencePanel tech={tech} degree={degree} symbol={symbol}
          selectedScenario={scenarioKey} onSelectScenario={setScenarioKey}
          selectedDivergence={divKey} onSelectDivergence={setDivKey} />
      )}

      <SourceFooter
        source="Massive, end of day"
        updated={last ? `Last bar ${new Date(last.ts).toLocaleString("en-US", isIntraday(tf)
          ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }
          : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "—"}
        method={`${METHOD[tf]}${showPivots && pivots ? ` · Pivots: adaptive ZigZag, ${PIVOT_ALGORITHM_VERSION}` : ""}${tech ? ` · RSI(14) Wilder, MACD(12,26,9), divergences on 5/5 swing pivots · ${tech.version}` : ""}`}
      />
    </section>
  );
}

function paintVolume(vol: ISeriesApi<"Histogram">, bars: BarRow[], tf: ChartTimeframe) {
  const pos = alpha(css("--pos-chart"), 0.28), neg = alpha(css("--neg"), 0.28);
  vol.setData(bars.map((b) => ({ time: chartTime(b.ts, tf) as Time, value: b.volume, color: b.close >= b.open ? pos : neg })));
}

/** Shape check for /api/bars responses: anything else is treated as a failed load. */
function isBarsResponse(x: unknown): x is BarsResponse {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<BarsResponse>;
  return Array.isArray(b.bars) && b.bars.every((r) => r && typeof r.ts === "string" && [r.open, r.high, r.low, r.close].every((v) => typeof v === "number" && isFinite(v)));
}
