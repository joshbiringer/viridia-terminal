export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 pt-8 sm:px-8" aria-busy="true">
      <div className="skel h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel h-24" />)}
      </div>
      <div className="skel h-[420px]" />
    </div>
  );
}
