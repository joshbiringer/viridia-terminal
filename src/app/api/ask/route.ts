import { runAsk } from "@/lib/ask/engine";
import { serverTools } from "@/lib/ask/tools";
import { getLlm } from "@/lib/ask/llm";
import type { AskEvent, AskRequest, Audience, Depth } from "@/lib/ask/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const AUD: Audience[] = ["professional", "client", "beginner", "technical"];
const DEP: Depth[] = ["quick", "research", "deep"];
const sym = (v: unknown) => (typeof v === "string" && /^[A-Z0-9.\-]{1,12}$/.test(v) ? v : null);

/**
 * Ask Viridia. Streams newline-delimited JSON events: status lines and result blocks as each tool
 * returns, then the finished answer (with citations, evidence state, follow-ups and the execution
 * trace). Nothing about the question is stored here; saved conversations are the client's choice.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<AskRequest> | null;
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 600) : "";
  if (!q) return Response.json({ error: "Ask a question." }, { status: 400 });
  const c = body?.context ?? {};
  const input: AskRequest = {
    q,
    audience: AUD.includes(body?.audience as Audience) ? (body!.audience as Audience) : "professional",
    depth: DEP.includes(body?.depth as Depth) ? (body!.depth as Depth) : "research",
    useContext: body?.useContext !== false,
    entities: Array.isArray(body?.entities) ? body!.entities.map(sym).filter((x): x is string => !!x).slice(0, 20) : [],
    last: Array.isArray(body?.last) ? body!.last.map(sym).filter((x): x is string => !!x).slice(0, 10) : [],
    context: {
      path: typeof c.path === "string" ? c.path.slice(0, 200) : null,
      symbol: sym(c.symbol),
      degree: typeof c.degree === "string" && /^(minor|intermediate|primary)$/.test(c.degree) ? c.degree : null,
      zone: c.zone && typeof c.zone.low === "number" && typeof c.zone.high === "number" && isFinite(c.zone.low) && isFinite(c.zone.high) ? { low: c.zone.low, high: c.zone.high } : null,
      portfolioId: typeof c.portfolioId === "string" && /^[0-9a-f-]{36}$/.test(c.portfolioId) ? c.portfolioId : null,
    },
  };
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const emit = (e: AskEvent) => ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        const a = await runAsk(input, serverTools, emit, getLlm());
        console.log("ask", JSON.stringify({ intent: a.intent, symbols: a.symbols, ms: a.trace.ms, tools: a.trace.tools.map((t) => `${t.tool}:${t.ok ? t.ms : "err"}`), llm: a.trace.llm, cites: a.citations.length }));
      } catch (e) {
        emit({ type: "error", text: "Ask Viridia couldn't finish that answer. Try again in a moment." });
        console.error("ask", (e as Error).message);
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
