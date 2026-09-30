"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useViewer } from "@/components/ViewerProvider";
import {
  deletePortfolio, deleteSnapshot, getPortfolio, listPortfolios, listSnapshots, renamePortfolio, savePortfolio, saveSnapshot,
  type SavedPortfolio, type SavedSnapshot,
} from "@/lib/portfolio/saved";
import { diffSnapshots, snapshotOfWorkspace } from "@/lib/portfolio/snapshot";
import { parseCustomBenchmark, type Workspace } from "@/lib/portfolio/workspace";
import { AskPanel } from "./AskPanel";
import { CorrelationTab, ExposureTab, HoldingsTab, OverviewTab, RiskTab, StructureTab, TargetsBlock, TaxTab } from "./tabs";

const DEMO = `symbol,shares,avg cost,acquired
NVDA,400,118.50,2025-02-10
MSFT,90,402.10,2023-11-01
AVGO,120,168.00,2025-04-21
AMD,150,112.30,2025-10-14
QQQ,120,410.00,2024-03-15
JPM,75,248.00,2025-09-05
XOM,110,121.40,2024-08-12
UNH,40,520.00,2025-03-03
TLT,150,94.20,2025-01-22
USD,15000`;

const TABS = [["overview", "Overview"], ["risk", "Risk"], ["exposure", "Exposure"], ["correlation", "Correlation"], ["structure", "Structure"], ["tax", "Tax"], ["holdings", "Holdings"]] as const;
type Tab = (typeof TABS)[number][0];

