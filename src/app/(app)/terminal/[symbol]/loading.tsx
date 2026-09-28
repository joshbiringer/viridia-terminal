/** Symbol page skeleton: header, chart and the structure panel, so the layout does not jump. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading analysis">
      <div className="flex flex-wrap items-end gap-10">
        <div><div className="skel h-8 w-28" /><div className="skel mt-2 h-4 w-56" /></div>
        <div><div className="skel h-8 w-32" /><div className="skel mt-2 h-4 w-24" /></div>
      </div>
      <div className="h-px bg-line" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card p-5"><div className="skel h-[440px]" /></div>
        <div className="card p-5"><div className="skel h-6 w-40" /><div className="skel mt-4 h-24" /><div className="skel mt-4 h-40" /></div>
      </div>
    </div>
  );
}
