import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return <Suspense><AuthForm mode="signup" /></Suspense>;
}
