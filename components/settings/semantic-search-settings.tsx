"use client";

import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Brain,
  Check,
  HardDrive,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { useGeneralStore } from "@/hooks/use-general-store";
import { useSemanticIndexer } from "@/hooks/use-semantic-indexer";
import { useSemanticIndexerStore } from "@/hooks/use-semantic-indexer-store";
import { EMBEDDING_MODEL_ID, type EmbeddingDtype } from "@/lib/semantic-search";
import { formatBytes } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.ceil(seconds);
  if (total < 60) return `~${total}s left`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `~${mins}m ${secs}s left`;
}

// ─── Progress Bar ────────────────────────────────────────────────────

function ProgressBar({
  value,
  indeterminate = false,
}: {
  value: number;
  indeterminate?: boolean;
}) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
      {indeterminate ? (
        <motion.div
          className="h-full rounded-full bg-foreground/60"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: "40%" }}
        />
      ) : (
        <div
          className="h-full rounded-full bg-foreground/60 transition-[width] duration-300 ease-out"
          style={{ width: `${value}%` }}
        />
      )}
    </div>
  );
}

// ─── Phase types ─────────────────────────────────────────────────────

type Phase = "idle" | "model" | "indexing" | "error" | "done";

// ─── Progress Display ────────────────────────────────────────────────

function ProgressDisplay({
  phase,
  modelLoadingStage,
  modelLoadingProgress,
  modelLoadingDtype,
  modelLoadingSpeedBytesPerSec,
  fileProgress,
  processedCount,
  totalCount,
  errorCount,
  indexEta,
  error,
}: {
  phase: Phase;
  modelLoadingStage: string;
  modelLoadingProgress: number;
  modelLoadingDtype: string | null;
  modelLoadingSpeedBytesPerSec: number;
  fileProgress: Record<string, { loaded: number; total: number }>;
  processedCount: number;
  totalCount: number;
  errorCount: number;
  indexEta: string;
  error: string | null;
}) {
  // ── Model loading ─────────────────────────────────────────────────
  if (phase === "model") {
    const isDownloading =
      modelLoadingStage === "download" || modelLoadingStage === "progress";
    const isLoadingInMem = modelLoadingStage === "loading";

    // Aggregate bytes across all files
    const files = Object.entries(fileProgress);
    const aggLoaded = files.reduce((s, [, v]) => s + v.loaded, 0);
    const aggTotal = files.reduce((s, [, v]) => s + v.total, 0);
    const hasAggBytes = aggLoaded > 0 && aggTotal > 0;

    const pct = isDownloading
      ? hasAggBytes
        ? Math.round((aggLoaded / aggTotal) * 100)
        : modelLoadingProgress > 0
          ? Math.round(modelLoadingProgress)
          : undefined
      : isLoadingInMem && modelLoadingProgress > 0
        ? Math.round(modelLoadingProgress)
        : undefined;

    const indeterminate = pct === undefined;

    const label = isDownloading
      ? "Downloading model…"
      : isLoadingInMem
        ? "Loading model…"
        : "Preparing model…";

    const dtypeStr =
      isDownloading && modelLoadingDtype
        ? modelLoadingDtype.toUpperCase()
        : null;
    const speedStr =
      isDownloading && modelLoadingSpeedBytesPerSec > 0
        ? `${formatBytes(modelLoadingSpeedBytesPerSec)}/s`
        : null;
    const bytesLine =
      isDownloading && hasAggBytes
        ? `${formatBytes(aggLoaded)} / ${formatBytes(aggTotal)}`
        : null;
    const sublabelParts = [dtypeStr, speedStr].filter(Boolean);
    const sublabel = sublabelParts.join(" · ") || null;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 min-w-0">
            <Loader2 className="size-3 shrink-0 animate-spin" />
            <span className="truncate">{label}</span>
          </div>
          {!indeterminate && (
            <span className="shrink-0 tabular-nums">{pct}%</span>
          )}
        </div>
        {(bytesLine || sublabel) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 tabular-nums -mt-0.5">
            {bytesLine && <span>{bytesLine}</span>}
            {sublabel && <span>· {sublabel}</span>}
          </div>
        )}
        <ProgressBar value={pct ?? 0} indeterminate={indeterminate} />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <AlertTriangle className="size-3 shrink-0" />
        <span className="truncate">{error ?? "Unknown error"}</span>
      </div>
    );
  }

  // ── Indexing ──────────────────────────────────────────────────────
  if (phase === "indexing" || phase === "done") {
    const pct =
      totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {phase === "done" ? (
            <div className="flex items-center gap-1.5">
              <Check className="size-3 shrink-0" />
              <span>Indexing complete</span>
            </div>
          ) : (
            <span>
              Indexing {processedCount} / {totalCount}
              {indexEta && (
                <span className="text-muted-foreground/70"> · {indexEta}</span>
              )}
            </span>
          )}
          <span className="shrink-0 tabular-nums">{pct}%</span>
        </div>
        <ProgressBar value={pct} />
        {errorCount > 0 && (
          <p className="text-xs text-destructive">Failed: {errorCount}</p>
        )}
      </div>
    );
  }

  return null;
}

