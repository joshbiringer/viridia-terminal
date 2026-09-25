import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/supabase";
import type { SearchHit, Security } from "@/lib/types";
import { exchangeLabel, fmtInt, stockHref, subtypeLabel } from "@/lib/format";
import { SourceFooter } from "@/components/SourceFooter";

const KINDS = {
  stocks: { title: "Stocks", blurb: "Every listed stock, ADR, preferred, unit, warrant and right.", types: ["common", "preferred", "warrant", "unit", "right", "note"], defaultType: "common" },
  etfs: { title: "ETFs", blurb: "Every listed exchange-traded fund and product.", types: ["etf"], defaultType: "etf" },
} as const;
type Kind = keyof typeof KINDS;

const PAGE = 50;
const EXCHANGES = ["XNAS", "XNYS", "XASE", "ARCX", "BATS", "IEXG"];
type Params = { q?: string; exchange?: string; type?: string; status?: string; sort?: string; page?: string };
type Row = Pick<Security, "id" | "symbol" | "name" | "exchange" | "asset_subtype" | "is_active"> & { cik?: string | null };

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const k = (await params).kind as Kind;
  return { title: KINDS[k]?.title ?? "Markets" };
}

export default async function UniversePage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Params> }) {
  const kind = (await params).kind as Kind;
  const cfg = KINDS[kind];
  if (!cfg) notFound();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 64);
  const exchange = EXCHANGES.includes(sp.exchange ?? "") ? sp.exchange! : "";
  const type = (cfg.types as readonly string[]).includes(sp.type ?? "") ? sp.type! : cfg.types.length === 1 ? cfg.types[0] : sp.type === "all" ? "" : cfg.defaultType;
  const status = sp.status === "inactive" ? "inactive" : sp.status === "all" ? "all" : "active";
  const sort = sp.sort === "name" ? "name" : "symbol";
  const page = Math.max(1, Number(sp.page) || 1);

  let rows: Row[] = [];
  let total = 0;
  if (q) {
    const { data, error } = await db().rpc("search_securities", { q, lim: 50, include_inactive: status !== "active" });
    if (error) throw new Error(error.message);
    rows = ((data ?? []) as SearchHit[]).filter((r) =>
      (cfg.types as readonly string[]).includes(r.asset_subtype) && (!exchange || r.exchange === exchange) &&
      (!type || r.asset_subtype === type) && (status !== "inactive" || !r.is_active));
    total = rows.length;
  } else {
    let query = db().from("securities").select("id, symbol, name, exchange, asset_subtype, is_active, cik", { count: "exact" });
    query = type ? query.eq("asset_subtype", type) : query.in("asset_subtype", cfg.types as unknown as string[]);
    if (status === "active") query = query.eq("is_active", true);
    if (status === "inactive") query = query.eq("is_active", false);
    if (exchange) query = query.eq("exchange", exchange);
    const { data, count, error } = await query.order(sort).order("id").range((page - 1) * PAGE, page * PAGE - 1);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Row[];
    total = count ?? 0;
  }
  const pages = q ? 1 : Math.max(1, Math.ceil(total / PAGE));
  const base = `/markets/${kind}`;
  const href = (patch: Partial<Params>) => {
    const merged = { q, exchange, type: type === cfg.defaultType ? "" : type || "all", status: status === "active" ? "" : status, sort: sort === "symbol" ? "" : sort, page: "", ...patch };
    const p = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return `${base}${p.size ? "?" + p : ""}`;
  };

  return (
    <>
      <section className="pt-2">
        <h1 className="h2">{cfg.title}</h1>
        <p className="lede mt-2">{cfg.blurb} Drawn from the daily exchange symbol directories; nothing is hand-picked.</p>
      </section>
      <section className="card">
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4" action={base}>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 sm:max-w-[320px]">
            <span className="label">Search</span>
            <input className="field w-full" name="q" defaultValue={q} placeholder="Ticker or company" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Exchange</span>
            <select className="field" name="exchange" defaultValue={exchange}>
              <option value="">Any exchange</option>
              {EXCHANGES.map((x) => <option key={x} value={x}>{exchangeLabel(x)}</option>)}
            </select>
          </label>
          {cfg.types.length > 1 && (
            <label className="flex flex-col gap-1.5">
              <span className="label">Type</span>
              <select className="field" name="type" defaultValue={type || "all"}>
                <option value="all">All types</option>
                {cfg.types.map((t) => <option key={t} value={t}>{subtypeLabel(t)}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="label">Status</span>
            <select className="field" name="status" defaultValue={status}>
              <option value="active">Active</option><option value="inactive">Delisted</option><option value="all">All</option>
            </select>
          </label>
          <button className="btn pri" type="submit">Apply</button>
          {(q || exchange || status !== "active" || (type && type !== cfg.defaultType)) && <Link className="btn" href={base}>Reset</Link>}
          <span className="num ml-auto self-center text-[13px] text-fg-3">{fmtInt(total)} {q ? "top matches" : "securities"}</span>
        </form>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="t dense">
              <thead><tr>
                <th>{q ? "Ticker" : <Link className="hover:text-fg" href={href({ sort: "" })}>Ticker{sort === "symbol" ? " ↑" : ""}</Link>}</th>
                <th>{q ? "Name" : <Link className="hover:text-fg" href={href({ sort: "name" })}>Name{sort === "name" ? " ↑" : ""}</Link>}</th>
                <th>Exchange</th><th>Type</th><th className="hidden md:table-cell">SEC CIK</th><th>Status</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link className="tk hover:text-brand" href={stockHref(r.symbol)}>{r.symbol}</Link></td>
                    <td className="max-w-[460px] truncate text-fg-2">{r.name}</td>
                    <td className="text-fg-2">{exchangeLabel(r.exchange)}</td>
                    <td className="text-fg-2">{subtypeLabel(r.asset_subtype)}</td>
                    <td className="num hidden text-fg-3 md:table-cell">{r.cik || "—"}</td>
                    <td>{r.is_active ? <span className="text-[13px] text-fg-2">Active</span> : <span className="text-[13px] text-neg">Delisted</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center text-fg-2">Nothing matches these filters. Try removing one, or search by company name.</div>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px]">
            <span className="text-fg-3">Page <span className="num">{page}</span> of <span className="num">{fmtInt(pages)}</span></span>
            <span className="ml-auto flex gap-2">
              {page > 1 && <Link className="btn sm" href={href({ page: String(page - 1) })}>Previous</Link>}
              {page < pages && <Link className="btn sm" href={href({ page: String(page + 1) })}>Next</Link>}
            </span>
          </div>
        )}
        <SourceFooter source="Nasdaq Trader symbol directory, SEC" updated="Daily, Monday to Saturday" method={q ? "Ranked search: ticker, then name, then fuzzy match" : "Filtered listing, 50 per page"} />
      </section>
    </>
  );
}
