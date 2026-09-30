"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useViewer } from "./ViewerProvider";
import { browserClient } from "@/lib/supabase/client";

/** Avatar button and menu for a signed-in user; sign-in and sign-up links otherwise. */
export function AccountMenu({ onDark = false }: { onDark?: boolean }) {
  const { viewer } = useViewer();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (!viewer) {
    return (
      <div className="flex flex-none items-center gap-1.5">
        <Link href="/signin" className={`btn sm hidden sm:inline-flex ${onDark ? "light" : "ghost"}`}>Sign in</Link>
        <Link href="/signup" className={`btn sm ${onDark ? "white" : "pri"}`}><span className="xl:hidden">Sign up</span><span className="hidden xl:inline">Create account</span></Link>
      </div>
    );
  }

  const signOut = async () => {
    setBusy(true);
    await browserClient().auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative flex-none">
      <button
        onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${onDark ? "bg-white/10 text-white ring-1 ring-white/25 hover:ring-white/50" : "bg-panel-2 text-brand ring-1 ring-line hover:ring-line-2"}`}
      >
        {viewer.initials}
      </button>
      {open && (
        <div role="menu" className="menu absolute right-0 top-[calc(100%+8px)] z-50 w-[260px] text-fg">
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="truncate text-[13.5px] font-medium">{viewer.displayName}</div>
            <div className="truncate text-[12.5px] text-fg-3">{viewer.email}</div>
          </div>
          <div className="menu-sep" />
          <Link role="menuitem" href="/account" className="menu-item" onClick={() => setOpen(false)}><Icon name="account" />Account</Link>
          <Link role="menuitem" href="/account/preferences" className="menu-item" onClick={() => setOpen(false)}><Icon name="settings" />Preferences</Link>
          <Link role="menuitem" href="/help#shortcuts" className="menu-item" onClick={() => setOpen(false)}><Icon name="keyboard" />Keyboard shortcuts</Link>
          <Link role="menuitem" href="/help" className="menu-item" onClick={() => setOpen(false)}><Icon name="help" />Help</Link>
          <div className="menu-sep" />
          <button role="menuitem" className="menu-item" onClick={signOut} disabled={busy}><Icon name="logout" />{busy ? "Signing out…" : "Sign out"}</button>
        </div>
      )}
    </div>
  );
}
