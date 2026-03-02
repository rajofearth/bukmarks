"use client";

import {
  ChevronRightIcon,
  FolderIcon,
  Loader2,
  SearchIcon,
} from "lucide-react";
import { type ElementType, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DisplayControlsMenu } from "./display-controls-menu";
import type { SearchMode } from "./search-types";

function useDebouncedSearch(
  searchQuery: string,
  onSearchChange: (value: string) => void,
  delay = 80,
) {
  const [draftQuery, setDraftQuery] = useState(searchQuery);

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (draftQuery !== searchQuery) {
        onSearchChange(draftQuery);
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, draftQuery, onSearchChange, searchQuery]);

  return [draftQuery, setDraftQuery] as const;
}

function SearchModePill({
  searchMode,
  onSearchModeChange,
}: {
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
      <button
        type="button"
        onClick={() => onSearchModeChange("lexical")}
        aria-pressed={searchMode === "lexical"}
        className={cn(
          "h-6 rounded-sm px-2 text-[11px] transition-colors",
          searchMode === "lexical"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Lexical
      </button>
      <button
        type="button"
        onClick={() => onSearchModeChange("semantic")}
        aria-pressed={searchMode === "semantic"}
        className={cn(
          "h-6 rounded-sm px-2 text-[11px] transition-colors",
          searchMode === "semantic"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Semantic
      </button>
    </div>
  );
}

interface DesktopBookmarksHeaderProps {
  currentFolderName?: string;
  CurrentFolderIcon?: ElementType;
  sidebarOpen: boolean;
  searchQuery: string;
  semanticSearchEnabled: boolean;
  searchMode: SearchMode;
  isSemanticLoading?: boolean;
  onSearchModeChange: (mode: SearchMode) => void;
  searchPlaceholder?: string;
  onSearchChange: (value: string) => void;
  onToggleSidebar: () => void;
  actionButton?: ReactNode;
}

export function DesktopBookmarksHeader({
  currentFolderName,
  CurrentFolderIcon,
  sidebarOpen,
  searchQuery,
  semanticSearchEnabled,
  searchMode,
  isSemanticLoading = false,
  onSearchModeChange,
  searchPlaceholder = "Search bookmarks...",
  onSearchChange,
  onToggleSidebar,
  actionButton,
}: DesktopBookmarksHeaderProps) {
  const [draftQuery, setDraftQuery] = useDebouncedSearch(
    searchQuery,
    onSearchChange,
  );

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleSidebar}
        className="shrink-0"
      >
        <ChevronRightIcon
          className={cn(
            "size-4 transition-transform",
            sidebarOpen && "rotate-180",
          )}
        />
      </Button>

      <div className="flex items-center gap-2 min-w-0">
        {CurrentFolderIcon ? (
          <CurrentFolderIcon className="text-muted-foreground size-4" />
        ) : (
          <FolderIcon className="text-muted-foreground size-4" />
        )}
        <h1 className="text-sm font-medium truncate">{currentFolderName}</h1>
      </div>

      <div className="ml-auto flex max-w-md flex-1 items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            id="search-input-desktop"
            type="text"
            inputMode="search"
            autoComplete="off"
            placeholder={searchPlaceholder}
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            className="h-8 pl-9 pr-9 text-sm"
          />
          {isSemanticLoading ? (
            <Loader2 className="text-muted-foreground absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin" />
          ) : null}
        </div>
        {semanticSearchEnabled && (
          <SearchModePill
            searchMode={searchMode}
            onSearchModeChange={onSearchModeChange}
          />
        )}
      </div>

      <DisplayControlsMenu />
      {actionButton}
    </div>
  );
}

interface MobileBookmarksHeaderProps {
  currentFolderName?: string;
  CurrentFolderIcon?: ElementType;
  showMobileSearch: boolean;
  searchQuery: string;
  semanticSearchEnabled: boolean;
  searchMode: SearchMode;
  isSemanticLoading?: boolean;
  onSearchModeChange: (mode: SearchMode) => void;
  searchPlaceholder?: string;
  onSearchChange: (value: string) => void;
  onToggleSearch: () => void;
  actionButton?: ReactNode;
}

export function MobileBookmarksHeader({
  currentFolderName,
  CurrentFolderIcon,
  showMobileSearch,
  searchQuery,
  semanticSearchEnabled,
  searchMode,
  isSemanticLoading = false,
  onSearchModeChange,
  searchPlaceholder = "Search bookmarks...",
  onSearchChange,
  onToggleSearch,
  actionButton,
}: MobileBookmarksHeaderProps) {
  const [draftQuery, setDraftQuery] = useDebouncedSearch(
    searchQuery,
    onSearchChange,
  );

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {CurrentFolderIcon ? (
            <CurrentFolderIcon className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <FolderIcon className="text-muted-foreground size-4 shrink-0" />
          )}
          <h1 className="text-sm font-medium truncate">{currentFolderName}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={onToggleSearch}>
            <SearchIcon className="size-4" />
          </Button>
          <DisplayControlsMenu />
          {actionButton}
        </div>
      </div>

      {showMobileSearch && (
        <div className="px-4 pb-3 border-t border-border/50">
          <div className="mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                id="search-input"
                type="text"
                inputMode="search"
                autoComplete="off"
                placeholder={searchPlaceholder}
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                className="h-9 w-full pl-9 pr-9 text-sm"
                autoFocus={showMobileSearch}
              />
              {isSemanticLoading ? (
                <Loader2 className="text-muted-foreground absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin" />
              ) : null}
            </div>
            {semanticSearchEnabled && (
              <SearchModePill
                searchMode={searchMode}
                onSearchModeChange={onSearchModeChange}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
