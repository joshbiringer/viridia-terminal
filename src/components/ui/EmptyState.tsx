import type { IconName } from "../Icon";
import { Icon } from "../Icon";

/**
 * Every empty state answers three questions: what is this, why it matters, what to do next.
 */
export function EmptyState({ icon, title, body, children, compact = false }: {
  icon?: IconName; title: string; body: React.ReactNode; children?: React.ReactNode; compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-start gap-3 ${compact ? "px-5 py-6" : "px-6 py-10 sm:px-8"}`}>
      {icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] bg-panel-2 text-brand ring-1 ring-line">
          <Icon name={icon} className="h-[17px] w-[17px]" />
        </span>
      )}
      <div className="max-w-[520px]">
        <h3 className="section-title">{title}</h3>
        <p className="page-desc mt-1">{body}</p>
      </div>
      {children && <div className="mt-1 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