// ─── Stat Item ───────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

// ─── Model Cache Manager ─────────────────────────────────────────────

const TRANSFORMERS_CACHE_NAME = "transformers-cache";

async function getModelCacheSize(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const keys = await cache.keys();
    const modelKeys = keys.filter((req) =>
      req.url.includes(EMBEDDING_MODEL_ID),
    );
    let total = 0;
    for (const req of modelKeys) {
      const res = await cache.match(req);
      if (!res) continue;
      const contentLengthHeader = res.headers.get("content-length");
      const contentLength = contentLengthHeader
        ? Number.parseInt(contentLengthHeader, 10)
        : Number.NaN;
      if (Number.isFinite(contentLength) && contentLength >= 0) {
        total += contentLength;
        continue;
      }
      const blob = await res.blob();
      total += blob.size;
    }
    return total;
  } catch {
    return 0;
  }
}

async function deleteModelCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const keys = await cache.keys();
    const modelKeys = keys.filter((req) =>
      req.url.includes(EMBEDDING_MODEL_ID),
    );
    await Promise.all(modelKeys.map((req) => cache.delete(req)));
  } catch {
    // ignore
  }
}

function ModelCacheManager({
  fileProgress,
}: {
  fileProgress: Record<string, { loaded: number; total: number }>;
}) {
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const prevFileCountRef = useRef(0);

  const refresh = useCallback(async () => {
    const size = await getModelCacheSize();
    setCacheSize(size);
  }, []);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh when modelReady flips to true (download just finished)
  const modelReady = useSemanticIndexerStore((s) => s.modelReady);
  useEffect(() => {
    if (modelReady) void refresh();
  }, [modelReady, refresh]);

  // Refresh when a new file appears in fileProgress (file completed → written to cache)
  useEffect(() => {
    const fileCount = Object.keys(fileProgress).length;
    if (fileCount > prevFileCountRef.current) {
      prevFileCountRef.current = fileCount;
      void refresh();
    }
  }, [fileProgress, refresh]);

  // Reset counter when fileProgress is cleared (new run)
  useEffect(() => {
    if (Object.keys(fileProgress).length === 0) {
      prevFileCountRef.current = 0;
    }
  }, [fileProgress]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    await deleteModelCache();
    await refresh();
    setIsDeleting(false);
  }, [refresh]);

  const hasCache = cacheSize !== null && cacheSize > 0;

  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <div className="flex items-center gap-2 min-w-0">
        <HardDrive className="size-4 text-muted-foreground shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm">Model cache</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {cacheSize === null
              ? "Checking…"
              : cacheSize === 0
                ? "No cached model files"
                : formatBytes(cacheSize)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={!hasCache || isDeleting}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive disabled:opacity-40 disabled:cursor-not-allowed hover:bg-destructive/10 transition-colors"
      >
        {isDeleting ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Trash2 className="size-3" />
        )}
        Delete
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function SemanticSearchSettings() {
  const embeddingStats = useQuery(api.bookmarks.getEmbeddingIndexStats);
  const bookmarks = useQuery(api.bookmarks.getBookmarks);

  const {
    updateSettings,
    semanticDtype,
    semanticAutoIndexing,
    semanticSearchEnabled,
  } = useGeneralStore();

  const {
    isRunning,
    isPaused,
    processedCount,
    totalCount,
    errorCount,
    startBackfill,
    pauseBackfill,
    resumeBackfill,
    stopBackfill,
  } = useSemanticIndexer();

  const modelReady = useSemanticIndexerStore((s) => s.modelReady);
  const modelLoadingStage = useSemanticIndexerStore((s) => s.modelLoadingStage);
  const modelLoadingProgress = useSemanticIndexerStore(
    (s) => s.modelLoadingProgress,
  );
  const modelLoadingSpeedBytesPerSec = useSemanticIndexerStore(
    (s) => s.modelLoadingSpeedBytesPerSec,
  );
  const modelLoadingDtype = useSemanticIndexerStore((s) => s.modelLoadingDtype);
  const fileProgress = useSemanticIndexerStore((s) => s.fileProgress);
  const error = useSemanticIndexerStore((s) => s.error);

  // ── Derive phase — pure computation, no state machine ─────────────
  // Only show "model" phase when there's actual loading activity.
  // If model resolves from memory cache, modelLoadingStage stays "idle"
  // and we skip straight to indexing.
  const isModelLoading =
    isRunning &&
    !modelReady &&
    modelLoadingStage !== "idle" &&
    modelLoadingStage !== "done";
  const phase: Phase = error
    ? "error"
    : isModelLoading
      ? "model"
      : isRunning && processedCount < totalCount
        ? "indexing"
        : isRunning && processedCount >= totalCount && totalCount > 0
          ? "done"
          : "idle";

  // ── ETA for indexing ─────────────────────────────────────────────
  const indexStartTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (processedCount === 0 && isRunning && modelReady) {
      indexStartTimeRef.current = Date.now();
    }
  }, [processedCount, isRunning, modelReady]);

  const remaining = totalCount - processedCount;
  let indexEta = "";
  if (
    processedCount > 0 &&
    remaining > 0 &&
    indexStartTimeRef.current !== null
  ) {
    const elapsed = (Date.now() - indexStartTimeRef.current) / 1000;
    const rate = processedCount / elapsed;
    if (rate > 0) indexEta = formatEta(remaining / rate);
  }

  // ── Show progress area ────────────────────────────────────────────
  const showProgress = phase !== "idle";

  // ─── Derived ─────────────────────────────────────────────────────
  const hasBookmarks = (bookmarks?.length ?? 0) > 0;
  const canIndex = semanticSearchEnabled && hasBookmarks;
  const runtimeDtypeLabelId = useId();
  const isFullyIndexed =
    (embeddingStats?.indexedBookmarks ?? 0) ===
      (embeddingStats?.totalBookmarks ?? 0) &&
    (embeddingStats?.pendingBookmarks ?? 0) === 0 &&
    (embeddingStats?.staleBookmarks ?? 0) === 0 &&
    (embeddingStats?.totalBookmarks ?? 0) > 0;

  const toIndexPayload = useCallback(
    () =>
      (bookmarks ?? []).map((b) => ({
        id: b._id,
        title: b.title,
        url: b.url,
        description: b.description,
      })),
    [bookmarks],
  );

  const handleStart = useCallback(
    (force = false) => startBackfill(toIndexPayload(), force),
    [startBackfill, toIndexPayload],
  );

  const rowClass = "flex items-center justify-between gap-3 py-3";

  return (
    <div className="space-y-1">
      <h3 className="text-base font-medium">Semantic Search</h3>
      <p className="text-sm text-muted-foreground">
        Generate embeddings locally and store vectors in Convex.
      </p>

      <div className="pt-4 space-y-0">
        {/* Dtype */}
        <div className={rowClass}>
          <div className="flex items-center gap-2">
            <Brain className="size-4 text-muted-foreground shrink-0" />
            <span id={runtimeDtypeLabelId} className="text-sm">
              Runtime dtype
            </span>
          </div>
          <Select
            value={semanticDtype}
            onValueChange={(value) =>
              updateSettings({ semanticDtype: value as EmbeddingDtype })
            }
          >
            <SelectTrigger
              aria-labelledby={runtimeDtypeLabelId}
              className="w-24 h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="q4">q4</SelectItem>
              <SelectItem value="q8">q8</SelectItem>
              <SelectItem value="fp32">fp32</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Enabled toggle */}
        <div className={rowClass}>
          <span id="semantic-search-label" className="text-sm">
            Semantic search enabled
          </span>
          <Switch
            id="semantic-search-switch"
            aria-labelledby="semantic-search-label"
            checked={semanticSearchEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ semanticSearchEnabled: checked })
            }
          />
        </div>

        <Separator />

        {/* Auto-index toggle */}
        <div className={rowClass}>
          <span id="semantic-auto-index-label" className="text-sm">
            Auto-index on add / edit
          </span>
          <Switch
            id="semantic-auto-index-switch"
            aria-labelledby="semantic-auto-index-label"
            checked={semanticAutoIndexing}
            onCheckedChange={(checked) =>
              updateSettings({ semanticAutoIndexing: checked })
            }
          />
        </div>

        <Separator />

        {/* Stats row */}
        <div className="flex items-center gap-6 py-3">
          <StatItem
            label="Indexed"
            value={embeddingStats?.indexedBookmarks ?? 0}
          />
          <StatItem
            label="Pending"
            value={embeddingStats?.pendingBookmarks ?? 0}
          />
          <StatItem label="Stale" value={embeddingStats?.staleBookmarks ?? 0} />
          <StatItem label="Total" value={embeddingStats?.totalBookmarks ?? 0} />
        </div>

        {/* Progress */}
        <AnimatePresence initial={false}>
          {showProgress && (
            <motion.div
              key="progress-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden pb-3"
            >
              <ProgressDisplay
                phase={phase}
                modelLoadingStage={modelLoadingStage}
                modelLoadingProgress={modelLoadingProgress}
                modelLoadingDtype={modelLoadingDtype}
                modelLoadingSpeedBytesPerSec={modelLoadingSpeedBytesPerSec}
                fileProgress={fileProgress}
                processedCount={processedCount}
                totalCount={totalCount}
                errorCount={errorCount}
                indexEta={indexEta}
                error={error}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons — adapt to current phase */}
        <div className="flex flex-wrap gap-2 py-3">
          {/* Model loading: Stop */}
          {phase === "model" && (
            <button
              type="button"
              onClick={stopBackfill}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/60 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Pause className="size-3" />
              Stop
            </button>
          )}

          {/* Error: Retry */}
          {phase === "error" && (
            <button
              type="button"
              onClick={() => handleStart(false)}
              disabled={!canIndex}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="size-3" />
              Retry
            </button>
          )}

          {/* Idle / Done: Start */}
          {(phase === "idle" || phase === "done") && (
            <button
              type="button"
              onClick={() => handleStart(false)}
              disabled={!canIndex || isFullyIndexed}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="size-3" />
              Start
            </button>
          )}

          {/* Indexing: Pause */}
          {phase === "indexing" && !isPaused && (
            <button
              type="button"
              onClick={pauseBackfill}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
            >
              <Pause className="size-3" />
              Pause
            </button>
          )}

          {/* Paused: Resume */}
          {isPaused && (
            <button
              type="button"
              onClick={resumeBackfill}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
            >
              <Play className="size-3" />
              Resume
            </button>
          )}

          {/* Reindex all — always present, disabled while running */}
          {phase !== "error" && (
            <button
              type="button"
              onClick={() => {
                if (canIndex) {
                  handleStart(true);
                }
              }}
              disabled={!canIndex || isRunning}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Reindex all
            </button>
          )}
        </div>

        <Separator />

        {/* Model Cache */}
        <ModelCacheManager fileProgress={fileProgress} />
      </div>
    </div>
  );
}
