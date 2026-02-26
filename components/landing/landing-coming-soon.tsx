"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Puzzle, Github, Chrome, Phone } from "lucide-react";

interface LandingComingSoonProps {
  prefersReducedMotion?: boolean;
}

const COMING_SOON_ITEMS = [
  {
    icon: Chrome,
    title: "Browser extension",
    description:
      "Quickly save links to your bookmarks from any page. One click with our browser extension on desktop.",
    available: true,
  },
  {
    icon: Github,
    title: "GitHub Sync",
    description:
      "Sync your bookmarks to a GitHub repository. Version control, backup, and share your reading list.",
    available: false,
  },
  {
    icon: Phone,
    title: "Mobile app (iOS & Android)",
    description:
      "Coming soon to iOS and Android.",
    available: false,
  }
];

export function LandingComingSoon({
  prefersReducedMotion = false,
}: LandingComingSoonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const duration = prefersReducedMotion ? 0 : 0.45;
  const stagger = prefersReducedMotion ? 0 : 0.1;
  const ease = [0.25, 0.46, 0.45, 0.94] as const;

  return (
    <section ref={ref} className="px-6 py-12 lg:py-20">
      <div className="max-w-md mx-auto">
        <motion.h2
          className="text-2xl font-semibold text-center text-foreground mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration, ease }}
        >
          Coming soon
        </motion.h2>

        <div className="relative pt-0 pb-8">
          <div className="max-h-[280px] overflow-hidden relative">
            <div className="space-y-4">
              {COMING_SOON_ITEMS.map((item, i) => (
                <motion.div
                  key={item.title}
                  className={`rounded-xl p-5 border border-border ${
                    item.available
                      ? "bg-card"
                      : "bg-background opacity-60"
                  }`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{
                    duration,
                    delay: stagger + i * 0.1,
                    ease,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={
                        item.available
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      <item.icon className="size-5" />
                    </span>
                    <h3
                      className={`text-sm font-medium ${
                        item.available ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {item.title}
                    </h3>
                  </div>
                  <p
                    className={`text-xs pl-8 ${
                      item.available
                        ? "text-muted-foreground"
                        : "text-muted-foreground/70"
                    }`}
                  >
                    {item.description}
                  </p>
                </motion.div>
              ))}
            </div>
            {/* Bottom fade overlay */}
            <div
              className="absolute inset-x-0 bottom-0 h-28 pointer-events-none bg-gradient-to-t from-background via-background/80 to-transparent"
              aria-hidden
            />
          </div>

          <motion.div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10 flex justify-center"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration, delay: stagger + 0.2, ease }}
          >
            <a
              href="#"
              className="text-xs text-foreground border border-border px-6 py-2 rounded-full hover:bg-muted/50 transition-colors bg-background"
            >
              View roadmap
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
