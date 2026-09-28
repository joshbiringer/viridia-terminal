import { TopNav } from "@/components/TopNav";
import { TerminalSidebar } from "@/components/TerminalSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { ViewerProvider } from "@/components/ViewerProvider";
import { getPreferences, getViewer } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer().catch(() => null);
  const prefs = viewer ? await getPreferences().catch(() => null) : null;
  return (
    <ViewerProvider viewer={viewer} prefs={prefs}>
      <div className="min-h-full">
        <TopNav />
        <div className="flex">
          <TerminalSidebar />
          <main className="min-w-0 flex-1 px-4 pb-20 pt-6 sm:px-8 sm:pt-7">
            <div className="mx-auto flex max-w-[1560px] flex-col gap-6">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette />
    </ViewerProvider>
  );
}
