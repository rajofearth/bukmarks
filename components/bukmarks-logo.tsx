"use client";

import type { Route } from "next";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
} as const;

interface BukmarksLogoProps {
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  href?: Route;
  showLabel?: boolean;
}

export function BukmarksLogo({
  size = "md",
  className,
  href,
  showLabel = false,
}: BukmarksLogoProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use light icon until mounted to avoid hydration mismatch (server has no theme)
  const isDark = mounted && resolvedTheme === "dark";
  const src = isDark ? "/bukmarks-icon-dark.png" : "/bukmarks-icon-light.png";

  const content = (
    <span className="inline-flex items-center gap-2">
      <span className={cn("relative block shrink-0", SIZE_CLASSES[size])}>
        <Image
          src={src}
          alt="Bukmarks"
          fill
          className={cn("object-contain", className)}
          sizes="40px"
          priority
        />
      </span>
      {showLabel && (
        <span className="text-sm font-semibold text-foreground">Bukmarks</span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-2 hover:text-muted-foreground transition-colors"
      >
        {content}
      </Link>
    );
  }

  return content;
}
