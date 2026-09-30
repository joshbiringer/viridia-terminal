"use client";

import Link from "next/link";
import { useState } from "react";

export interface Module { name: string; status: "live" | "partial" | "planned"; points: [string, string][]; href?: string; cta?: string }

const STATUS = { live: "Live", partial: "Partly live", planned: "Planned" } as const;

function Plus({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 29 29" className={`size-[29px] shrink-0 transition-[transform,color] duration-300 ${open ? "rotate-45 text-brand" : "text-brand/45"}`} fill="none">
      <circle cx="14.5" cy="14.5" r="14" stroke="currentColor" strokeWidth="1" />
      <path d="M14.5 8.75V20.25M8.75 14.5H20.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function Detail({ m }: { m: Module }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-[26px]">
        {m.points.map(([t, d]) => (
          <div key={t} className="flex gap-4">
            <span className="f-diamond mt-[8px]" aria-hidden />
            <div className="flex flex-col gap-1.5">
              <p className="f-body-bold">{t}</p>
              <p className="f-body-light text-fg-2">{d}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {m.href && <Link href={m.href} className="btn pri lg">{m.cta ?? m.name}</Link>}
        <span className={`f-label ${m.status === "live" ? "text-pos" : "text-fg-3"}`}>{STATUS[m.status]}</span>
      </div>
    </div>
  );
}

/** The platform's modules as an accordion list, with the open module's detail beside it on wide screens. */
export function ModuleExplorer({ modules }: { modules: Module[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20 xl:gap-[110px]">
      <ul className="flex flex-col">
        {modules.map((m, i) => (
          <li key={m.name} className="f-row">
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center gap-5 py-5 text-left">
              <span className={`f-subheading flex-1 ${open === i ? "font-[600]" : ""}`}>{m.name}</span>
              <Plus open={open === i} />
            </button>
            {open === i && <div className="pb-8 pt-1 lg:hidden"><Detail m={m} /></div>}
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">{modules[open] && <Detail m={modules[open]} />}</div>
    </div>
  );
}
