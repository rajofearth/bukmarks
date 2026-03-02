"use client";

import { useQuery } from "convex/react";
import {
  Bookmark,
  ChevronUp,
  FolderOpen,
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserInfoRow } from "@/components/user-info-row";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface UserStats {
  bookmarks: number;
  folders: number;
}

interface UserProfileProps {
  stats?: UserStats;
  onSettings?: () => void;
  onKeyboardShortcuts?: () => void;
  onSignOut?: () => void;
}

const defaultStats: UserStats = {
  bookmarks: 128,
  folders: 12,
};

export function UserProfile({
  stats,
  onSettings,
  onKeyboardShortcuts,
  onSignOut,
}: UserProfileProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const user = useQuery(api.users.getProfile);
  const realStats = useQuery(api.bookmarks.getUserStats);

  // Use real stats from database if available, otherwise use passed stats or defaults
  const displayStats = realStats ?? stats ?? defaultStats;

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
    } finally {
      onSignOut?.();
      setIsOpen(false);
      router.push("/auth");
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!user) {
    return (
      <div className="relative border-t border-sidebar-border p-2 text-xs text-sidebar-foreground/60">
        Loading profile...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative border-t border-sidebar-border p-2"
    >
      {/* Dropdown Menu - appears above the button */}
      <div
        className={cn(
          "absolute bottom-full left-2 right-2 z-50 mb-2 origin-bottom",
          "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
          "transition-all duration-150 ease-out",
          isOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-1 scale-[0.98] opacity-0",
        )}
      >
        {/* User Info Header */}
        <UserInfoRow
          user={user}
          className="p-3 gap-3"
          avatarClassName="size-10"
        />

        <Separator className="bg-border" />

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-1 p-2">
          <StatItem
            icon={Bookmark}
            value={displayStats.bookmarks}
            label="Bookmarks"
          />
          <StatItem
            icon={FolderOpen}
            value={displayStats.folders}
            label="Folders"
          />
        </div>

        <Separator className="bg-border" />

        {/* Quick Actions */}
        <div className="p-1">
          <TooltipProvider delayDuration={300}>
            <MenuItem
              icon={Settings}
              label="Settings"
              onClick={() => {
                onSettings?.();
                setIsOpen(false);
              }}
            />
            <MenuItem
              icon={Keyboard}
              label="Keyboard shortcuts"
              shortcut="?"
              onClick={() => {
                onKeyboardShortcuts?.();
                setIsOpen(false);
              }}
            />
            {mounted && (
              <MenuItem
                icon={
                  theme === "system" ? Monitor : theme === "dark" ? Moon : Sun
                }
                label={
                  theme === "system"
                    ? "System theme"
                    : theme === "dark"
                      ? "Dark mode"
                      : "Light mode"
                }
                onClick={toggleTheme}
              />
            )}

            <Separator className="my-1 bg-border" />

            <MenuItem
              icon={LogOut}
              label="Sign out"
              variant="destructive"
              onClick={handleSignOut}
            />
          </TooltipProvider>
        </div>
      </div>

      {/* Trigger Button - styled like SidebarMenuButton */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm",
          "ring-sidebar-ring transition-colors duration-100",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2",
          isOpen && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        <UserInfoRow user={user} className="flex-1 px-0" />
        <ChevronUp
          className={cn(
            "size-4 shrink-0 text-sidebar-foreground/50 transition-transform duration-150",
            isOpen ? "rotate-0" : "rotate-180",
          )}
        />
      </button>
    </div>
  );
}

// Stat item sub-component
interface StatItemProps {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}

function StatItem({ icon: Icon, value, label }: StatItemProps) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-2 bg-muted">
      <Icon className="size-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {value}
        </p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// Menu item sub-component - styled like SidebarMenuButton
interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  variant?: "default" | "destructive";
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
  variant = "default",
}: MenuItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
            "transition-colors duration-100",
            variant === "default" && [
              "text-popover-foreground",
              "hover:bg-accent hover:text-accent-foreground",
            ],
            variant === "destructive" && [
              "text-destructive",
              "hover:bg-destructive/10",
            ],
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="flex-1 text-left">{label}</span>
          {shortcut && (
            <kbd className="ml-auto rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
