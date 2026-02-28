"use client";

import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from "@/lib/terms-content";
import { LegalPageContent } from "./legal-page-content";

export function TermsPage() {
  return (
    <LegalPageContent
      title="Terms of Service"
      subtitle="The terms that govern your use of Bukmarks."
      lastUpdated={TERMS_LAST_UPDATED}
      sections={TERMS_SECTIONS}
    />
  );
}
