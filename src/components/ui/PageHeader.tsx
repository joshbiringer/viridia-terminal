import { PageEyebrow } from "./PageEyebrow";

/**
 * The header every application page uses: the section as a mono eyebrow, a large light title in the
 * brand gradient, one line of description, optional metadata and actions.
 */
export function PageHeader({ title, description, meta, actions }: {
  title: React.ReactNode; description?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-2">
      <div className="min-w-0 max-w-[820px]">
        <PageEyebrow />
        <h1 className="page-title gradient-text">{title}</h1>
        {description && <p className="page-desc mt-3 max-w-[720px]">{description}</p>}
        {meta && <div className="f-label mt-3 text-fg-3">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
