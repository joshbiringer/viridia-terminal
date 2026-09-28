"use client";

import { fmtPrice } from "@/lib/market-data/bars";
import { fmtDate } from "@/lib/format";
import { pct } from "@/lib/market-data/snapshot";
import { DEGREES, DEGREE_LABEL, type Degree } from "@/lib/analysis/pivots";
import {
  BAND_LABEL, PATTERN_LABEL, RANK_METHOD,
  type ClientCandidate, type ClientCandidates, type ConfidenceBand, type ConfluenceZone, type Glance, type Glances,
} from "@/lib/analysis/candidates";
import { useDegree } from "./DegreeContext";

type GlanceCount = Glance["preferred"];

const BAND_TONE: Record<ConfidenceBand, string> = { high: "pos", medium: "acc", low: "" };

/** One sentence a newcomer can read: where the engine thinks price is in the wave structure. */
export function describe(c: GlanceCount): string {
  const move = c.direction === "up" ? "advance" : "decline";
  const opp = c.direction === "up" ? "down" : "up";
  const pattern = PATTERN_LABEL[c.pattern].toLowerCase();
  switch (c.pattern) {
    case "impulse":
    case "leading_diagonal":
    case "ending_diagonal":
      return c.complete
        ? `A five-wave ${move} (${pattern}) looks complete, so a correction ${opp} would normally follow.`
        : `Price is in wave ${c.wave} of a five-wave ${move} (${pattern}).`;
    case "zigzag":
    case "flat":
      return c.complete
        ? `A three-wave ${pattern} correction ${c.direction} looks complete, so the larger trend would normally resume ${opp}.`
        : `Price is in wave ${c.wave} of a three-wave ${pattern} correction ${c.direction}.`;
    case "triangle":
      return c.complete
        ? `A sideways triangle looks complete, so a thrust ${opp} would normally follow.`
        : `Price is in wave ${c.wave} of a sideways triangle.`;
  }
}

const dist = (price: number | null, close: number | null) => (price != null && close ? price / close - 1 : null);

/**
 * "Structure at a glance" (engine Phase 7): the preferred count, the alternate, what breaks the
 * preferred count, the next target and the nearest confluence zone. Everything shown comes from the
 * rule-valid, ranked counts; nothing is filled in when the engine has no count.
 */
