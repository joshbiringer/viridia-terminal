/** A labeled row in a settings section: label and help on the left, the control on the right. */
export function SettingsRow({ label, help, children, htmlFor }: {
  label: React.ReactNode; help?: React.ReactNode; children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13.5px] font-medium">{label}</label>
        {help && <p className="caption mt-0.5 max-w-[520px] text-[12.5px]">{help}</p>}
      </div>
      <div className="flex flex-none items-center gap-2">{children}</div>
    </div>
  );
}

/** A titled group of settings rows. Sections are separated by space and a rule, not stacked cards. */
export function SettingsSection({ title, description, children, id }: {
  title: string; description?: React.ReactNode; children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className="grid gap-4 border-t border-line pt-6 first:border-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="caption mt-1 text-[12.5px]">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
