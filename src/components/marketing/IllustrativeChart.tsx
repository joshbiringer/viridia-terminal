import { EXAMPLE, exampleSeries } from "@/lib/illustration";

type Layer = "waves" | "alternate" | "fib" | "invalidation" | "levels";

/** SVG rendering of the synthetic example series. Always accompanied by an "Illustrative" label. */
export function IllustrativeChart({
  layers = ["waves", "fib", "invalidation"], width = 760, height = 400, animate = false, className = "",
}: { layers?: Layer[]; width?: number; height?: number; animate?: boolean; className?: string }) {
  const data = exampleSeries();
  const has = (l: Layer) => layers.includes(l);
  const pad = { l: 12, r: 64, t: 20, b: 24 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const lo = 38.5, hi = 60.5;
  const x = (i: number) => pad.l + (i / (data.length - 1 + 6)) * iw;
  const y = (p: number) => pad.t + (1 - (p - lo) / (hi - lo)) * ih;
  const cw = Math.max(2, (iw / (data.length + 6)) * 0.58);
  const { origin, w1, w2, w3, zone, invalidation } = EXAMPLE;
  const wavePts = [origin, w1, w2, w3];
  const grid = [40, 45, 50, 55, 60];
  const fibs: [string, number][] = [["0.382", w2.p + 0.382 * (w1.p - origin.p)], ["1.000", w2.p + (w1.p - origin.p)], ["1.618", EXAMPLE.ext1618]];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Illustrative example chart on a synthetic price series">
      {grid.map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={width - pad.r} y1={y(g)} y2={y(g)} stroke="var(--hover)" />
          <text x={width - pad.r + 10} y={y(g) + 4} fontSize="11" fill="var(--text-3)" className="num">{g.toFixed(2)}</text>
        </g>
      ))}

      {has("fib") && (
        <g>
          <rect x={x(w2.i)} width={width - pad.r - x(w2.i)} y={y(zone.hi)} height={y(zone.lo) - y(zone.hi)} fill="var(--fib)" opacity="0.1" />
          <line x1={x(w2.i)} x2={width - pad.r} y1={y(zone.hi)} y2={y(zone.hi)} stroke="var(--fib)" strokeOpacity="0.45" />
          <line x1={x(w2.i)} x2={width - pad.r} y1={y(zone.lo)} y2={y(zone.lo)} stroke="var(--fib)" strokeOpacity="0.45" />
          <text x={x(w2.i) + 8} y={y(zone.hi) - 7} fontSize="11.5" fill="var(--fib)" fontWeight="600">Fibonacci zone {zone.lo.toFixed(2)}–{zone.hi.toFixed(2)}</text>
        </g>
      )}
      {has("levels") && fibs.map(([r, p]) => (
        <g key={r}>
          <line x1={x(w2.i)} x2={width - pad.r} y1={y(p)} y2={y(p)} stroke="var(--fib)" strokeOpacity="0.35" strokeDasharray="2 4" />
          <text x={width - pad.r - 4} y={y(p) - 5} fontSize="11" fill="var(--fib)" textAnchor="end" className="num">{r}</text>
        </g>
      ))}
      {has("invalidation") && (
        <g>
          <line x1={x(w2.i)} x2={width - pad.r} y1={y(invalidation)} y2={y(invalidation)} stroke="var(--neg)" strokeDasharray="5 4" strokeOpacity="0.8" />
          <text x={width - pad.r - 4} y={y(invalidation) - 7} fontSize="11.5" fill="var(--neg)" textAnchor="end">Invalidation {invalidation.toFixed(2)} · wave 1 origin</text>
        </g>
      )}

      {data.map((d) => {
        const up = d.c >= d.o;
        const col = up ? "var(--pos-chart)" : "var(--neg)";
        return (
          <g key={d.i} opacity={0.9}>
            <line x1={x(d.i)} x2={x(d.i)} y1={y(d.h)} y2={y(d.l)} stroke={col} strokeWidth="1" />
            <rect x={x(d.i) - cw / 2} width={cw} y={y(Math.max(d.o, d.c))} height={Math.max(1, Math.abs(y(d.o) - y(d.c)))} fill={col} rx="0.5" />
          </g>
        );
      })}

      {has("alternate") && (
        <g>
          <polyline points={wavePts.map((p) => `${x(p.i)},${y(p.p)}`).join(" ")} fill="none" stroke="var(--alt)" strokeWidth="1.5" strokeDasharray="4 4" />
          {[["A", w1, -1], ["B", w2, 1], ["C", w3, 1.6]].map(([lab, p, dir]) => {
            const pv = p as typeof w1; const d = dir as number;
            return <text key={lab as string} x={x(pv.i) + 16} y={y(pv.p) + d * 18 + 4} fontSize="12.5" fontWeight="650" fill="var(--alt)">{lab as string}</text>;
          })}
        </g>
      )}
      {has("waves") && (
        <g>
          <polyline
            points={wavePts.map((p) => `${x(p.i)},${y(p.p)}`).join(" ")} fill="none" stroke="var(--wave)" strokeWidth="1.75" strokeLinejoin="round"
            style={animate ? { strokeDasharray: 600, strokeDashoffset: 600, animation: "vdraw 1.4s cubic-bezier(.2,.7,.2,1) .2s forwards" } : undefined}
          />
          {[["1", w1, -1], ["2", w2, 1]].map(([lab, p, dir]) => {
            const pv = p as typeof w1; const d = dir as number;
            return (
              <g key={lab as string}>
                <circle cx={x(pv.i)} cy={y(pv.p) + d * 16} r="9" fill="var(--panel)" stroke="var(--wave)" strokeWidth="1.25" />
                <text x={x(pv.i)} y={y(pv.p) + d * 16 + 4} fontSize="11.5" fontWeight="650" fill="var(--wave)" textAnchor="middle">{lab as string}</text>
              </g>
            );
          })}
          <g>
            <circle cx={x(w3.i)} cy={y(w3.p) - 17} r="10.5" fill="var(--wave)" />
            <text x={x(w3.i)} y={y(w3.p) - 13} fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">3</text>
            <text x={x(w3.i) + 16} y={y(w3.p) - 13} fontSize="11.5" fontWeight="600" fill="var(--wave)">Current</text>
          </g>
          <text x={x(origin.i)} y={y(origin.p) + 20} fontSize="11" fill="var(--text-3)" textAnchor="middle">origin</text>
        </g>
      )}
      <style>{`@keyframes vdraw { to { stroke-dashoffset: 0; } } @media (prefers-reduced-motion: reduce) { polyline { animation: none !important; stroke-dashoffset: 0 !important; } }`}</style>
    </svg>
  );
}
