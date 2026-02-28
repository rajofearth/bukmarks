"use client";

import Image from "next/image";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const GRADIENT = "linear-gradient(to bottom, var(--background) 0%, color-mix(in oklch, var(--background) 96%, transparent) 4%, color-mix(in oklch, var(--background) 88%, transparent) 10%, color-mix(in oklch, var(--background) 70%, transparent) 16%, color-mix(in oklch, var(--background) 45%, transparent) 24%, color-mix(in oklch, var(--background) 20%, transparent) 32%, transparent 40%, transparent 60%, color-mix(in oklch, var(--background) 20%, transparent) 68%, color-mix(in oklch, var(--background) 45%, transparent) 76%, color-mix(in oklch, var(--background) 70%, transparent) 84%, color-mix(in oklch, var(--background) 88%, transparent) 90%, color-mix(in oklch, var(--background) 96%, transparent) 96%, var(--background) 100%)";
const EASE = [0.25, 0.46, 0.45, 0.94] as const;

interface LandingMockupProps {
  prefersReducedMotion?: boolean;
}

export function LandingMockup({ prefersReducedMotion = false }: LandingMockupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const duration = prefersReducedMotion ? 0 : 0.6;

  return (
    <section ref={ref} className="relative w-full py-12 md:py-24 overflow-hidden isolate">
      <div className="absolute inset-0 z-0" aria-hidden>
        <Image src="/landing-bg.png" alt="" fill className="object-cover object-center" sizes="100vw" priority />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: GRADIENT }} aria-hidden />

      {/* App preview placeholder */}
      <div className="relative z-10 flex justify-center items-center px-4">
        <motion.div
          className="w-[90%] max-w-[800px] rounded-xl shadow-2xl overflow-hidden border border-border min-h-[200px] flex items-center justify-center bg-muted/30"
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration, ease: EASE }}
        >
          <p className="text-muted-foreground text-sm">App preview coming soon</p>
        </motion.div>
      </div>
    </section>
  );
}
