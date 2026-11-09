import type { Diagram } from "@/lib/learn/lessons";

const TONE = { neutral: "var(--text-3)", pos: "var(--pos)", neg: "var(--neg)", fib: "var(--fib)" } as const;

/** A schematic wave drawing (not market data): the path, wave labels, channel or level lines and an optional band. */
export function LessonDiagram({ d }: { d: Diagram }) {
  const pts = d.path.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <figure className="m-0">
      <svg viewBox="0 0 240 140" className="h-auto w-full" role="img" aria-label={d.caption}>
        {d.band && (
          <g>
            <rect x="0" y={d.band.y1} width="240" height={d.band.y2 - d.band.y1} fill="var(--fib-soft)" />
            <text x="236" y={d.band.y1 + 9} textAnchor="end" fontSize="7.5" fill="var(--fib)">{d.band.label}</text>
          </g>
        )}
        {d.lines?.map((l, i) => (
          <g key={i}>
            <line x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} stroke={TONE[l.tone ?? "neutral"]} strokeWidth="1" strokeDasharray={l.dashed ? "3 3" : undefined} />
            {l.label && <text x={l.to[0]} y={l.to[1] - 3} textAnchor="end" fontSize="7" fill={TONE[l.tone ?? "neutral"]}>{l.label}</text>}
          </g>
        ))}
        <polyline points={pts} fill="none" stroke="var(--wave)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {d.labels?.map((lb) => {
          const [x, y] = d.path[lb.at];
          return (
            <g key={lb.at}>
              <circle cx={x} cy={y} r="1.8" fill="var(--wave)" />
              <text x={x} y={lb.below ? y + 11 : y - 5} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--text)">{lb.text}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 text-[11.5px] leading-snug text-fg-3">Schematic. {d.caption}</figcaption>
    </figure>
  );
}
