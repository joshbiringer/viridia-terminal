/** Fibonacci levels with one highlighted confluence zone where independent measurements overlap. */
export function FibSchematic({ className = "" }: { className?: string }) {
  const levels: [string, number, boolean][] = [
    ["1.618", 40, false], ["1.000", 92, false], ["0.618", 150, true], ["0.500", 176, false], ["0.382", 204, false], ["0", 260, false],
  ];
  return (
    <svg viewBox="0 0 560 300" className={className} role="img" aria-label="Fibonacci levels with a confluence zone">
      <rect x="40" y="136" width="480" height="30" rx="4" fill="var(--fib)" opacity="0.12" />
      {levels.map(([r, y, key]) => (
        <g key={r}>
          <line x1="40" x2="520" y1={y} y2={y} stroke="var(--fib)" strokeOpacity={key ? 0.9 : 0.35} strokeWidth={key ? 1.5 : 1} strokeDasharray={key ? undefined : "3 5"} />
          <text x="528" y={y + 4} fontSize="12" fill="var(--fib)" fontWeight={key ? 650 : 500} className="num">{r}</text>
        </g>
      ))}
      <path d="M60 260 C 150 250, 190 70, 250 40 S 330 120, 380 150" fill="none" stroke="var(--text)" strokeWidth="1.75" strokeOpacity="0.8" />
      <circle cx="380" cy="150" r="5" fill="var(--wave)" />
    </svg>
  );
}
