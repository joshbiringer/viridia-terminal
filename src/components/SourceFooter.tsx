export function SourceFooter({ source, updated, method }: { source: string; updated: string; method: string }) {
  return (
    <div className="src">
      <span><b>Source</b>{source}</span>
      <span><b>Updated</b>{updated}</span>
      <span><b>Method</b>{method}</span>
    </div>
  );
}
