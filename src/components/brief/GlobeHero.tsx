"use client";

import { useEffect, useRef, useState } from "react";
import { HUBS, hubStatus, type HubId } from "@/lib/market-sessions";
import { subsolarPoint, sunElevation } from "@/lib/sun";

const STATE_LABEL = { open: "Open", break: "Midday break", closed: "Closed" } as const;
const STATE_COLOR = { open: "#3CC689", break: "#E0A84A", closed: "#9AA8A2" } as const;

/** Start over whichever hub is trading now (New York first), so the opening shot is the live market. */
function startHub(now: Date): HubId {
  const order: HubId[] = ["ny", "london", "frankfurt", "tokyo", "hongkong"];
  return order.find((id) => hubStatus(HUBS.find((h) => h.id === id)!, now).state === "open") ?? "ny";
}

/**
 * Mission Control's header: a realistic Earth lit by the sun's actual position right now, with a
 * camera that flies between the world's market hubs. At each city a skyline rises out of the globe.
 * The scene loads after first paint, pauses off screen, and holds still for reduced-motion readers.
 */
export function GlobeHero({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [focus, setFocus] = useState<HubId | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let handle: { dispose(): void } | null = null, cancelled = false;
    import("./globe/scene")
      .then(({ createGlobe }) => createGlobe(canvas, { start: startHub(new Date()), still, onFocus: setFocus }))
      .then((h) => {
        if (cancelled) { h.dispose(); return; }
        handle = h;
        setReady(true);
        if (process.env.NODE_ENV !== "production") (window as unknown as { __globe?: unknown }).__globe = h;
      })
      .catch(() => { /* no WebGL: the hero keeps its night-sky background */ });
    return () => { cancelled = true; handle?.dispose(); };
  }, []);

  const hub = focus ? HUBS.find((h) => h.id === focus)! : null;
  const st = hub && now ? hubStatus(hub, now) : null;
  const daylight = hub && now ? sunElevation(hub.lat, hub.lon, subsolarPoint(now)) : null;
  const sky = daylight == null ? null : daylight > 0.1 ? "Daylight" : daylight > -0.1 ? (now && daylightRising(hub!.lon, now) ? "Sunrise" : "Sunset") : "Night";

  return (
    <section className="globe-hero relative isolate overflow-hidden rounded-[18px] text-white" aria-label="Mission Control">
      <div className="globe-stars pointer-events-none absolute inset-0 -z-20" aria-hidden />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 -z-10 h-full w-full transition-opacity duration-[1200ms] ${ready ? "opacity-100" : "opacity-0"}`}
        aria-hidden
      />
      <div className="globe-scrim pointer-events-none absolute inset-0 -z-10" aria-hidden />

      <div className="relative flex min-h-[460px] max-w-[600px] flex-col justify-between gap-6 px-6 pb-7 pt-8 sm:min-h-[480px] sm:px-10 sm:pt-10">
        <div>
          <p className="f-eyebrow text-[#7FE0B0]">Mission Control</p>
          <h1 className="mt-4 text-[clamp(2.1rem,4vw,56px)] font-[400] leading-[1] tracking-[-0.02em]">{title}</h1>
          <p className="mt-4 max-w-[560px] text-[16px] font-[300] leading-relaxed text-white/80">{subtitle}</p>
          {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]" aria-live="polite">
          {hub && st ? (
            <>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">Now over</span>
              <span className="font-[600]">{hub.city}</span>
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: STATE_COLOR[st.state] }}>
                <span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[st.state] }} />{STATE_LABEL[st.state]}
              </span>
              <span className="num text-white/85">{st.localTime} local</span>
              <span className="text-white/65">{st.next}</span>
              {sky && <span className="text-white/50">· {sky}</span>}
            </>
          ) : <span className="h-4" />}
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-white/35">Earth imagery: NASA · Sun position live</p>
    </section>
  );
}

/** Morning or evening twilight: is the sun east of this longitude (rising) or west of it (setting)? */
function daylightRising(lon: number, now: Date) {
  const d = ((subsolarPoint(now).lon - lon + 540) % 360) - 180;
  return d > 0;
}
