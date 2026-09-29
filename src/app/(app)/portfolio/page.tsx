import type { Metadata } from "next";
import { XRayApp } from "@/components/portfolio/xray/XRayApp";

export const metadata: Metadata = { title: "Portfolio X-Ray" };

export default function PortfolioPage() {
  return <XRayApp />;
}
