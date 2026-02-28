"use client";

import { PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from "@/lib/privacy-content";
import { LegalPageContent } from "./legal-page-content";

export function PrivacyPage() {
  return (
    <LegalPageContent
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your information when you use Bukmarks."
      lastUpdated={PRIVACY_LAST_UPDATED}
      sections={PRIVACY_SECTIONS}
    />
  );
}
