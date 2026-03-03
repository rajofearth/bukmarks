"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { SocialButtons } from "./social-buttons";

interface AuthFormProps {
  className?: string;
}

export function AuthForm({ className }: AuthFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSocialLogin = async (provider: "google" | "github") => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider });
    } catch (error) {
      console.error("Social login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramLogin = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.oauth2({ providerId: "telegram" });
    } catch (error) {
      console.error("Telegram login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("w-full max-w-sm space-y-6", className)}>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your account to continue
        </p>
      </div>

      {/* Social Buttons */}
      <SocialButtons
        isLoading={isLoading}
        onGoogleClick={() => handleSocialLogin("google")}
        onGithubClick={() => handleSocialLogin("github")}
        onTelegramClick={handleTelegramLogin}
      />
    </div>
  );
}
