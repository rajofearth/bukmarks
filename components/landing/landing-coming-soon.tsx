"use client";

import { ROADMAP_ITEMS } from "@/lib/roadmap-data";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const ITEMS = ROADMAP_ITEMS.map((item) => ({
  ...item,
  available: item.status === "in-progress" || item.status === "done",
}));

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

interface LandingComingSoonProps {
  prefersReducedMotion?: boolean;
}

export function LandingComingSoon({ prefersReducedMotion = false }: LandingComingSoonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const duration = prefersReducedMotion ? 0 : 0.45;
  const stagger = prefersReducedMotion ? 0 : 0.1;

  return (
    <section ref={ref} id="coming-soon" className="px-6 py-12 lg:py-20 scroll-mt-20">
      <div className="max-w-md mx-auto">
        <motion.h2
          className="text-2xl font-semibold text-center text-foreground mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration, ease: EASE }}
        >
          Coming soon
        </motion.h2>

        <div className="relative pt-0 pb-8">
          <div className="max-h-[280px] overflow-hidden relative">
            <div className="space-y-4">
              {ITEMS.map((item, i) => (
                <motion.div
                  key={item.title}
                  className={`rounded-xl p-5 border border-border ${
                    item.available
                      ? "bg-card"
                      : "bg-background"
                  }`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={
                    inView
                      ? {
                          opacity: item.available ? 1 : 0.6,
                          y: 0,
                        }
                      : {}
                  }
                  transition={{
                    duration,
                    delay: stagger + i * 0.1,
                    ease: EASE,
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
            transition={{ duration, delay: stagger + 0.2, ease: EASE }}
          >
            <Link
              href="/roadmap"
              className="text-xs text-foreground border border-border px-6 py-2 rounded-full hover:bg-muted/50 transition-colors duration-300 bg-background"
            >
              View roadmap
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
