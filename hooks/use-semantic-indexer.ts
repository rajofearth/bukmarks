"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useGeneralStore } from "@/hooks/use-general-store";
import {
  useSemanticIndexerStore,
  type ModelLoadingStage,
} from "@/hooks/use-semantic-indexer-store";
import { embedBookmarkDocument } from "@/lib/embedding-client";
import { loadEmbeddingBundle } from "@/lib/embedding-runtime";
import {
  buildBookmarkEmbeddingText,
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
  hashSemanticText,
} from "@/lib/semantic-search";

const HASH_CACHE_KEY = "bookmark_semantic_hashes_v1";

type BookmarkForIndex = {
  id: string;
  title: string;
  url: string;
  description?: string;
};

function getHashCache() {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(HASH_CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function setHashCache(cache: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HASH_CACHE_KEY, JSON.stringify(cache));
}

export function useSemanticIndexer() {
  const upsertEmbedding = useMutation(api.bookmarks.upsertBookmarkEmbedding);
  const deleteEmbedding = useMutation(api.bookmarks.deleteBookmarkEmbedding);
  const semanticDtype = useGeneralStore((state) => state.semanticDtype);
  const autoIndexing = useGeneralStore((state) => state.semanticAutoIndexing);
  const semanticSearchEnabled = useGeneralStore(
    (state) => state.semanticSearchEnabled,
  );

  const {
    isRunning,
    isPaused,
    processedCount,
    totalCount,
    errorCount,
    setRunning,
    setPaused,
    setProcessedCount,
    setTotalCount,
    setErrorCount,
    setModelReady,
    setModelLoadingStage,
    setModelLoadingProgress,
    setModelLoadingSpeedBytesPerSec,
    setModelLoadingDtype,
    setFileProgress,
    setError,
    resetModelState,
    resetProgress,
  } = useSemanticIndexerStore();

  const queueRef = useRef<BookmarkForIndex[]>([]);
  const forceRef = useRef(false);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const semanticEnabledRef = useRef(semanticSearchEnabled);

  // Aggregate speed tracking refs
  const fileLoadedRef = useRef<Record<string, number>>({});
  const aggLastLoadedRef = useRef(0);
  const aggLastTimeRef = useRef(0);

  useEffect(() => {
    semanticEnabledRef.current = semanticSearchEnabled;
    if (semanticSearchEnabled) {
      return;
    }
    queueRef.current = [];
    pausedRef.current = false;
    runningRef.current = false;
    setRunning(false);
    setPaused(false);
    resetProgress();
  }, [semanticSearchEnabled, setRunning, setPaused, resetProgress]);

  // ── Model loading progress callback ─────────────────────────────────
  // Used ONLY during the single model-load call at the start of a run
  const createModelProgressCallback = useCallback(() => {
    // Reset aggregate tracking for a fresh model load
    fileLoadedRef.current = {};
    aggLastLoadedRef.current = 0;
    aggLastTimeRef.current = 0;

    return (info: {
      status?: string;
      progress?: number;
      file?: string;
      loaded?: number;
      total?: number;
    }) => {
      // Map TransformersJS status to our stages
      // "done" fires per-file (more files may still be downloading)
      // "ready" fires once when the entire pipeline is fully loaded
      const stage: ModelLoadingStage =
        info.status === "initiate" ? "initiate" :
          info.status === "download" ? "download" :
            info.status === "progress" ? "progress" :
              info.status === "loading" ? "loading" :
                info.status === "ready" ? "done" :
                  info.status === "done" ? "progress" : // per-file done
                    "progress";
      setModelLoadingStage(stage);
      setModelLoadingDtype(semanticDtype);

      if (typeof info.progress === "number") {
        setModelLoadingProgress(info.progress);
      }

      // Per-file progress → store so UI can aggregate
      const file = info.file;
      const loaded = info.loaded ?? 0;
      const total = info.total ?? 0;
      if (file && typeof info.loaded === "number" && typeof info.total === "number" && total > 0) {
        setFileProgress(file, loaded, total);
        fileLoadedRef.current[file] = loaded;
      }

      // Aggregate speed across all files
      const aggLoaded = Object.values(fileLoadedRef.current)
        .reduce((s: number, v: number) => s + v, 0);
      const now = performance.now() / 1000;
      if (
        aggLastTimeRef.current > 0 &&
        aggLoaded > aggLastLoadedRef.current &&
        now > aggLastTimeRef.current
      ) {
        const elapsed = now - aggLastTimeRef.current;
        const delta = aggLoaded - aggLastLoadedRef.current;
        if (delta > 0 && elapsed > 0.1) {
          setModelLoadingSpeedBytesPerSec(delta / elapsed);
        }
      }
      aggLastLoadedRef.current = aggLoaded;
      aggLastTimeRef.current = now;
    };
  }, [
    semanticDtype,
    setModelLoadingStage,
    setModelLoadingProgress,
    setModelLoadingDtype,
    setFileProgress,
    setModelLoadingSpeedBytesPerSec,
  ]);

  // ── Embed a single bookmark (model already loaded) ──────────────────
  const indexBookmark = useCallback(
    async (bookmark: BookmarkForIndex, force = false) => {
      if (!semanticEnabledRef.current) {
        return { skipped: true };
      }
      const text = buildBookmarkEmbeddingText(bookmark);
      const contentHash = hashSemanticText(text);
      if (!force) {
        const hashCache = getHashCache();
        if (hashCache[bookmark.id] === contentHash) {
          return { skipped: true };
        }
      }

      // No progressCallback — model is already loaded, this just runs inference
      const { vector, dtype } = await embedBookmarkDocument(
        text,
        semanticDtype,
      );
      await upsertEmbedding({
        bookmarkId: bookmark.id as Id<"bookmarks">,
        embedding: vector,
        embeddingDim: EMBEDDING_DIM,
        embeddingModel: EMBEDDING_MODEL_ID,
        embeddingDtype: dtype,
        contentHash,
      });

      const hashCache = getHashCache();
      hashCache[bookmark.id] = contentHash;
      setHashCache(hashCache);
      return { skipped: false };
    },
    [semanticDtype, upsertEmbedding],
  );

  // ── Queue runner ─────────────────────────────────────────────────────
  const runQueue = useCallback(async () => {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    setRunning(true);
    pausedRef.current = false;
    setPaused(false);
    setError(null);

    // ── Phase 1: Load model ONCE ────────────────────────────────────
    // Don't eagerly set "initiate" — let progress callbacks drive stage.
    // If model is already in memory, no callbacks fire → modelReady is
    // set immediately and UI skips straight to indexing.
    resetModelState();

    try {
      const progressCb = createModelProgressCallback();
      await loadEmbeddingBundle(semanticDtype, progressCb);
      setModelReady(true);
      setModelLoadingStage("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load model";
      setError(msg);
      runningRef.current = false;
      setRunning(false);
      return;
    }

    // ── Phase 2: Index bookmarks ────────────────────────────────────
    while (queueRef.current.length > 0) {
      if (!semanticEnabledRef.current) {
        queueRef.current = [];
        break;
      }
      if (pausedRef.current) {
        runningRef.current = false;
        break;
      }
      const next = queueRef.current.shift();
      if (!next) {
        continue;
      }
      try {
        await indexBookmark(next, forceRef.current);
      } catch (error) {
        setErrorCount((value) => value + 1);
        console.error("Semantic index failed for bookmark", next.id, error);
      } finally {
        setProcessedCount((prev) => prev + 1);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (!pausedRef.current) {
      runningRef.current = false;
      setRunning(false);
    }
  }, [
    indexBookmark,
    createModelProgressCallback,
    semanticDtype,
    setRunning,
    setPaused,
    setProcessedCount,
    setErrorCount,
    setModelReady,
    setModelLoadingStage,
    setError,
    resetModelState,
  ]);

  const startBackfill = useCallback(
    (bookmarks: BookmarkForIndex[], force = false) => {
      if (!semanticEnabledRef.current) {
        queueRef.current = [];
        resetProgress();
        setPaused(false);
        setRunning(false);
        return;
      }
      if (bookmarks.length === 0) {
        resetProgress();
        return;
      }
      forceRef.current = force;
      queueRef.current = [...bookmarks];
      setProcessedCount(0);
      setErrorCount(0);
      setTotalCount(bookmarks.length);
      void runQueue();
    },
    [runQueue, resetProgress, setPaused, setRunning, setProcessedCount, setErrorCount, setTotalCount],
  );

  const pauseBackfill = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, [setPaused]);

  /** Stops indexing entirely — clears the queue so the run ends. */
  const stopBackfill = useCallback(() => {
    queueRef.current = [];
    pausedRef.current = true;
    runningRef.current = false;
    setPaused(false);
    setRunning(false);
    resetProgress();
  }, [setPaused, setRunning, resetProgress]);

  const resumeBackfill = useCallback(() => {
    if (!semanticEnabledRef.current) {
      return;
    }
    if (queueRef.current.length === 0) {
      return;
    }
    pausedRef.current = false;
    setPaused(false);
    void runQueue();
  }, [runQueue, setPaused]);

  const clearBookmarkHash = useCallback(
    async (bookmarkId: string) => {
      await deleteEmbedding({ bookmarkId: bookmarkId as Id<"bookmarks"> });
      const hashCache = getHashCache();
      delete hashCache[bookmarkId];
      setHashCache(hashCache);
    },
    [deleteEmbedding],
  );

  return useMemo(
    () => ({
      semanticDtype,
      autoIndexing,
      semanticSearchEnabled,
      isRunning,
      isPaused,
      processedCount,
      totalCount,
      errorCount,
      indexBookmark,
      startBackfill,
      pauseBackfill,
      resumeBackfill,
      stopBackfill,
      clearBookmarkHash,
    }),
    [
      semanticDtype,
      autoIndexing,
      semanticSearchEnabled,
      isRunning,
      isPaused,
      processedCount,
      totalCount,
      errorCount,
      indexBookmark,
      startBackfill,
      pauseBackfill,
      resumeBackfill,
      stopBackfill,
      clearBookmarkHash,
    ],
  );
}