export function StructureGlance({
  symbol, glances, candidates, zones, close, asOf,
}: {
  symbol: string; glances: Glances | null; candidates: ClientCandidates | null; zones: ConfluenceZone[];
  close: number | null; asOf?: string;
}) {
  const { degree, setDegree } = useDegree((glances?.auto?.degree ?? "intermediate") as Degree);
  const g = glances?.[degree] ?? null;
  const preferred = g ? candidates?.[degree].candidates.find((c) => c.id === g.preferred.id) ?? null : null;
  const alternate = g?.alternate ? candidates?.[degree].candidates.find((c) => c.id === g.alternate!.id) ?? null : null;
  const nearest = zones.length ? [...zones].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0] : null;

  return (
    <section className="card" aria-labelledby="glance-title">
      <div className="card-h">
        <div>
          <h2 id="glance-title" className="card-t">Structure at a glance</h2>
          <p className="card-s mt-0.5">Daily chart{asOf ? `, as of ${fmtDate(asOf)}` : ""}</p>
        </div>
        <div className="seg ml-auto" role="tablist" aria-label="Wave degree">
          {[...DEGREES].reverse().map((d) => (
            <button key={d} role="tab" aria-selected={degree === d} onClick={() => setDegree(d)} disabled={!glances?.[d]}
              title={glances?.[d] ? undefined : `No rule-valid count at ${DEGREE_LABEL[d].toLowerCase()} degree`}>
              {DEGREE_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {!g ? (
        <div className="px-5 py-6">
          <p className="text-[14px] font-medium">No rule-valid wave count at {DEGREE_LABEL[degree].toLowerCase()} degree</p>
          <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-fg-2">
            {glances?.auto
              ? `Try the ${DEGREE_LABEL[glances.auto.degree].toLowerCase()} degree. `
              : `${symbol} needs more confirmed swings before any labeling can pass the rules. `}
            Viridia shows no wave label rather than a guess.
          </p>
        </div>
      ) : (
        <>
          {g.closeCall && (
            <p className="flex items-start gap-2 border-b border-line px-5 py-2.5 text-[12.5px]" style={{ background: "var(--alt-soft)", color: "var(--alt)" }}>
              <b className="font-semibold">Close call.</b>
              <span>The top two counts are within {g.preferred.score - (g.alternate?.score ?? 0)} points. Treat the structure as unresolved until one is invalidated.</span>
            </p>
          )}
          <div className="grid gap-px bg-line md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <CountPanel kind="preferred" c={g.preferred} full={preferred} />
            <Levels g={g.preferred} close={close} zone={nearest} />
            {g.alternate ? <CountPanel kind="alternate" c={g.alternate} full={alternate} /> : (
              <div className="bg-panel px-5 py-5">
                <div className="label">Alternate count</div>
                <p className="mt-2 text-[13px] text-fg-2">Only one labeling passes the rules at this degree.</p>
              </div>
            )}
          </div>
          {preferred?.confidence?.factors && <Evidence c={preferred} />}
        </>
      )}
      <div className="src"><span><b>Method</b>{RANK_METHOD}</span></div>
    </section>
  );
}

function CountPanel({ kind, c, full }: { kind: "preferred" | "alternate"; c: GlanceCount; full: ClientCandidate | null }) {
  const main = kind === "preferred";
  const arrow = c.waveDirection === "up" ? "↑" : "↓";
  const labels = full ? full.points.slice(1).map((p) => p.label).join("-") : null;
  return (
    <div className="flex flex-col gap-3 bg-panel px-5 py-5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: main ? "var(--wave)" : "var(--alt)" }} aria-hidden />
        <span className="label">{main ? "Preferred count" : "Alternate count"}</span>
      </div>
      <div>
        <div className={`${main ? "text-[19px]" : "text-[16px]"} font-[620] leading-snug tracking-[-0.02em]`}>
          {PATTERN_LABEL[c.pattern]} {c.direction}
          <span className="text-fg-3"> · </span>
          {c.complete ? <>complete, next move {c.waveDirection} {arrow}</> : <>wave {c.wave} {arrow}</>}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{describe(c)}</p>
        {full && (
          <p className="num mt-1 text-[12.5px] text-fg-3">
            {labels} from {fmtPrice(full.points[0].price)}, {fmtDate(full.points[0].ts)}
          </p>
        )}
      </div>
      <Confidence score={c.score} band={c.band} detail={full?.confidence ? `${full.confidence.passed} of ${full.confidence.evaluated} checks met` : null} />
    </div>
  );
}

function Confidence({ score, band, detail }: { score: number; band: ConfidenceBand; detail: string | null }) {
  return (
    <div className="mt-auto">
      <div className="flex items-baseline gap-2">
        <span className="text-[12.5px] text-fg-3">Pattern Confidence</span>
        <span className="num ml-auto text-[15px] font-[650]">{score}</span>
        <span className={`chip ${BAND_TONE[band]}`}>{BAND_LABEL[band]}</span>
      </div>
      <div className="bar mt-1.5" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Pattern Confidence">
        <i style={{ width: `${score}%` }} />
      </div>
      {detail && <p className="mt-1.5 text-[12px] text-fg-3">{detail}</p>}
    </div>
  );
}

function Levels({ g, close, zone }: { g: GlanceCount; close: number | null; zone: ConfluenceZone | null }) {
  const holdD = dist(g.hold, close), tgtD = dist(g.target?.price ?? null, close);
  return (
    <div className="flex flex-col gap-4 bg-panel px-5 py-5">
      <div className="label">Key levels, preferred count</div>
      <Level
        name="Invalidation"
        value={g.hold != null ? fmtPrice(g.hold) : "None yet"}
        delta={holdD} tone="neg"
        note={g.hold != null ? `Price ${g.holdSide} this level breaks the count.` : "The rules set no level for this state."}
      />
      <Level
        name={g.complete ? "Target, next move" : `Target, wave ${g.wave}`}
        value={g.target ? fmtPrice(g.target.price) : "None"}
        delta={tgtD}
        note={g.target ? g.target.label : "No unreached Fibonacci target."}
      />
      <Level
        name="Nearest confluence zone"
        value={zone ? `${fmtPrice(zone.low)}–${fmtPrice(zone.high)}` : "None"}
        delta={zone ? zone.distancePct : null} tone="fib"
        note={zone ? `${zone.count} Fibonacci relationships meet here.` : "No zone within 35% of price."}
      />
    </div>
  );
}

function Level({ name, value, delta, note, tone }: { name: string; value: string; delta: number | null; note: string; tone?: "neg" | "fib" }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 text-[12.5px]">
        <span className="text-fg-3">{name}</span>
        {delta != null && <span className="num ml-auto text-fg-3">{pct(delta, 1)} from close</span>}
      </div>
      <div className="num mt-0.5 text-[16px] font-[620] tracking-[-0.015em]" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      <p className="text-[12px] leading-snug text-fg-3">{note}</p>
    </div>
  );
}

function Evidence({ c }: { c: ClientCandidate }) {
  const f = c.confidence!.factors!;
  const met = f.filter((x) => x.pass), missed = f.filter((x) => !x.pass);
  return (
    <details className="border-t border-line px-5 py-3.5 text-[12.5px]">
      <summary className="cursor-pointer text-fg-2">
        Why this count is preferred <span className="text-fg-3">· {met.length} met, {missed.length} not met</span>
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <FactorList title="Met" items={met} ok />
        <FactorList title="Not met" items={missed} ok={false} />
      </div>
    </details>
  );
}

function FactorList({ title, items, ok }: { title: string; items: { id: string; text: string }[]; ok: boolean }) {
  return (
    <div>
      <div className="label mb-1.5">{title}</div>
      {items.length ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((x) => (
            <li key={x.id} className="flex gap-2 leading-snug text-fg-2">
              <span className={ok ? "text-pos" : "text-neg"} aria-hidden>{ok ? "✓" : "✗"}</span>
              <span>{x.text}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-fg-3">None.</p>}
    </div>
  );
}
