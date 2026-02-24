"use client";

import {
  ImageIcon,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";

type Feature = {
  icon?: LucideIcon;
  image?: string;
  title: string;
  description: string;
  badge?: string;
};

const FEATURES: Feature[] = [
  {
    image: "/folder-hand-drawn.png",
    title: "Folders & organization",
    description: "Organize links into nested folders. Drag and drop to keep everything tidy.",
  },
  {
    image: "/search-hand-drawn.png",
    title: "On-device indexing & semantic search",
    description:
      "Bookmarks are indexed on your device. Find anything with search across titles, URLs, and descriptions.",
  },
  {
    icon: ImageIcon,
    title: "Auto metadata & descriptions",
    description:
      "Favicons, previews, and descriptions pulled directly from each page—no third-party metadata APIs.",
  },
  {
    icon: Upload,
    title: "Browser import",
    description: "Import your existing bookmarks from Chrome, Firefox, or any browser export.",
  },
  {
    image: "/theme-hand-drawn.png",
    title: "Light & dark theme",
    description: "Switch between light and dark mode, or follow your system preference.",
  },
  {
    image: "/github-hand-drawn.png",
    title: "GitHub Sync",
    description: "Planned: sync your bookmarks directly to your GitHub account.",
    badge: "Planned",
  },
];

interface LandingFeaturesProps {
  prefersReducedMotion?: boolean;
}

export function LandingFeatures({
  prefersReducedMotion = false,
}: LandingFeaturesProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const stagger = prefersReducedMotion ? 0 : 0.06;
  const duration = prefersReducedMotion ? 0 : 0.4;

  return (
    <section
      id="features"
      ref={ref}
      className="px-6 py-20 lg:py-28 scroll-mt-20"
    >
      <div className="max-w-4xl mx-auto">
        <motion.h2
          className="text-2xl sm:text-3xl font-semibold text-center text-foreground"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          Everything you need
        </motion.h2>
        <motion.p
          className="mt-3 text-muted-foreground text-center max-w-xl mx-auto"
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{
            duration,
            delay: stagger,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          Save, organize, and find your links with ease.
        </motion.p>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="rounded-lg border border-border bg-card p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration,
                delay: 0.1 + i * stagger,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            >
              <div className="flex size-14 items-center justify-center mb-4 overflow-hidden">
                {feature.image ? (
                  <Image
                    src={feature.image}
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 object-contain"
                  />
                ) : feature.icon ? (
                  <feature.icon className="size-6 text-muted-foreground" />
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {feature.title}
                </h3>
                {feature.badge ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5"
                  >
                    {feature.badge}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
