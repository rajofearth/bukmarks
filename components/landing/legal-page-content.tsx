"use client";

import { motion, useInView } from "motion/react";
import { useReducedMotion } from "motion/react";
import { useRef } from "react";
import { LegalPageLayout } from "./legal-page-layout";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export interface LegalSection {
  title: string;
  content: string[];
  linkUrl?: string;
  linkText?: string;
}

interface LegalPageContentProps {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export function LegalPageContent({
  title,
  subtitle,
  lastUpdated,
  sections,
}: LegalPageContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const prefersReducedMotion = useReducedMotion() ?? false;

  const duration = prefersReducedMotion ? 0 : 0.4;
  const stagger = prefersReducedMotion ? 0 : 0.08;

  return (
    <LegalPageLayout title={title}>
      <section ref={ref} className="px-6 py-20 lg:py-28">
        <div className="max-w-2xl mx-auto">
          <motion.p
            className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration, ease: EASE }}
          >
            Legal
          </motion.p>
          <motion.h1
            className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration, delay: stagger * 0.5, ease: EASE }}
          >
            {title}
          </motion.h1>
          <motion.p
            className="mt-2 text-xs text-muted-foreground text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration, delay: stagger, ease: EASE }}
          >
            Last updated {lastUpdated}
          </motion.p>
          <motion.p
            className="mt-6 text-base text-muted-foreground text-center max-w-xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration, delay: stagger * 1.5, ease: EASE }}
          >
            {subtitle}
          </motion.p>

          <div className="mt-16 space-y-12 [&>:first-child_h2]:mt-0">
            {sections.map((section, i) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration,
                  delay: 0.1 + i * stagger,
                  ease: EASE,
                }}
              >
                <h2 className="text-lg font-semibold tracking-tight text-foreground mt-10 mb-3 first:mt-0">
                  {section.title}
                </h2>
                <div className="space-y-3">
                  {section.linkUrl && section.linkText ? (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {section.content[0]}{" "}
                      <a
                        href={section.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 text-foreground"
                      >
                        {section.linkText}
                      </a>
                      .
                    </p>
                  ) : (
                    section.content.map((paragraph, j) => (
                      <p
                        key={`${section.title}-${j}`}
                        className="text-sm text-muted-foreground leading-relaxed"
                      >
                        {paragraph}
                      </p>
                    ))
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </LegalPageLayout>
  );
}
