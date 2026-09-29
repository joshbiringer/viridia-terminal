"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useViewer } from "@/components/ViewerProvider";
import { getPortfolio, saveReview, type SavedPortfolio } from "@/lib/portfolio/saved";
import { parseHoldings, type XRay } from "@/lib/portfolio/xray";
import { compareReview, nearLongTerm, snapshotOf, talkingPoints, type Audience, type ReviewSnapshot } from "@/lib/portfolio/review";
import { fmtDollars, pct } from "@/lib/market-data/snapshot";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** Meeting prep for one saved portfolio (?id=), built from a fresh X-Ray and the last review's snapshot. */
export function MeetingPrep() {
  const { viewer } = useViewer();
  const [p, setP] = useState<SavedPortfolio | null>(null);
  const [x, setX] = useState<XRay | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("advisor");
  const [copied, setCopied] = useState(false);
  const [marked, setMarked] = useState<string | null>(null);

  useEffect(() => {
    if (!viewer) return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { queueMicrotask(() => setErr("Open meeting prep from a saved portfolio in Portfolio X-Ray.")); return; }
    let live = true;
    getPortfolio(id).then(async (row) => {
      if (!live) return;
      if (!row) { setErr("That portfolio wasn't found in your account."); return; }
      setP(row);
      const res = await fetch("/api/portfolio/xray", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: row.holdings_text, targets: row.targets }) });
      const j = await res.json();
      if (!live) return;
      if (j.result) setX(j.result); else setErr((j.errors ?? ["The X-Ray couldn't be run."]).join(" "));
    }).catch(() => live && setErr("The portfolio couldn't be loaded."));
    return () => { live = false; };
  }, [viewer]);

  if (!viewer) return <p className="text-[13.5px] text-fg-2"><Link href="/signin?next=/portfolio" className="text-brand hover:underline">Sign in</Link> to prepare a review for a saved portfolio.</p>;
  if (err) return <p className="text-[13.5px] text-fg-2">{err} <Link href="/portfolio" className="text-brand hover:underline">Portfolio X-Ray</Link></p>;
  if (!p || !x) return <div className="h-40 animate-pulse rounded-[var(--r-lg)] bg-hover" />;

  const prev = (p.review_snapshot ?? null) as ReviewSnapshot | null;
  const diff = compareReview(x, prev);
  const nearLt = nearLongTerm(x, parseHoldings(p.holdings_text).holdings);
  const points = talkingPoints(x, diff, audience, { nearLt });
  const title = `${p.name}: ${audience === "client" ? "review summary" : "meeting prep"}, ${fmtDay(new Date().toISOString())}`;
  const text = [title, "", ...points.map((q) => `• ${q.text}`)].join("\n");

  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } };
  const print = () => {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.55 -apple-system,Segoe UI,sans-serif;color:#10231c;max-width:680px;margin:32px auto;padding:0 16px}h1{font-size:19px}li{margin:6px 0}</style><h1>${esc(title)}</h1><ul>${points.map((q) => `<li>${esc(q.text)}</li>`).join("")}</ul>`);
    w.document.close(); w.focus(); w.print();
  };
  const mark = async () => {
    try { await saveReview(p.id, snapshotOf(x)); setMarked(new Date().toISOString()); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="card">
        <div className="card-h">
          <div className="min-w-0">
            <h2 className="card-t truncate">{p.name}</h2>
            <p className="card-s mt-0.5">
              {fmtDollars(x.total)} across {x.positions.length} holdings · prices as of {x.asOf?.slice(0, 10) ?? "—"} ·{" "}
              {marked ? `review marked ${fmtDay(marked)}` : p.reviewed_at ? `last reviewed ${fmtDay(p.reviewed_at)}` : "not reviewed yet"}
            </p>
          </div>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Link href={`/portfolio?id=${p.id}`} className="btn sm">Open X-Ray</Link>
            <button className="btn pri sm" onClick={mark} disabled={!!marked}>{marked ? "Marked as reviewed" : "Mark as reviewed"}</button>
          </span>
        </div>
        {diff && (
          <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
            <Cell k="Value since review" v={`${pct(diff.valueChangePct, 1)}`} note={fmtDollars(diff.valueChange)} />
            <Cell k="Holdings added / removed" v={`${diff.added.length} / ${diff.removed.length}`} note={[...diff.added, ...diff.removed].join(", ") || "none"} />
            <Cell k="Weights moved 2+ pts" v={String(diff.weightMoves.length)} note={diff.weightMoves.slice(0, 3).map((m) => m.symbol).join(", ") || "none"} />
            <Cell k="Count direction changes" v={String(diff.structureFlips.length)} note={diff.structureFlips.map((f) => f.symbol).join(", ") || "none"} />
          </dl>
        )}
      </section>

      <section className="card">
        <div className="card-h">
          <h2 className="card-t">Talking points</h2>
          <div className="seg ml-auto" role="tablist" aria-label="Audience">
            <button role="tab" aria-selected={audience === "advisor"} onClick={() => setAudience("advisor")}>Advisor</button>
            <button role="tab" aria-selected={audience === "client"} onClick={() => setAudience("client")}>Client version</button>
          </div>
          <button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          <button className="btn sm" onClick={print}>Print</button>
        </div>
        <ul className="flex flex-col gap-2 px-5 py-4 text-[14px] leading-relaxed">
          {points.map((q, i) => (
            <li key={i} className="flex gap-2.5 text-fg-2">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: q.tone === "pos" ? "var(--pos-chart)" : q.tone === "neg" ? "var(--neg)" : q.tone === "warn" ? "var(--warn)" : "var(--border-2)" }} />
              <span>{q.text}</span>
            </li>
          ))}
        </ul>
        <div className="src">
          <span><b>Built from</b>A fresh X-Ray of the saved holdings and the snapshot stored at the last review. Client names, meetings and account data aren&apos;t connected, so none appear here.</span>
          {audience === "client" && <span><b>Client version</b>Plain language with no Elliott Wave terms. Read it before sharing.</span>}
        </div>
      </section>
    </div>
  );
}

function Cell({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="bg-panel px-5 py-3">
      <dt className="text-[12px] text-fg-3">{k}</dt>
      <dd className="num text-[18px] font-[650] tracking-[-0.02em]">{v}</dd>
      <dd className="truncate text-[12px] text-fg-3">{note}</dd>
    </div>
  );
}
