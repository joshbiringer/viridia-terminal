"use client";

import { useEffect, useRef, useState } from "react";
import { HUBS, hubStatus, type HubId } from "@/lib/market-sessions";
import { subsolarPoint, sunElevation } from "@/lib/sun";

const STATE_LABEL = { open: "Open", break: "Midday break", closed: "Closed" } as const;
const STATE_COLOR = { open: "var(--pos-chart)", break: "var(--warn)", closed: "var(--text-3)" } as const;

/** Sky tints (top, middle, bottom) by the sun's elevation at the city in view. Always light. */
const SKY = {
  day: ["#BFDBFF", "#E6F0FF", "#F8FBFF"],
  golden: ["#FFD8BD", "#F9E8EE", "#FBF8FB"],
  twilight: ["#CFC7EE", "#ECE8F8", "#F8F7FD"],
  night: ["#AFBCE0", "#DFE5F5", "#F4F6FB"],
} as const;
type SkyKey = keyof typeof SKY;
const skyOf = (elev: number | null): SkyKey => (elev == null || elev > 0.18 ? "day" : elev > 0.02 ? "golden" : elev > -0.12 ? "twilight" : "night");

/** Start over whichever hub is trading now (New York first), so the opening shot is the live market. */
function startHub(now: Date): HubId {
  const order: HubId[] = ["ny", "london", "frankfurt", "tokyo", "hongkong"];
  return order.find((id) => hubStatus(HUBS.find((h) => h.id === id)!, now).state === "open") ?? "ny";
}

/** "Good afternoon, Josh." → the part after the comma set in italic; otherwise the last word. */
function Headline({ text }: { text: string }) {
  const comma = text.indexOf(",");
  if (comma > 0) return <>{text.slice(0, comma + 1)} <em>{text.slice(comma + 1).trim()}</em></>;
  const sp = text.trimEnd().lastIndexOf(" ");
  if (sp < 0) return <em>{text}</em>;
  return <>{text.slice(0, sp)} <em>{text.slice(sp + 1)}</em></>;
}

/**
 * Mission Control's header: a light sky over the curve of a realistic Earth, lit by the sun's
 * position right now. The camera glides along the planet from market hub to market hub and each
 * city's skyline rises on the horizon. The sky's tint follows the time of day at the city in view.
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
      .catch(() => { /* no WebGL: the hero keeps its sky */ });
    return () => { cancelled = true; handle?.dispose(); };
  }, []);

  const hub = focus ? HUBS.find((h) => h.id === focus)! : null;
  const st = hub && now ? hubStatus(hub, now) : null;
  const elev = hub && now ? sunElevation(hub.lat, hub.lon, subsolarPoint(now)) : null;
  const sky = skyOf(elev);
  const skyLabel = elev == null ? null : sky === "day" ? "Daylight" : sky === "night" ? "Night" : now && daylightRising(hub!.lon, now) ? "Sunrise" : "Sunset";
  const [a, b, c] = SKY[sky];

  return (
    <section
      className="globe-hero relative isolate overflow-hidden rounded-[28px] text-fg"
      style={{ "--sky-a": a, "--sky-b": b, "--sky-c": c } as React.CSSProperties}
      aria-label="Mission Control"
    >
      <div className="globe-clouds pointer-events-none absolute inset-0 -z-20" aria-hidden />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 -z-10 h-full w-full transition-opacity duration-[1400ms] ${ready ? "opacity-100" : "opacity-0"}`}
        aria-hidden
      />

      <div className="relative flex min-h-[500px] max-w-[620px] flex-col justify-between gap-8 px-6 pb-7 pt-8 sm:min-h-[540px] sm:px-10 sm:pt-12">
        <div>
          <span className="pill-badge">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--pos-chart)]" aria-hidden />Mission Control
          </span>
          <h1 className="serif mt-5 text-[clamp(2.6rem,5.2vw,74px)] leading-[0.98] text-fg"><Headline text={title} /></h1>
          <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed text-fg-2">{subtitle}</p>
          {actions && <div className="mt-7 flex flex-wrap gap-2.5">{actions}</div>}
        </div>

        <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_oklab,var(--panel)_88%,transparent)] px-4 py-2.5 text-[13px] shadow-[var(--shadow-md)] backdrop-blur-xl" aria-live="polite">
          {hub && st ? (
            <>
              <span className="text-fg-3">Now over</span>
              <span className="font-[600] text-fg">{hub.city}</span>
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: st.state === "closed" ? "var(--text-2)" : STATE_COLOR[st.state] }}>
                <span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[st.state] }} />{STATE_LABEL[st.state]}
              </span>
              <span className="num text-fg-2">{st.localTime} local</span>
              <span className="hidden text-fg-3 sm:inline">{st.next}</span>
              {skyLabel && <span className="text-fg-3">· {skyLabel}</span>}
            </>
          ) : <span className="h-4 text-fg-3">Loading the globe…</span>}
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-[color-mix(in_oklab,var(--panel)_75%,transparent)] px-2.5 py-0.5 text-[10.5px] text-fg-3 backdrop-blur-md">Earth imagery: NASA · Sun position live</p>
    </section>
  );
}

/** Morning or evening twilight: is the sun east of this longitude (rising) or west of it (setting)? */
function daylightRising(lon: number, now: Date) {
  const d = ((subsolarPoint(now).lon - lon + 540) % 360) - 180;
  return d > 0;
}
