"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto my-10 flex max-w-[640px] flex-col items-center gap-3 px-8 py-12 text-center">
      <h1 className="h3">This page couldn&apos;t load its data</h1>
      <p className="max-w-[480px] text-fg-2">
        The data service didn&apos;t respond. Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set, then try again.
      </p>
      {error.digest && <p className="num text-[12px] text-fg-3">Reference {error.digest}</p>}
      <button className="btn pri" onClick={reset}>Try again</button>
    </div>
  );
}
