/**
 * The Viridia mark: a V whose right arm is a five-wave advance.
 * One stroke, no fills, legible at 16px.
 */
export function ViridiaMark({ size = 22, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}
    >
      <path
        d="M3 4.5 L10.2 19.5 L13 12.6 L14.6 15 L18.2 6.8 L19.5 9 L21.5 3.5"
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export function ViridiaLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-fg">
      <ViridiaMark size={compact ? 20 : 22} className="text-brand" />
      <span className="leading-none">
        <span className="block text-[15px] font-[650] tracking-[0.14em]">VIRIDIA</span>
        {!compact && <span className="mt-[3px] block text-[9.5px] font-medium tracking-[0.32em] text-fg-3">TERMINAL</span>}
      </span>
    </span>
  );
}
