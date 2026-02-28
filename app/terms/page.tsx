import type { Metadata } from "next";
import { TermsPage } from "@/components/landing/terms-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Bukmarks.",
};

export default function Page() {
  return <TermsPage />;
}
