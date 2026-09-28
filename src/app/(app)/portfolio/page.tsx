import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { PortfolioXRay } from "@/components/portfolio/PortfolioXRay";

export const metadata: Metadata = { title: "Portfolio X-Ray" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        title="Portfolio X-Ray"
        description="Paste or upload holdings to see concentration, risk, how positions move together, tax lots and each holding's wave structure. Nothing you enter is stored."
      />
      <PortfolioXRay />
    </>
  );
}