export function XRayApp() {
  const { viewer } = useViewer();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [saved, setSaved] = useState<SavedPortfolio[]>([]);
  const [current, setCurrent] = useState<SavedPortfolio | null>(null);
  const [snaps, setSnaps] = useState<SavedSnapshot[]>([]);
  const [snapId, setSnapId] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bench, setBench] = useState("spy");
  const [custom, setCustom] = useState("");
  const [compareId, setCompareId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const run = async (input: string, opts: { targets?: Record<string, number> | null; custom?: string; compareId?: string } = {}) => {
    setBusy(true); setErrors([]);
    const cmp = saved.find((p) => p.id === (opts.compareId ?? compareId));
    const customW = parseCustomBenchmark(opts.custom ?? custom);
    try {
      const res = await fetch("/api/portfolio/workspace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, targets: opts.targets ?? current?.targets ?? null, custom: customW, compare: cmp ? { text: cmp.holdings_text, label: cmp.name } : undefined }),
      });
      const j = await res.json().catch(() => ({ errors: ["The server sent an unreadable response. Try again in a moment."] }));
      setErrors(j.errors ?? []);
      if (j.result) { setWs(j.result); setEditing(false); setPaste(false); }
    } catch {
      setErrors(["The analysis couldn't be run. Check your connection and try again."]);
    } finally { setBusy(false); }
  };

  const open = (p: SavedPortfolio) => {
    setCurrent(p); setText(p.holdings_text); setNote(null); setSnapId("");
    void run(p.holdings_text, { targets: p.targets });
    listSnapshots(p.id).then((s) => { setSnaps(s); setSnapId(s[0]?.id ?? ""); }).catch(() => setSnaps([]));
  };

  useEffect(() => {
    if (!viewer) return;
    let live = true;
    listPortfolios().then((list) => {
      if (!live) return;
      setSaved(list);
      const id = new URLSearchParams(window.location.search).get("id");
      const hit = id ? list.find((p) => p.id === id) : null;
      if (hit) open(hit);
      else if (id) void getPortfolio(id).then((p) => { if (live && p) open(p); });
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const t = (await f.text()).slice(0, 20_000);
    setCurrent(null); setSnaps([]); setText(t);
    void run(t, { targets: null });
  };
  const newPortfolio = () => { setWs(null); setCurrent(null); setSnaps([]); setText(""); setErrors([]); setNote(null); setPaste(true); };

  const save = async (asNew = false) => {
    try {
      const p = await savePortfolio({ id: asNew ? null : current?.id, name: current && !asNew ? current.name : "Untitled portfolio", holdings_text: text, targets: current?.targets });
      setCurrent(p); setSaved((s) => [p, ...s.filter((x) => x.id !== p.id)]);
      if (asNew || !current) setSnaps([]);
      setNote("Saved.");
    } catch (e) { setNote((e as Error).message || "Couldn't save."); }
  };
  const rename = async (name: string) => {
    if (!current || !name.trim() || name === current.name) return;
    try { const p = await renamePortfolio(current.id, name); setCurrent(p); setSaved((s) => s.map((x) => (x.id === p.id ? p : x))); } catch (e) { setNote((e as Error).message); }
  };
  const snapshot = async () => {
    if (!current || !ws) return;
    try { const s = await saveSnapshot(current.id, snapshotOfWorkspace(ws)); setSnaps((x) => [s, ...x]); setNote("Snapshot saved."); } catch (e) { setNote((e as Error).message); }
  };
  const removeSnap = async (id: string) => {
    try { await deleteSnapshot(id); setSnaps((x) => x.filter((s) => s.id !== id)); if (snapId === id) setSnapId(""); } catch (e) { setNote((e as Error).message); }
  };
  const remove = async () => {
    if (!current || !window.confirm(`Delete "${current.name}" and its snapshots?`)) return;
    try { await deletePortfolio(current.id); setSaved((s) => s.filter((x) => x.id !== current.id)); newPortfolio(); } catch (e) { setNote((e as Error).message); }
  };
  const saveTargets = async (targets: Record<string, number>) => {
    if (!current) return;
    const p = await savePortfolio({ id: current.id, name: current.name, holdings_text: current.holdings_text, targets });
    setCurrent(p); setSaved((s) => s.map((x) => (x.id === p.id ? p : x)));
    await run(p.holdings_text, { targets: p.targets });
  };

  const snap = snaps.find((s) => s.id === snapId) ?? null;
  const changes = useMemo(() => (ws && snap ? diffSnapshots(snap.snapshot, snapshotOfWorkspace(ws)) : null), [ws, snap]);
  const since = snap ? new Date(snap.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

  const errorBox = errors.length > 0 && (
    <ul className="rounded-[var(--r-md)] px-3 py-2 text-[13px] text-neg" style={{ background: "var(--neg-soft)" }} role="alert">
      {errors.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
  const input = (
    <div className="flex flex-col gap-2">
      <textarea ref={pasteRef} className="field min-h-[170px] w-full font-mono text-[12.5px]" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Holdings"
        placeholder={"symbol, shares, cost per share, date acquired\nAAPL, 100, 185.20, 2024-05-01\nVTI 250\nUSD, 12000"} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn pri" onClick={() => run(text)} disabled={!text.trim()} aria-busy={busy}>Run X-Ray</button>
        <span className="text-[12px] text-fg-3">One line per holding or tax lot: symbol, shares, and optionally cost per share and date acquired. CSV exports with a header row work. Enter cash as <span className="font-mono">USD, amount</span>.</span>
      </div>
    </div>
  );
  const hidden = <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />;

  // ---------------------------------------------------------------- before analysis
  if (!ws) {
    return (
      <div className="flex flex-col gap-4">
        {hidden}
        <section className="card overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="flex flex-col gap-4 px-6 py-7 lg:border-r lg:border-line">
              <p className="font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-brand">Portfolio X-Ray</p>
              <h1 className="f-heading gradient-text max-w-[680px]">See what your portfolio is really exposed to.</h1>
              <p className="max-w-[620px] text-[14.5px] leading-relaxed text-fg-2">Analyze concentration, factor exposure, correlations, downside risk, tax positioning, and Viridia market structure across every holding.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn pri" onClick={() => fileRef.current?.click()} aria-busy={busy}><Icon name="download" className="h-[14px] w-[14px] rotate-180" /> Upload portfolio</button>
                <button className="btn" onClick={() => { setPaste(true); setTimeout(() => pasteRef.current?.focus(), 0); }}>Paste holdings</button>
                <button className="btn" onClick={() => { setCurrent(null); setText(DEMO); void run(DEMO, { targets: null }); }} disabled={busy}>Try demo portfolio</button>
              </div>
              <p className="flex flex-wrap gap-x-3 text-[12.5px] text-fg-3"><span>Private by default</span><span aria-hidden>·</span><span>Nothing stored unless saved</span><span aria-hidden>·</span><span>Analysis in seconds</span></p>
              {paste && input}
              {errorBox}
            </div>
            <div className="flex flex-col bg-panel-2/60 px-6 py-7">
              <h2 className="font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-2">What the X-Ray measures</h2>
              <dl className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
                {[
                  ["Overview", "Value, returns, volatility, beta, drawdown, Sharpe, allocation, sectors, benchmark comparison"],
                  ["Risk", "Each position's share of portfolio volatility; historical and modeled stress tests"],
                  ["Exposure", "Estimated sector mix, including inside funds; market, size, value, momentum, quality and low-volatility loadings"],
                  ["Correlation", "Pairwise matrix, clusters, independent exposures"],
                  ["Structure", "Viridia's trend, wave counts, Fibonacci zones and invalidation levels, by weight"],
                  ["Tax", "Unrealized gains and losses by position and lot, short- and long-term"],
                ].map(([k, v]) => <div key={k} className="contents"><dt className="font-[600]">{k}</dt><dd className="text-fg-2">{v}</dd></div>)}
              </dl>
              {viewer && saved.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <h2 className="font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-fg-2">Saved portfolios</h2>
                  <ul className="mt-2 flex flex-col divide-y divide-line">
                    {saved.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 py-1.5">
                        <button className="min-w-0 flex-1 truncate text-left text-[13px] font-[560] hover:text-brand" onClick={() => open(p)}>{p.name}</button>
                        <span className="text-[11.5px] text-fg-3">{new Date(p.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!viewer && <p className="mt-auto pt-5 text-[12.5px] text-fg-2"><Link href="/signin?next=/portfolio" className="text-brand hover:underline">Sign in</Link> to save portfolios, snapshots and target weights.</p>}
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------- workspace
  return (
    <div className="flex flex-col gap-3">
      {hidden}
      <section className="card">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          {current ? (
            <input key={current.id + current.name} defaultValue={current.name} onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="min-w-[160px] max-w-[320px] rounded-[var(--r-sm)] border border-transparent bg-transparent px-1.5 py-0.5 text-[16px] font-[650] tracking-[-0.01em] hover:border-line focus:border-line focus:outline-none" aria-label="Portfolio name" maxLength={80} />
          ) : <h1 className="px-1.5 text-[16px] font-[650] tracking-[-0.01em]">Unsaved portfolio</h1>}
          <span className="num text-[12px] text-fg-3">{ws.positions.length} holdings · closes through {ws.asOf ?? "—"}</span>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1.5 text-[12px] text-fg-3">Compare with
              <select className="field h-8 py-0 text-[12.5px]" value={compareId ? `p:${compareId}` : bench === "custom" ? "custom" : bench}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("p:")) { setCompareId(v.slice(2)); setBench("compare"); void run(text, { compareId: v.slice(2) }); return; }
                  setCompareId(""); setBench(v);
                }}>
                <option value="spy">S&amp;P 500 (SPY)</option><option value="qqq">Nasdaq-100 (QQQ)</option><option value="6040">60/40</option><option value="custom">Custom benchmark</option>
                {viewer && saved.filter((p) => p.id !== current?.id).map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}
              </select>
            </label>
            <button className="btn sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>Edit holdings</button>
            {viewer ? (
              <>
                <button className="btn sm" onClick={() => save()}>{current ? "Save" : "Save portfolio"}</button>
                {current && <button className="btn sm" onClick={() => save(true)}>Save as new</button>}
                {current && <button className="btn sm" onClick={snapshot} title="Store today's figures to compare at the next review">Save snapshot</button>}
                {current && <Link className="btn sm" href={`/portfolio/review?id=${current.id}`}>Meeting prep</Link>}
                {current && <button className="btn ghost sm text-neg" onClick={remove}>Delete</button>}
              </>
            ) : <Link href="/signin?next=/portfolio" className="btn sm">Sign in to save</Link>}
            <button className="btn ghost sm" onClick={newPortfolio}>New</button>
          </span>
        </div>
        {bench === "custom" && (
          <form className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2" onSubmit={(e) => { e.preventDefault(); void run(text, { custom }); }}>
            <label className="text-[12px] text-fg-3" htmlFor="custom-b">Custom benchmark</label>
            <input id="custom-b" className="field h-8 w-[280px] font-mono text-[12.5px]" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="SPY 60, AGG 30, GLD 10" />
            <button className="btn sm" type="submit" disabled={!parseCustomBenchmark(custom)}>Apply</button>
            <span className="text-[12px] text-fg-3">Weights are normalized to 100% and rebalanced daily.</span>
          </form>
        )}
        {snaps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-[12.5px]">
            <span className="text-fg-3">Compare with snapshot</span>
            <select className="field h-8 py-0 text-[12.5px]" value={snapId} onChange={(e) => setSnapId(e.target.value)}>
              <option value="">None</option>
              {snaps.map((s) => <option key={s.id} value={s.id}>{new Date(s.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</option>)}
            </select>
            {snapId && <button className="text-[12px] text-fg-3 hover:text-neg" onClick={() => removeSnap(snapId)}>Delete snapshot</button>}
            <span className="text-fg-3">{snaps.length} saved</span>
          </div>
        )}
        {(editing || errors.length > 0 || note) && (
          <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
            {editing && input}
            {errorBox}
            {note && <p className="text-[12.5px] text-fg-3" role="status">{note}</p>}
          </div>
        )}
      </section>
      <WorkspaceView ws={ws} bench={bench === "custom" && !ws.perf.benchmarks.custom ? "spy" : bench} setBench={setBench} changes={changes} since={since}
        targets={current ? <TargetsBlock key={`${current.id}-${current.updated_at}`} ws={ws} targets={current.targets} onSave={saveTargets} /> : viewer ? <p className="border-t border-line px-5 py-3 text-[12.5px] text-fg-3">Save this portfolio to set target weights and compare current vs target.</p> : null}
        busy={busy} />
    </div>
  );
}

function WorkspaceView({ ws, bench, setBench, changes, since, targets, busy }: {
  ws: Workspace; bench: string; setBench: (b: string) => void; changes: ReturnType<typeof diffSnapshots> | null; since: string | null; targets: React.ReactNode; busy: boolean;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    return (TABS.find(([k]) => k === h)?.[0] ?? "overview") as Tab;
  });
  const go = (t: string) => {
    const k = (TABS.find(([x]) => x === t)?.[0] ?? "overview") as Tab;
    setTab(k);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${k}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]" aria-busy={busy}>
      <section className="card min-w-0 overflow-hidden">
        <nav className="flex overflow-x-auto border-b border-line px-2" role="tablist" aria-label="X-Ray sections">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-[560] transition-colors ${tab === k ? "border-brand text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}>{l}</button>
          ))}
        </nav>
        <div role="tabpanel" className={busy ? "opacity-60 transition-opacity" : ""}>
          {tab === "overview" && <OverviewTab ws={ws} bench={ws.perf.benchmarks[bench] ? bench : "spy"} setBench={setBench} changes={changes} since={since} go={go} />}
          {tab === "risk" && <RiskTab ws={ws} />}
          {tab === "exposure" && <ExposureTab ws={ws} />}
          {tab === "correlation" && <CorrelationTab ws={ws} />}
          {tab === "structure" && <StructureTab ws={ws} />}
          {tab === "tax" && <TaxTab ws={ws} />}
          {tab === "holdings" && <HoldingsTab ws={ws}>{targets}</HoldingsTab>}
        </div>
        <div className="src"><span>End-of-day data through {ws.asOf ?? "—"}. Research output from stored prices and Viridia&apos;s structural model; not a recommendation.</span></div>
      </section>
      <aside className="min-w-0 xl:sticky xl:top-[72px] xl:self-start"><AskPanel ws={ws} changes={changes} since={since} go={go} /></aside>
    </div>
  );
}
