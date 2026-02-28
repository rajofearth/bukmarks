"use client";

import { BukmarksLogo } from "@/components/bukmarks-logo";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { motion } from "motion/react";
import { LandingComingSoon } from "./landing-coming-soon";
import { LandingFeatures } from "./landing-features";
import { LandingFooter } from "./landing-footer";
import { LandingHero } from "./landing-hero";
import { LandingMockup } from "./landing-mockup";
import { LandingPricing } from "./landing-pricing";

interface LandingPageProps {
  isAuthenticated: boolean;
}

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <div className="min-h-svh flex flex-col bg-background">
      <motion.nav
        className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="flex h-14 items-center justify-between px-6 max-w-6xl mx-auto">
          <BukmarksLogo href="/" showLabel />
          <Button asChild variant="outline" size="sm">
            <Link href={isAuthenticated ? "/bookmarks" : "/auth"}>
              {isAuthenticated ? "Open app" : "Get started"}
            </Link>
          </Button>
        </div>
      </motion.nav>

      <main className="flex-1">
        <LandingHero
          isAuthenticated={isAuthenticated}
          prefersReducedMotion={prefersReducedMotion}
        />
        <LandingMockup prefersReducedMotion={prefersReducedMotion} />
        <LandingFeatures prefersReducedMotion={prefersReducedMotion} />
        <LandingPricing
          isAuthenticated={isAuthenticated}
          prefersReducedMotion={prefersReducedMotion}
        />
        <LandingComingSoon prefersReducedMotion={prefersReducedMotion} />
      </main>

      <LandingFooter />
    </div>
  );
}
