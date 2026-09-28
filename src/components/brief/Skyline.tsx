/**
 * Original skyline silhouettes for the Brief's globe hero, drawn from simple shapes: a seeded row of
 * generic buildings plus a few outline landmarks per city. No photographs or third-party artwork.
 */
import type { HubId } from "@/lib/market-sessions";

const W = 1200, G = 200; // width, ground line

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface Shape { d: string; kind: "back" | "bldg" | "mark" }
interface Win { x: number; y: number; warm: boolean }

/** A row of generic buildings between x0 and x1, with lit windows. */
function filler(seed: number, x0: number, x1: number, minH: number, maxH: number, shapes: Shape[], wins: Win[]) {
  const r = rng(seed);
  let x = x0;
  while (x < x1) {
    const w = 16 + r() * 34, h = minH + r() * (maxH - minH), top = G - h;
    const stepped = r() < 0.25;
    shapes.push({
      kind: "bldg",
      d: stepped
        ? `M${x} ${G}V${top + 14}H${x + w * 0.2}V${top}H${x + w * 0.8}V${top + 14}H${x + w}V${G}Z`
        : `M${x} ${G}V${top}H${x + w}V${G}Z`,
    });
    if (r() < 0.18) shapes.push({ kind: "bldg", d: `M${x + w / 2 - 0.8} ${top}V${top - 10 - r() * 14}h1.6V${top}Z` });
    for (let wy = top + 8; wy < G - 6; wy += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) {
      if (r() < 0.16) wins.push({ x: wx, y: wy, warm: r() < 0.8 });
    }
    x += w + (r() < 0.3 ? 2 + r() * 6 : 0.8);
  }
}

function build(id: HubId): { shapes: Shape[]; wins: Win[] } {
  const shapes: Shape[] = [], wins: Win[] = [];
  const mark = (d: string) => shapes.push({ kind: "mark", d });
  const back = (d: string) => shapes.push({ kind: "back", d });
  switch (id) {
    case "ny":
      filler(11, 0, W, 30, 110, shapes, wins);
      // stepped art-deco tower with spire
      mark("M380 200V96H388V80H396V64H404V80H412V96H420V200ZM399 64V26h2V64Z");
      // tapered supertall with spire
      mark("M560 200L566 62H602L608 200ZM583 62V6h2V62Z");
      mark("M840 200V70H868V200Z");
      break;
    case "london":
      filler(23, 0, W, 24, 78, shapes, wins);
      // clock tower
      mark("M160 200V78H178V200ZM158 78L169 46L180 78ZM168 46V30h2V46Z");
      // bascule bridge: two towers, high walkway, deck
      mark("M330 200V96L336 84L342 96H368L374 84L380 96V200ZM470 200V96L476 84L482 96H508L514 84L520 96V200ZM380 104H470V112H380ZM300 158H550V166H300Z");
      // shard
      mark("M690 200L716 18L720 18L746 200Z");
      // bullet-shaped tower
      mark("M900 200C893 132 904 76 916 66C928 76 939 132 932 200Z");
      break;
    case "tokyo":
      back("M250 200L500 78Q545 58 590 78L860 200Z");
      back("M478 88Q545 50 612 88L590 98L565 90L545 100L522 90L500 98Z");
      filler(37, 0, W, 26, 96, shapes, wins);
      // lattice tower
      mark("M738 200L758 58H766L786 200H776L762 90L748 200ZM748 132H776V138H748ZM754 92H770V98H754ZM761 58V16h2V58Z");
      mark("M300 200V70H334V200Z");
      mark("M980 200V84H1012V200Z");
      break;
    case "sf":
      // suspension bridge on the left
      mark("M104 200V52H112V200ZM262 200V52H270V200ZM0 150H430V156H0Z");
      mark("M0 110Q54 150 108 54Q187 150 266 54Q330 140 430 120V122Q330 142 266 58Q187 152 108 58Q54 152 0 114Z");
      filler(53, 460, W, 24, 90, shapes, wins);
      // rounded-top tower
      mark("M600 200V72Q618 50 636 72V200Z");
      // pyramid
      mark("M806 200L820 30L834 200Z");
      break;
    case "hongkong":
      back("M0 200V122Q140 60 290 104T640 84T1000 96T1200 116V200Z");
      filler(71, 0, W, 34, 116, shapes, wins);
      // tallest towers on each side of the harbor
      mark("M516 200V40L522 30H546L552 40V200Z");
      mark("M688 200V96L704 36L720 76V200ZM703 36V10h2V36Z");
      mark("M900 200V22H934V200Z");
      break;
    case "frankfurt":
      filler(89, 0, W, 30, 96, shapes, wins);
      mark("M470 200V50L486 34L502 50V200Z");
      mark("M600 200V60H632V200ZM615 60V28h2V60Z");
      mark("M760 200V74H790V200Z");
      break;
  }
  return { shapes, wins };
}

const cache = new Map<HubId, ReturnType<typeof build>>();
const get = (id: HubId) => cache.get(id) ?? (cache.set(id, build(id)), cache.get(id)!);

export function Skyline({ id, className }: { id: HubId; className?: string }) {
  const { shapes, wins } = get(id);
  return (
    <svg viewBox={`0 0 ${W} 220`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`sk-b-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#123D2E" />
          <stop offset="1" stopColor="#051410" />
        </linearGradient>
        <linearGradient id={`sk-w-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B2A21" stopOpacity="0.9" />
          <stop offset="1" stopColor="#04100C" />
        </linearGradient>
      </defs>
      {shapes.filter((s) => s.kind === "back").map((s, i) => <path key={`b${i}`} d={s.d} fill="#1A4436" opacity="0.55" />)}
      {shapes.filter((s) => s.kind === "bldg").map((s, i) => <path key={`g${i}`} d={s.d} fill={`url(#sk-b-${id})`} />)}
      {shapes.filter((s) => s.kind === "mark").map((s, i) => (
        <path key={`m${i}`} d={s.d} fill="#0F3A2B" stroke="#3CB483" strokeOpacity="0.45" strokeWidth="0.8" />
      ))}
      {wins.map((w, i) => <rect key={i} x={w.x} y={w.y} width="2.4" height="2.8" fill={w.warm ? "#F4D38A" : "#7FE0B0"} opacity={w.warm ? 0.55 : 0.45} />)}
      <rect x="0" y={G} width={W} height="20" fill={`url(#sk-w-${id})`} />
      <path d={`M0 ${G + 0.5}H${W}`} stroke="#3CB483" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}
