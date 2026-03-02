"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookmarkIcon, Loader2 } from "lucide-react";
import { FlipReveal } from "@/components/gsap/flip-reveal";
import { ImportGuide } from "@/components/onboarding/import-guide";
import { Skeleton } from "@/components/ui/skeleton";
import type { ViewMode } from "@/hooks/use-general-store";
import { useGeneralStore } from "@/hooks/use-general-store";
import { getViewModeGridClasses } from "@/lib/bookmarks-utils";
import { cn } from "@/lib/utils";
import { BookmarkCard } from "./bookmark-card";
import { DetailsHeaderRow } from "./bookmarks-empty-details";
import type { SearchMode, SemanticStage } from "./search-types";
import type { Bookmark, Folder } from "./types";

const SKELETON_KEYS = [
  "skeleton-1",
  "skeleton-2",
  "skeleton-3",
  "skeleton-4",
  "skeleton-5",
  "skeleton-6",
  "skeleton-7",
  "skeleton-8",
] as const;

function semanticStageText(stage: SemanticStage) {
  if (stage === "embedding") return "Embedding query...";
  if (stage === "vectorSearch") return "Searching bookmarks...";
  if (stage === "rerank") return "Reranking results...";
  if (stage === "error") return "Search failed. Retrying...";
  return "Searching bookmarks...";
}

function BookmarkCardSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "list" || viewMode === "details") {
    return (
      <div className="rounded-lg border border-border/60 p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <Skeleton className="mb-3 aspect-video w-full rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

interface BookmarksContentProps {
  isLoading: boolean;
  bookmarksCount: number;
  filteredBookmarks: Bookmark[];
  folderNameById: Record<string, string>;
  editableFolders: Folder[];
  searchQuery: string;
  searchMode: SearchMode;
  isSemanticLoading: boolean;
  semanticStage: SemanticStage;
  semanticLatencyMs: number | null;
  isIndexingIncomplete: boolean;
  onEditBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  onMoveBookmark: (
    bookmarkId: string,
    folderId: string,
  ) => Promise<void> | void;
}

export function BookmarksContent({
  isLoading,
  bookmarksCount,
  filteredBookmarks,
  folderNameById,
  editableFolders,
  searchQuery,
  searchMode,
  isSemanticLoading,
  semanticStage,
  semanticLatencyMs,
  isIndexingIncomplete,
  onEditBookmark,
  onDeleteBookmark,
  onMoveBookmark,
}: BookmarksContentProps) {
  const viewMode = useGeneralStore((state) => state.viewMode);
  const openInNewTab = useGeneralStore((state) => state.openInNewTab);
  const showFavicons = useGeneralStore((state) => state.showFavicons);
  const shouldAnimateList =
    !isSemanticLoading && searchQuery.trim().length === 0;
  const trimmedQuery = searchQuery.trim();
  const showSemanticStatus =
    trimmedQuery.length > 0 && searchMode === "semantic";
  const showSkeletonGrid = isSemanticLoading && filteredBookmarks.length === 0;
  const isSemanticNoResults =
    showSemanticStatus && !isSemanticLoading && filteredBookmarks.length === 0;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading your bookmarks...
      </div>
    );
  }

  if (bookmarksCount === 0) {
    return <ImportGuide />;
  }

  return (
    <div className="relative h-full">
      {showSemanticStatus ? (
        <div
          className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          {isSemanticLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : null}
          <span>
            {isSemanticLoading
              ? semanticStageText(semanticStage)
              : `${filteredBookmarks.length} result${
                  filteredBookmarks.length === 1 ? "" : "s"
                } for "${trimmedQuery}"`}
            {!isSemanticLoading && isIndexingIncomplete ? (
              <span className="ml-1 text-amber-500">· partial index</span>
            ) : null}
            {!isSemanticLoading && semanticLatencyMs !== null ? (
              <span className="ml-1">· {semanticLatencyMs}ms</span>
            ) : null}
          </span>
        </div>
      ) : null}

      {showSkeletonGrid ? (
        <div className={cn(getViewModeGridClasses(viewMode))}>
          {SKELETON_KEYS.map((id) => (
            <BookmarkCardSkeleton key={id} viewMode={viewMode} />
          ))}
        </div>
      ) : null}

      {!showSkeletonGrid && filteredBookmarks.length === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-lg">
            <BookmarkIcon className="text-muted-foreground size-6" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {isSemanticNoResults
                ? `No results for "${trimmedQuery}"`
                : "No bookmarks found"}
            </p>
            <p className="text-muted-foreground text-sm">
              {isSemanticNoResults
                ? "Try rephrasing your query or switch to Lexical search"
                : searchQuery
                  ? "Try a different search term"
                  : "Add your first bookmark to get started"}
            </p>
          </div>
        </div>
      )}

      {!showSkeletonGrid && viewMode === "details" && <DetailsHeaderRow />}
      {!showSkeletonGrid && shouldAnimateList ? (
        <FlipReveal
          keys={filteredBookmarks.map((b) => String(b.id))}
          showClass="block"
          hideClass="hidden"
        >
          <div className={cn(getViewModeGridClasses(viewMode))}>
            <AnimatePresence initial={false} mode="popLayout">
              {filteredBookmarks.map((bookmark) => (
                <motion.div
                  key={bookmark.id}
                  data-flip={String(bookmark.id)}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <BookmarkCard
                    bookmark={bookmark}
                    folderName={folderNameById[bookmark.folderId] ?? "Unsorted"}
                    viewMode={viewMode}
                    openInNewTab={openInNewTab}
                    showFavicons={showFavicons}
                    onEdit={onEditBookmark}
                    onDelete={onDeleteBookmark}
                    onMove={onMoveBookmark}
                    folders={editableFolders}
                    priority={filteredBookmarks[0]?.id === bookmark.id}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </FlipReveal>
      ) : !showSkeletonGrid ? (
        <div className={cn(getViewModeGridClasses(viewMode))}>
          {filteredBookmarks.map((bookmark) => (
            <div key={bookmark.id} data-flip={String(bookmark.id)}>
              <BookmarkCard
                bookmark={bookmark}
                folderName={folderNameById[bookmark.folderId] ?? "Unsorted"}
                viewMode={viewMode}
                openInNewTab={openInNewTab}
                showFavicons={showFavicons}
                onEdit={onEditBookmark}
                onDelete={onDeleteBookmark}
                onMove={onMoveBookmark}
                folders={editableFolders}
                priority={filteredBookmarks[0]?.id === bookmark.id}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
