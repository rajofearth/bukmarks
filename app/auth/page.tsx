"use client";

import { BukmarksLogo } from "@/components/bukmarks-logo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth";
import { authClient } from "@/lib/auth-client";

export default function AuthPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && session) {
      router.push("/bookmarks");
    }
  }, [session, isPending, router]);

  if (session) return null;

  return (
    <div className="flex min-h-svh w-full flex-1 flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <BukmarksLogo size="lg" showLabel />
        <AuthForm />

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground/60">
          By continuing, you agree to our{" "}
          <Link
            href="/terms"
            className="underline underline-offset-2 hover:text-muted-foreground"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-muted-foreground"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
