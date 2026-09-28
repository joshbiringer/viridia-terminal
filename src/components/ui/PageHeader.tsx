/**
 * The header every application page uses: a compact title, one line of description, optional
 * metadata and actions. Marketing-scale headings stay on marketing pages.
 */
export function PageHeader({ title, description, meta, actions }: {
  title: React.ReactNode; description?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-line pb-5">
      <div className="min-w-0 max-w-[760px]">
        {meta && <div className="caption mb-1.5">{meta}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc mt-1.5">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
