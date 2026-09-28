import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return <Suspense><AuthForm mode="signin" /></Suspense>;
}
