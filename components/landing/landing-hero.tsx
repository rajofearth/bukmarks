"use client";

import { ChevronDownIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LandingHeroProps {
  isAuthenticated: boolean;
  prefersReducedMotion?: boolean;
}

const ease = [0.25, 0.46, 0.45, 0.94] as const;

export function LandingHero({
  isAuthenticated,
  prefersReducedMotion = false,
}: LandingHeroProps) {
  const [imageError, setImageError] = useState(false);
  const duration = prefersReducedMotion ? 0 : 0.45;
  const delay = (d: number) => (prefersReducedMotion ? 0 : d);

  return (
    <section className="relative min-h-[85vh] flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 px-6 py-16 lg:py-24 overflow-hidden">
      {/* Content */}
      <div className="flex flex-col items-center lg:items-start text-center lg:text-left max-w-xl order-2 lg:order-1">
        <motion.h1
          className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, delay: delay(0), ease }}
        >
          Your bookmarks, organized.
        </motion.h1>
        <motion.p
          className="mt-4 text-muted-foreground text-base sm:text-lg leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, delay: delay(0.08), ease }}
        >
          Save links, build folders, find anything. Simple and fast.
        </motion.p>
        <motion.div
          className="mt-8 flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, delay: delay(0.16), ease }}
        >
          <Button asChild size="lg" className="text-base">
            <Link href={isAuthenticated ? "/bookmarks" : "/auth"}>
              {isAuthenticated ? "Open app" : "Get started"}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-base">
            <a href="#features" className="inline-flex items-center gap-2">
              Learn more
              <ChevronDownIcon className="size-4" />
            </a>
          </Button>
        </motion.div>
      </div>

      {/* Sketch illustration */}
      <motion.div
        className="relative w-full max-w-md lg:max-w-lg order-1 lg:order-2"
        initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: duration + 0.1, delay: delay(0.1), ease }}
      >
        <div className="relative aspect-square max-h-[320px] lg:max-h-[400px] mx-auto">
          {!imageError ? (
            <Image
              src="/landing-sketch.png"
              alt="Person organizing bookmarks"
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 320px, 400px"
              priority
              onError={() => setImageError(true)}
            />
          ) : null}
          <SketchPlaceholderFallback
            className={cn(!imageError && "hidden")}
            aria-hidden={!imageError}
          />
        </div>
      </motion.div>
    </section>
  );
}

/** SVG placeholder when image fails to load - sketch-style aesthetic */
function SketchPlaceholderFallback({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("absolute inset-0 flex items-center justify-center", className)}
      {...props}
    >
      <svg
        viewBox="0 0 400 400"
        fill="none"
        className="w-full h-full text-foreground/25 dark:text-foreground/15"
      >
        {/* Person silhouette - sketch style */}
        <path
          d="M120 280 Q140 200 160 180 L180 160 Q200 150 220 160 L240 180 Q260 200 280 220 L280 320 L120 320 Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="6 4"
          fill="none"
        />
        {/* Laptop */}
        <rect
          x="140"
          y="200"
          width="160"
          height="100"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <rect
          x="150"
          y="210"
          width="140"
          height="70"
          rx="2"
          fill="currentColor"
          fillOpacity="0.06"
        />
        {/* Bookmark icons */}
        <path
          d="M80 120 L100 80 L120 120 L100 100 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M320 140 L340 100 L360 140 L340 120 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
    </div>
  );
}
