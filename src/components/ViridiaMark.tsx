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

export function ViridiaLockup({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${light ? "text-white" : "text-fg"}`}>
      <span className={`inline-flex items-center justify-center rounded-full ${compact ? "h-7 w-7" : "h-8 w-8"} ${light ? "bg-white/15" : "bg-ink text-panel"}`}>
        <ViridiaMark size={compact ? 15 : 17} />
      </span>
      <span className={`leading-none tracking-[-0.02em] ${compact ? "text-[16px]" : "text-[18px]"} font-[600]`}>Viridia</span>
    </span>
  );
}
