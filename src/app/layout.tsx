import type { Metadata } from "next";
// Self-hosted type (no third-party font requests): Geist for the interface and data,
// Instrument Serif for headlines (both SIL Open Font License).
import "@fontsource-variable/geist";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import { THEME_BOOT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "Viridia Terminal: See the structure behind the market", template: "%s · Viridia" },
  description: "Quantitative market intelligence powered by Elliott Wave, Fibonacci analysis and multi-timeframe market structure.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
