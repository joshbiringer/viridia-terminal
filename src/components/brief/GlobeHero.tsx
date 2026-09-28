"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HUBS, hubStatus, type Hub, type HubId } from "@/lib/market-sessions";
import { Skyline } from "./Skyline";

const D2R = Math.PI / 180;
const TILT = 18; // degrees the globe leans toward the viewer, showing more of the north
const SPEED = 5; // degrees per second of auto-rotation
const PAUSE_MS = 14_000; // auto-rotation pauses this long after the reader picks a city

const STATE_LABEL = { open: "Open", break: "Midday break", closed: "Closed" } as const;
const STATE_COLOR = { open: "#3CC689", break: "#E0A84A", closed: "#7C8F88" } as const;

/** Signed angular distance a→b in degrees, in (−180, 180]. */
const delta = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Mission Control's header band: a dotted globe (Natural Earth land, public domain) that turns slowly, with the
 * world's market hubs marked. As each hub comes round to the front its skyline rises below and its
 * session status shows; picking a city turns the globe to it. Motion stops for readers who prefer
 * reduced motion and whenever the hero is off screen.
 */
export function GlobeHero({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<HubId>("ny");
  const [prev, setPrev] = useState<HubId | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const view = useRef({ lon: HUBS[1].lon, target: null as number | null, pausedUntil: 0, focus: "ny" as HubId });

  // clock for session status (client only, so server and browser never disagree on the time)
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const pick = (id: HubId, at: number) => {
    const h = HUBS.find((x) => x.id === id)!;
    view.current.target = h.lon;
    view.current.pausedUntil = at + PAUSE_MS; // event timestamps share performance.now()'s clock
    setFocusSafe(id);
  };
  const setFocusSafe = (id: HubId) => {
    if (view.current.focus === id) return;
    setPrev(view.current.focus);
    view.current.focus = id;
    setFocus(id);
  };

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dots: Float32Array | null = null;
    let raf = 0, last = 0, visible = true, size = 0, dpr = 1;

    fetch("/geo/land-dots.json").then((r) => r.json()).then((a: number[]) => {
      dots = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) dots[i] = a[i] / 10;
      draw();
    }).catch(() => {});

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      size = canvas.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      draw();
    };

    const project = (lon: number, lat: number, lon0: number, R: number, c: number) => {
      const l = (lon - lon0) * D2R, p = lat * D2R, p0 = TILT * D2R;
      const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
      return { x: c + R * Math.cos(p) * Math.sin(l), y: c - R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)), z: cosc };
    };

    function draw(t = last) {
      if (!size) return;
      const s = size * dpr, c = s / 2, R = s * 0.43, lon0 = view.current.lon;
      ctx.clearRect(0, 0, s, s);
      // atmosphere
      const halo = ctx.createRadialGradient(c, c, R * 0.92, c, c, R * 1.18);
      halo.addColorStop(0, "rgba(60,180,131,0.28)");
      halo.addColorStop(1, "rgba(60,180,131,0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(c, c, R * 1.18, 0, Math.PI * 2); ctx.fill();
      // ocean sphere
      const sea = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
      sea.addColorStop(0, "#0F3A2C");
      sea.addColorStop(1, "#04130E");
      ctx.fillStyle = sea;
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(60,180,131,0.35)"; ctx.lineWidth = 1 * dpr; ctx.stroke();
      // graticule
      ctx.strokeStyle = "rgba(60,180,131,0.10)"; ctx.lineWidth = 0.7 * dpr;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath(); let pen = false;
        for (let lon = -180; lon <= 180; lon += 4) {
          const q = project(lon, lat, lon0, R, c);
          if (q.z > 0) { if (pen) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); pen = true; } else pen = false;
        }
        ctx.stroke();
      }
      for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath(); let pen = false;
        for (let lat = -80; lat <= 80; lat += 4) {
          const q = project(lon, lat, lon0, R, c);
          if (q.z > 0) { if (pen) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); pen = true; } else pen = false;
        }
        ctx.stroke();
      }
      // land
      if (dots) {
        const r = Math.max(1, 1.15 * dpr * (size / 340));
        for (let i = 0; i < dots.length; i += 2) {
          const q = project(dots[i], dots[i + 1], lon0, R, c);
          if (q.z <= 0.02) continue;
          ctx.fillStyle = `rgba(124,222,172,${0.18 + 0.7 * q.z})`;
          ctx.fillRect(q.x - r / 2, q.y - r / 2, r, r);
        }
      }
      // arcs between neighbouring hubs (great circles)
      const pts = HUBS.map((h) => ({ h, lon: h.lon, lat: h.lat }));
      ctx.lineWidth = 1.2 * dpr;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        ctx.beginPath(); let pen = false;
        for (let f = 0; f <= 1.0001; f += 0.02) {
          const lon = a.lon + delta(a.lon, b.lon) * f, lat = a.lat + (b.lat - a.lat) * f + Math.sin(Math.PI * f) * 12;
          const q = project(lon, lat, lon0, R * (1 + Math.sin(Math.PI * f) * 0.06), c);
          if (q.z > 0) { if (pen) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); pen = true; } else pen = false;
        }
        ctx.strokeStyle = "rgba(244,211,138,0.35)";
        ctx.setLineDash([4 * dpr, 5 * dpr]);
        ctx.lineDashOffset = -((t / 60) % 1000);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // hubs
      for (const h of HUBS) {
        const q = project(h.lon, h.lat, lon0, R, c);
        if (q.z <= 0) continue;
        const on = h.id === view.current.focus;
        const pulse = (Math.sin(t / 420 + h.lon) + 1) / 2;
        ctx.fillStyle = on ? `rgba(244,211,138,${0.25 + 0.25 * pulse})` : "rgba(60,180,131,0.25)";
        ctx.beginPath(); ctx.arc(q.x, q.y, (on ? 9 + 5 * pulse : 6) * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = on ? "#F4D38A" : "#7FE0B0";
        ctx.beginPath(); ctx.arc(q.x, q.y, (on ? 3.2 : 2.4) * dpr, 0, Math.PI * 2); ctx.fill();
      }
    }

    const frame = (t: number) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
      const v = view.current;
      if (v.target != null) {
        const d = delta(v.lon, v.target);
        v.lon += d * Math.min(1, dt * 3.2);
        if (Math.abs(d) < 0.3) { v.lon = v.target; v.target = null; }
      } else if (!reduce && t > v.pausedUntil) {
        v.lon = ((v.lon + SPEED * dt + 540) % 360) - 180;
        // the hub nearest the front becomes the focus
        const near = HUBS.map((h) => ({ h, d: Math.abs(delta(v.lon, h.lon)) })).sort((a, b) => a.d - b.d)[0];
        if (near.d < 20) setFocusSafe(near.h.id);
      }
      draw(t);
      if (visible) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && document.visibilityState === "visible";
      if (visible && !was) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    io.observe(wrap);
    const onVis = () => {
      const was = visible;
      visible = document.visibilityState === "visible";
      if (visible && !was) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const hub = HUBS.find((h) => h.id === focus)!;
  const st = now ? hubStatus(hub, now) : null;
  const statuses = useMemo(() => (now ? Object.fromEntries(HUBS.map((h) => [h.id, hubStatus(h, now)])) : null), [now]);

  return (
    <section ref={wrapRef} className="globe-hero relative isolate overflow-hidden rounded-[var(--r-lg)] text-white" aria-label="Mission Control">
      <div className="globe-stars pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="relative grid gap-3 px-5 pb-[78px] pt-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative z-10 flex min-w-0 flex-col gap-3">
          <div>
            <p className="text-[11.5px] font-[600] uppercase tracking-[0.14em] text-[#7FE0B0]">Mission Control</p>
            <h1 className="mt-1 text-[24px] font-[650] leading-tight tracking-[-0.025em] sm:text-[27px]">{title}</h1>
            <p className="mt-1 max-w-[620px] text-[13.5px] leading-relaxed text-white/70">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]" aria-live="polite">
            <span className="font-[600]">{hub.city}</span>
            {st ? (
              <>
                <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: STATE_COLOR[st.state] }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[st.state] }} />{STATE_LABEL[st.state]}
                </span>
                <span className="num text-white/80">{st.localTime} local</span>
                <span className="text-white/60">{st.next}</span>
              </>
            ) : <span className="h-4" />}
          </div>

          <nav className="flex flex-wrap gap-1.5" aria-label="World market sessions">
            {HUBS.map((h: Hub) => {
              const s = statuses?.[h.id];
              const on = h.id === focus;
              return (
                <button
                  key={h.id} onClick={(e) => pick(h.id, e.timeStamp)} aria-pressed={on}
                  title={s ? `${h.exchange}: ${STATE_LABEL[s.state]}, ${s.localTime} local. ${s.next}. Regular hours; non-U.S. holidays aren't shown.` : h.exchange}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors ${on ? "border-[#F4D38A]/70 bg-white/10 text-white" : "border-white/15 text-white/70 hover:border-white/30 hover:text-white"}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s ? STATE_COLOR[s.state] : "#7C8F88" }} />
                  {h.city}
                </button>
              );
            })}
          </nav>

          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>

        <div className="pointer-events-none absolute right-[-70px] top-[-20px] w-[240px] opacity-30 sm:opacity-50 md:pointer-events-auto md:static md:ml-auto md:w-full md:max-w-[220px] md:opacity-100">
          <canvas ref={canvasRef} className="aspect-square w-full" aria-hidden />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[84px]" aria-hidden>
        {prev && prev !== focus && <Skyline key={`p-${prev}`} id={prev} className="skyline-out absolute inset-0 h-full w-full" />}
        <Skyline key={`f-${focus}`} id={focus} className="skyline-in absolute inset-0 h-full w-full" />
      </div>
    </section>
  );
}
