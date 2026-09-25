import { TopNav } from "@/components/TopNav";
import { TerminalSidebar } from "@/components/TerminalSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <TopNav />
      <div className="flex">
        <TerminalSidebar />
        <main className="min-w-0 flex-1 px-4 pb-20 pt-6 sm:px-8 sm:pt-8">
          <div className="mx-auto flex max-w-[1560px] flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
