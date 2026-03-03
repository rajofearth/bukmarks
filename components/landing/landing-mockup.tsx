"use client";

import Image from "next/image";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { LANDING_GRADIENT } from "./landing-constants";

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
      <div className="absolute inset-0 z-[1]" style={{ background: LANDING_GRADIENT }} aria-hidden />

      {/* Video in rounded frame */}
      <div className="relative z-10 flex justify-center items-center px-4">
        <motion.div
          className="w-[90%] max-w-[800px] rounded-xl shadow-2xl overflow-hidden border border-border"
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration, ease: EASE }}
        >
          <video
            src="/demo-vid/bukmarks.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-auto block"
          />
        </motion.div>
      </div>
    </section>
  );
}
