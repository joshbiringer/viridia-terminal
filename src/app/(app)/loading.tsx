/** Shown instantly while an app page's data loads; mirrors the page header and a content block. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2 border-b border-line pb-5">
        <div className="skel h-6 w-56" />
        <div className="skel h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-panel p-5"><div className="skel h-3 w-24" /><div className="skel mt-3 h-6 w-32" /></div>)}
      </div>
      <div className="card p-5"><div className="skel h-[360px]" /></div>
    </div>
  );
}
