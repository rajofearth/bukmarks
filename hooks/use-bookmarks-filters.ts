"use client";

import { useAction } from "convex/react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type {
  SearchMode,
  SemanticStage,
} from "@/components/bookmarks/search-types";
import type { Bookmark, FolderViewItem } from "@/components/bookmarks/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  filterBookmarksBySearch,
  filterFoldersBySearch,
  sortBookmarksByDate,
} from "@/lib/bookmarks-utils";
import {
  embedBookmarkQuery,
  warmupEmbeddingModel,
} from "@/lib/embedding-client";
import type { SortMode } from "./use-general-store";
import { useGeneralStore } from "./use-general-store";

interface UseBookmarksFiltersArgs {
  bookmarks: Bookmark[];
  folderViewItems: FolderViewItem[];
  selectedFolder: string;
  searchQuery: string;
  sortMode: SortMode;
  isMobile: boolean;
  searchModeOverride?: SearchMode | false | null;
}

export function useBookmarksFilters({
  bookmarks,
  folderViewItems,
  selectedFolder,
  searchQuery,
  sortMode,
  isMobile,
  searchModeOverride,
}: UseBookmarksFiltersArgs) {
  const semanticSearch = useAction(api.actions.semanticSearchBookmarks);
  const semanticSearchEnabled = useGeneralStore(
    (state) => state.semanticSearchEnabled,
  );
  const resolvedSearchModeOverride =
    searchModeOverride === undefined || searchModeOverride === null
      ? "semantic"
      : searchModeOverride;
  const activeSearchMode: SearchMode =
    semanticSearchEnabled && resolvedSearchModeOverride === "semantic"
      ? "semantic"
      : "lexical";
  const isSemanticActive = activeSearchMode === "semantic";
  const semanticDtype = useGeneralStore((state) => state.semanticDtype);
  const [debouncedLexicalQuery, setDebouncedLexicalQuery] = useState(
    searchQuery.trim(),
  );
  const [debouncedSemanticQuery, setDebouncedSemanticQuery] = useState(
    searchQuery.trim(),
  );
  const [semanticIds, setSemanticIds] = useState<string[] | null>(null);
  const [semanticStage, setSemanticStage] = useState<SemanticStage>("idle");
  const [lastSemanticDurationMs, setLastSemanticDurationMs] = useState<
    number | null
  >(null);
  const latestRequestRef = useRef(0);
  const lastInputAtRef = useRef(0);
  const semanticResultCacheRef = useRef(new Map<string, string[]>());
  const semanticInFlightRef = useRef(new Map<string, Promise<string[]>>());

  useEffect(() => {
    lastInputAtRef.current = performance.now();
    if (process.env.NODE_ENV !== "production") {
      const rafId = window.requestAnimationFrame(() => {
        const elapsed = Math.round(performance.now() - lastInputAtRef.current);
        console.debug("[semantic-search] lexical-ready-ms", elapsed);
      });
      window.setTimeout(() => window.cancelAnimationFrame(rafId), 500);
    }
    const lexicalTimeout = window.setTimeout(() => {
      setDebouncedLexicalQuery(searchQuery.trim());
    }, 120);
    const semanticTimeout = window.setTimeout(() => {
      setDebouncedSemanticQuery(searchQuery.trim());
    }, 280);
    return () => {
      window.clearTimeout(lexicalTimeout);
      window.clearTimeout(semanticTimeout);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!isSemanticActive) {
      return;
    }
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let cancelled = false;
    let idleId: number | null = null;
    const warm = () => {
      if (cancelled) {
        return;
      }
      void warmupEmbeddingModel(semanticDtype).catch((error) => {
        console.warn("Semantic model warm-up failed", error);
      });
    };

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(warm);
    } else {
      const timeoutId = window.setTimeout(warm, 50);
      idleId = timeoutId;
    }
    return () => {
      cancelled = true;
      if (idleId === null) {
        return;
      }
      if (typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [isSemanticActive, semanticDtype]);

  useEffect(() => {
    const hasQuery = debouncedSemanticQuery.length > 0;
    if (!hasQuery || !isSemanticActive) {
      latestRequestRef.current += 1; // invalidate any in-flight request
      setSemanticIds(null);
      setSemanticStage("idle");
      return;
    }

    const semanticKey = `${semanticDtype}|${isMobile ? "mobile" : selectedFolder}|${debouncedSemanticQuery
      .trim()
      .toLowerCase()}`;
    const cachedIds = semanticResultCacheRef.current.get(semanticKey);
    if (cachedIds) {
      setSemanticStage("idle");
      startTransition(() => {
        setSemanticIds(cachedIds);
      });
      return;
    }
    setSemanticIds(null);

    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    let cancelled = false;
    const startedAt = lastInputAtRef.current || performance.now();
    let pending!: Promise<string[]>;
    pending = Promise.resolve().then(async () => {
      if (
        semanticInFlightRef.current.get(semanticKey) !== pending ||
        latestRequestRef.current !== requestId
      ) {
        return [];
      }
      setSemanticStage("embedding");
      const { vector } = await embedBookmarkQuery(
        debouncedSemanticQuery,
        semanticDtype,
      );
      if (
        semanticInFlightRef.current.get(semanticKey) !== pending ||
        latestRequestRef.current !== requestId
      ) {
        return [];
      }
      setSemanticStage("vectorSearch");
      const results = await semanticSearch({
        queryEmbedding: vector,
        limit: 20,
        selectedFolder:
          !isMobile && selectedFolder !== "all"
            ? (selectedFolder as Id<"folders">)
            : undefined,
        minScore: 0.35,
      });
      if (
        semanticInFlightRef.current.get(semanticKey) !== pending ||
        latestRequestRef.current !== requestId
      ) {
        return [];
      }
      setSemanticStage("rerank");
      return results.map((entry) => entry.bookmark._id);
    });
    semanticInFlightRef.current.set(semanticKey, pending);

    const isActiveRequest = () =>
      !cancelled &&
      latestRequestRef.current === requestId &&
      semanticInFlightRef.current.get(semanticKey) === pending;

    (async () => {
      try {
        const nextIds = await pending;
        if (!isActiveRequest()) {
          return;
        }
        if (process.env.NODE_ENV !== "production") {
          const elapsed = Math.round(performance.now() - startedAt);
          console.debug("[semantic-search] rerank-ready-ms", elapsed);
        }
        setLastSemanticDurationMs(Math.round(performance.now() - startedAt));
        semanticResultCacheRef.current.set(semanticKey, nextIds);
        if (semanticResultCacheRef.current.size > 64) {
          const oldestKey = semanticResultCacheRef.current.keys().next()
            .value as string | undefined;
          if (oldestKey) {
            semanticResultCacheRef.current.delete(oldestKey);
          }
        }
        startTransition(() => {
          setSemanticIds(nextIds);
        });
        setSemanticStage("idle");
      } catch (error) {
        if (!isActiveRequest()) {
          return;
        }
        setSemanticStage("error");
        console.error("Semantic search failed", error);
      } finally {
        if (semanticInFlightRef.current.get(semanticKey) === pending) {
          semanticInFlightRef.current.delete(semanticKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    debouncedSemanticQuery,
    isMobile,
    selectedFolder,
    semanticDtype,
    semanticSearch,
    isSemanticActive,
  ]);

  const folderFilteredBookmarks = useMemo(() => {
    if (selectedFolder === "all" || isMobile) {
      return bookmarks;
    }
    return bookmarks.filter((bookmark) => bookmark.folderId === selectedFolder);
  }, [bookmarks, isMobile, selectedFolder]);

  const lexicalFilteredBookmarks = useMemo(
    () =>
      filterBookmarksBySearch(folderFilteredBookmarks, debouncedLexicalQuery),
    [debouncedLexicalQuery, folderFilteredBookmarks],
  );

  const filteredBookmarks = useMemo(() => {
    if (
      !debouncedLexicalQuery.trim() ||
      !debouncedSemanticQuery.trim() ||
      !semanticIds ||
      semanticIds.length === 0
    ) {
      return lexicalFilteredBookmarks;
    }
    const byId = new Map(
      folderFilteredBookmarks.map((bookmark) => [bookmark.id, bookmark]),
    );
    const semanticOrdered = semanticIds
      .map((id) => byId.get(id))
      .filter((bookmark): bookmark is Bookmark => Boolean(bookmark));

    if (semanticOrdered.length === 0) {
      return lexicalFilteredBookmarks;
    }
    // Semantic mode should show only the highest-relevance matches.
    return semanticOrdered.slice(0, 20);
  }, [
    folderFilteredBookmarks,
    lexicalFilteredBookmarks,
    debouncedLexicalQuery,
    debouncedSemanticQuery,
    semanticIds,
  ]);

  const isSemanticRankedSearch = useMemo(() => {
    return (
      isSemanticActive &&
      debouncedLexicalQuery.trim().length > 0 &&
      semanticIds !== null &&
      semanticIds.length > 0
    );
  }, [debouncedLexicalQuery, semanticIds, isSemanticActive]);

  const sortedFilteredBookmarks = useMemo(() => {
    if (isSemanticRankedSearch) {
      // Preserve semantic relevance ranking returned by vector search.
      return filteredBookmarks;
    }
    return sortBookmarksByDate(filteredBookmarks, sortMode);
  }, [filteredBookmarks, isSemanticRankedSearch, sortMode]);

  const effectiveFilteredBookmarks = useMemo(() => {
    if (isMobile) {
      const base = isSemanticRankedSearch ? sortedFilteredBookmarks : bookmarks;
      const filtered = filterBookmarksBySearch(base, searchQuery);
      if (isSemanticRankedSearch) {
        return filtered;
      }
      return sortBookmarksByDate(filtered, sortMode);
    }
    return sortedFilteredBookmarks;
  }, [
    isMobile,
    bookmarks,
    searchQuery,
    sortedFilteredBookmarks,
    sortMode,
    isSemanticRankedSearch,
  ]);

  const sortedFilteredFolders = useMemo(() => {
    const filtered = filterFoldersBySearch(folderViewItems, searchQuery);
    return [...filtered].sort((a, b) => {
      const aTime = (a.latestBookmarkCreatedAt ?? a.createdAt).getTime();
      const bTime = (b.latestBookmarkCreatedAt ?? b.createdAt).getTime();
      return sortMode === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [folderViewItems, searchQuery, sortMode]);

  const isSemanticLoading =
    isSemanticActive && semanticStage !== "idle" && semanticStage !== "error";

  return {
    filteredBookmarks,
    sortedFilteredBookmarks,
    effectiveFilteredBookmarks,
    sortedFilteredFolders,
    isSemanticLoading,
    semanticStage,
    searchMode: activeSearchMode,
    lastSemanticDurationMs,
  };
}
