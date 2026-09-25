/** A clean 0-1-2-3-4-5 motive wave followed by an A-B-C correction. */
export function WaveSchematic({ className = "" }: { className?: string }) {
  const pts: [number, number, string, number][] = [
    [30, 260, "", 0], [120, 170, "1", -1], [170, 215, "2", 1], [300, 70, "3", -1], [350, 125, "4", 1], [430, 40, "5", -1],
    [500, 120, "A", 1], [545, 85, "B", -1], [620, 170, "C", 1],
  ];
  const motive = pts.slice(0, 6), corrective = pts.slice(5);
  return (
    <svg viewBox="0 0 660 300" className={className} role="img" aria-label="Five-wave motive structure followed by a three-wave correction">
      <line x1="120" x2="380" y1="170" y2="170" stroke="var(--border-2)" strokeDasharray="3 5" />
      <text x="388" y="174" fontSize="11" fill="var(--text-3)">Wave 4 stays above wave 1</text>
      <polyline points={motive.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--wave)" strokeWidth="2.25" strokeLinejoin="round" />
      <polyline points={corrective.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--alt)" strokeWidth="2.25" strokeLinejoin="round" />
      {pts.map(([x, y, l, d]) => l && (
        <g key={l}>
          <circle cx={x} cy={y + d * 20} r="12" fill="var(--panel)" stroke={/[A-C]/.test(l) ? "var(--alt)" : "var(--wave)"} strokeWidth="1.5" />
          <text x={x} y={y + d * 20 + 4.5} fontSize="13" fontWeight="650" textAnchor="middle" fill={/[A-C]/.test(l) ? "var(--alt)" : "var(--wave)"}>{l}</text>
        </g>
      ))}
      <text x="215" y="292" fontSize="12" fill="var(--text-2)" textAnchor="middle">Motive: five waves with the trend</text>
      <text x="540" y="292" fontSize="12" fill="var(--text-2)" textAnchor="middle">Corrective: three waves against it</text>
    </svg>
  );
}
