"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../Icon";

export const ACCOUNT_SECTIONS: [string, string, IconName][] = [
  ["Overview", "/account", "home"],
  ["Profile", "/account/profile", "account"],
  ["Plan & Billing", "/account/billing", "card"],
  ["Usage", "/account/usage", "gauge"],
  ["Notifications", "/account/notifications", "bell"],
  ["Security", "/account/security", "shield"],
  ["Preferences", "/account/preferences", "sliders"],
  ["Data & Privacy", "/account/data", "lock"],
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:gap-px lg:overflow-visible">
      {ACCOUNT_SECTIONS.map(([label, href, icon]) => {
        const active = path === href;
        return (
          <Link
            key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex h-8 flex-none items-center gap-2.5 whitespace-nowrap rounded-[var(--r-md)] px-2.5 text-[13.5px] transition-colors duration-[var(--t-fast)] ${
              active ? "bg-panel-2 font-[560] text-fg" : "text-fg-2 hover:bg-hover hover:text-fg"}`}
          >
            <Icon name={icon} className={`h-[15px] w-[15px] ${active ? "text-brand" : "text-fg-3"}`} />{label}
          </Link>
        );
      })}
    </nav>
  );
}
