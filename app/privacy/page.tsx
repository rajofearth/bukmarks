import type { Metadata } from "next";
import { PrivacyPage } from "@/components/landing/privacy-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How we collect, use, and protect your information when you use Bukmarks.",
};

export default function Page() {
  return <PrivacyPage />;
}
