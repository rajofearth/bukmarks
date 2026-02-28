"use client";

import { BukmarksLogo } from "@/components/bukmarks-logo";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import Link from "next/link";
import { motion } from "motion/react";
import { LandingFooter } from "./landing-footer";
import { LandingRoadmap } from "./landing-roadmap";

interface RoadmapPageProps {
  isAuthenticated: boolean;
}

export function RoadmapPage({ isAuthenticated }: RoadmapPageProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="min-h-svh flex flex-col bg-background">
      <motion.nav
        className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.35,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
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
        <LandingRoadmap prefersReducedMotion={prefersReducedMotion} />
      </main>

      <LandingFooter />
    </div>
  );
}
