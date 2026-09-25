"use client";

export function OpenPaletteButton({ label = "Search securities", className = "btn pri" }: { label?: string; className?: string }) {
  return (
    <button className={className} onClick={() => window.dispatchEvent(new Event("viridia:open-palette"))}>
      {label}
    </button>
  );
}
