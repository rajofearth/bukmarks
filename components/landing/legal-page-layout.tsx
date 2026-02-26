"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { LandingFooter } from "./landing-footer";

interface LegalPageLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-svh flex flex-col bg-background">
      <header className="border-b border-border/50 bg-background px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors"
          >
            Bukmarks
          </Link>
          <motion.span
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {title}
          </motion.span>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <LandingFooter />
    </div>
  );
}
