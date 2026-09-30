import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CommandPalette } from "@/components/CommandPalette";
import { AskDrawer } from "@/components/ask/AskDrawer";
import { ViewerProvider } from "@/components/ViewerProvider";
import { getPreferences, getViewer } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer().catch(() => null);
  const prefs = viewer ? await getPreferences().catch(() => null) : null;
  return (
    <ViewerProvider viewer={viewer} prefs={prefs}>
      <div className="flex min-h-full flex-col">
        <TopNav />
        <main className="min-w-0 flex-1 px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-7">{children}</div>
        </main>
        <SiteFooter cta={false} />
      </div>
      <CommandPalette />
      <AskDrawer />
    </ViewerProvider>
  );
}
