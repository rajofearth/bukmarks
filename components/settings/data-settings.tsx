"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  BookmarkIcon,
  Brain,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  FolderIcon,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
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
import { useImportBookmarks } from "@/hooks/use-import-bookmarks";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSemanticIndexer } from "@/hooks/use-semantic-indexer";
import { useSemanticIndexerStore } from "@/hooks/use-semantic-indexer-store";
import {
  downloadBookmarkFile,
  generateBookmarkHtml,
} from "@/lib/bookmark-exporter";
import { cn, formatBytes } from "@/lib/utils";
import { SectionHeader } from "./section-header";

type ExportState = "idle" | "exporting" | "done" | "error";
type DeleteState = "idle" | "deleting" | "done" | "error";

// ─── Component ───────────────────────────────────────────────────────
export function DataSettings() {
  const isMobile = useIsMobile();
  // Export
  const bookmarks = useQuery(api.bookmarks.getBookmarks);
  const folders = useQuery(api.bookmarks.getFolders);
  const embeddingStats = useQuery(api.bookmarks.getEmbeddingIndexStats);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Import
  const {
    importState,
    setImportState,
    isDragging,
    fileInputRef,
    handleImport,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInput,
  } = useImportBookmarks();
  const deleteAllData = useMutation(api.bookmarks.deleteAllData);
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
  } = useSemanticIndexer();
  const modelLoadingStage = useSemanticIndexerStore(
    (state) => state.modelLoadingStage,
  );
  const modelLoadingProgress = useSemanticIndexerStore(
    (state) => state.modelLoadingProgress,
  );
  const modelLoadingFile = useSemanticIndexerStore(
    (state) => state.modelLoadingFile,
  );
  const modelLoadingLoaded = useSemanticIndexerStore(
    (state) => state.modelLoadingLoaded,
  );
  const modelLoadingTotal = useSemanticIndexerStore(
    (state) => state.modelLoadingTotal,
  );
  const modelLoadingSpeedBytesPerSec = useSemanticIndexerStore(
    (state) => state.modelLoadingSpeedBytesPerSec,
  );
  const modelLoadingDtype = useSemanticIndexerStore(
    (state) => state.modelLoadingDtype,
  );

  // ── Export handler ───────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!bookmarks || !folders) return;
    setExportState("exporting");

    try {
      const exportFolders = folders.map((f) => ({
        _id: f._id,
        name: f.name,
        parentId: f.parentId,
        createdAt: f.createdAt,
      }));

      const exportBookmarks = bookmarks.map((b) => ({
        title: b.title,
        url: b.url,
        favicon: b.favicon,
        createdAt: b.createdAt,
        folderId: b.folderId,
      }));

      const html = generateBookmarkHtml(exportBookmarks, exportFolders);
      downloadBookmarkFile(html);
      setExportState("done");

      // Reset after a few seconds
      setTimeout(() => setExportState("idle"), 3000);
    } catch {
      setExportState("error");
      setTimeout(() => setExportState("idle"), 3000);
    }
  }, [bookmarks, folders]);

  const isDataLoading = bookmarks === undefined || folders === undefined;
  const isDeleteConfirmationValid =
    confirmText.trim().toUpperCase() === "DELETE";
  const hasUserData =
    (bookmarks?.length ?? 0) > 0 || (folders?.length ?? 0) > 0;
  const hasBookmarksForIndexing = (bookmarks?.length ?? 0) > 0;
  const canRunSemanticIndexing =
    semanticSearchEnabled && hasBookmarksForIndexing;
  const indexProgress =
    totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  const modelProgressRounded = Math.round(modelLoadingProgress);
  const isFullyIndexed =
    (embeddingStats?.indexedBookmarks ?? 0) ===
      (embeddingStats?.totalBookmarks ?? 0) &&
    (embeddingStats?.pendingBookmarks ?? 0) === 0 &&
    (embeddingStats?.totalBookmarks ?? 0) > 0;

  const toIndexPayload = useCallback(() => {
    return (bookmarks ?? []).map((bookmark) => ({
      id: bookmark._id,
      title: bookmark.title,
      url: bookmark.url,
      description: bookmark.description,
    }));
  }, [bookmarks]);

  const handleDeleteAllData = useCallback(async () => {
    if (!isDeleteConfirmationValid || deleteState === "deleting") return;

    setDeleteState("deleting");
    try {
      const result = await deleteAllData({});
      setDeleteState("done");
      toast.success("All bookmark data deleted", {
        description: `${result.bookmarksDeleted} bookmarks and ${result.foldersDeleted} folders removed.`,
      });

      setTimeout(() => {
        setConfirmOpen(false);
        setConfirmText("");
        setDeleteState("idle");
      }, 600);
    } catch {
      setDeleteState("error");
      toast.error("Failed to delete data", {
        description: "Please try again in a moment.",
      });
    }
  }, [deleteAllData, deleteState, isDeleteConfirmationValid]);

  const handleStartIndexing = useCallback(
    (force = false) => {
      startBackfill(toIndexPayload(), force);
    },
    [startBackfill, toIndexPayload],
  );

  return (
    <>
      <SectionHeader
        title="Data"
        description="Import and export your bookmarks."
        compact={isMobile}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="max-w-2xl space-y-6"
      >
        {/* ── Export Section ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className={cn("space-y-4", isMobile && "space-y-3")}
        >
          <div className="space-y-1">
            <h3 className="text-base font-medium">Export Bookmarks</h3>
            <p className="text-sm text-muted-foreground">
              Download all your bookmarks as an HTML file compatible with any
              browser.
            </p>
          </div>

          <div
            className={cn(
              "rounded-xl border border-border bg-muted/20",
              isMobile ? "p-4" : "p-5",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Download className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  {isDataLoading ? (
                    <div className="space-y-1.5">
                      <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-36 rounded bg-muted animate-pulse" />
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                        <span className="whitespace-nowrap">
                          {bookmarks.length} bookmarks
                        </span>
                        {folders.length > 0 && (
                          <>
                            <span className="text-muted-foreground" aria-hidden>
                              ·
                            </span>
                            <span className="whitespace-nowrap">
                              {folders.length} folders
                            </span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Netscape Bookmark File Format
                      </p>
                    </>
                  )}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {exportState === "idle" && (
                  <motion.button
                    key="export-btn"
                    type="button"
                    onClick={handleExport}
                    disabled={isDataLoading}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5 rounded-lg bg-foreground text-background px-4 py-2 text-xs font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <Download className="size-3.5" />
                    Export
                  </motion.button>
                )}
                {exportState === "exporting" && (
                  <motion.div
                    key="export-loading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-2"
                  >
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </motion.div>
                )}
                {exportState === "done" && (
                  <motion.div
                    key="export-done"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 20,
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-green-600 dark:text-green-400"
                  >
                    <CheckCircle2 className="size-4" />
                    Downloaded
                  </motion.div>
                )}
                {exportState === "error" && (
                  <motion.div
                    key="export-error"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-destructive"
                  >
                    <AlertCircle className="size-3.5" />
                    Failed
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: 0.12,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className={cn("space-y-4 pt-4", isMobile && "space-y-3")}
        >
          <div className="space-y-1">
            <h3 className="text-base font-medium">Semantic Search Index</h3>
            <p className="text-sm text-muted-foreground">
              Generate embeddings in your browser and store vectors in Convex.
            </p>
          </div>

          <div
            className={cn(
              "rounded-xl border border-border bg-muted/20",
              isMobile ? "p-4" : "p-5",
            )}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Brain className="size-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Runtime dtype</p>
                </div>
                <Select
                  value={semanticDtype}
                  onValueChange={(value) =>
                    updateSettings({
                      semanticDtype: value as "q4" | "q8" | "fp32",
                    })
                  }
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="q4">q4</SelectItem>
                    <SelectItem value="q8">q8</SelectItem>
                    <SelectItem value="fp32">fp32</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                  <p className="text-muted-foreground">Indexed</p>
                  <p className="text-sm font-medium tabular-nums">
                    {embeddingStats?.indexedBookmarks ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                  <p className="text-muted-foreground">Pending</p>
                  <p className="text-sm font-medium tabular-nums">
                    {embeddingStats?.pendingBookmarks ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                  <p className="text-muted-foreground">Stale</p>
                  <p className="text-sm font-medium tabular-nums">
                    {embeddingStats?.staleBookmarks ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-sm font-medium tabular-nums">
                    {embeddingStats?.totalBookmarks ?? 0}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Semantic search enabled</span>
                  <Switch
                    checked={semanticSearchEnabled}
                    onCheckedChange={(checked) =>
                      updateSettings({
                        semanticSearchEnabled: checked,
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Auto-index on add/edit</span>
                  <Switch
                    checked={semanticAutoIndexing}
                    onCheckedChange={(checked) =>
                      updateSettings({
                        semanticAutoIndexing: checked,
                      })
                    }
                  />
                </div>
              </div>

              {isRunning && !isPaused && (
                <div className="space-y-2">
                  {modelLoadingStage !== "idle" &&
                  modelLoadingStage !== "done" ? (
                    <>
                      <div className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
                        {modelLoadingProgress === 0 &&
                        !(modelLoadingLoaded > 0 && modelLoadingTotal > 0) ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin" />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          {modelLoadingStage === "initiate"
                            ? "Preparing model..."
                            : modelLoadingStage === "download" ||
                                modelLoadingStage === "progress"
                              ? `Downloading ${modelLoadingFile ?? "model"}${
                                  modelLoadingDtype
                                    ? ` (${modelLoadingDtype})`
                                    : ""
                                }...`
                              : "Loading model into memory..."}
                        </span>
                        {(modelLoadingProgress > 0 ||
                          (modelLoadingLoaded > 0 &&
                            modelLoadingTotal > 0)) && (
                          <span className="shrink-0 tabular-nums">
                            {modelLoadingProgress > 0
                              ? `${modelProgressRounded}%`
                              : `${Math.round(
                                  (modelLoadingLoaded / modelLoadingTotal) *
                                    100,
                                )}%`}
                          </span>
                        )}
                      </div>
                      {(modelLoadingLoaded > 0 && modelLoadingTotal > 0) ||
                      modelLoadingProgress > 0 ? (
                        <div className="space-y-1">
                          {(modelLoadingLoaded > 0 ||
                            modelLoadingTotal > 0) && (
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>
                                {formatBytes(modelLoadingLoaded)} /{" "}
                                {formatBytes(modelLoadingTotal)}
                              </span>
                              {modelLoadingSpeedBytesPerSec > 0 && (
                                <span className="tabular-nums">
                                  · {formatBytes(modelLoadingSpeedBytesPerSec)}
                                  /s
                                </span>
                              )}
                            </div>
                          )}
                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                            <motion.div
                              className="h-full rounded-full bg-foreground/70"
                              initial={{ width: 0 }}
                              animate={{
                                width: `${
                                  modelLoadingProgress > 0
                                    ? modelLoadingProgress
                                    : modelLoadingTotal > 0
                                      ? (modelLoadingLoaded /
                                          modelLoadingTotal) *
                                        100
                                      : 0
                                }%`,
                              }}
                              transition={{
                                duration: 0.3,
                                ease: "easeOut",
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        modelLoadingStage === "loading" && (
                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                            <motion.div
                              className="h-full rounded-full bg-foreground/70"
                              animate={{
                                width: ["30%", "70%", "30%"],
                              }}
                              transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            />
                          </div>
                        )
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Indexing {processedCount} / {totalCount}
                        </span>
                        <span className="tabular-nums">{indexProgress}%</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full rounded-full bg-foreground/70"
                          initial={{ width: 0 }}
                          animate={{ width: `${indexProgress}%` }}
                          transition={{
                            duration: 0.3,
                            ease: "easeOut",
                          }}
                        />
                      </div>
                    </>
                  )}
                  {errorCount > 0 && (
                    <p className="text-xs text-destructive">
                      Failed items: {errorCount}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!isRunning && (
                  <button
                    type="button"
                    onClick={() => handleStartIndexing(false)}
                    disabled={!canRunSemanticIndexing || isFullyIndexed}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
                  >
                    <Play className="size-3.5" />
                    Start
                  </button>
                )}
                {isRunning && !isPaused && (
                  <button
                    type="button"
                    onClick={pauseBackfill}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium"
                  >
                    <Pause className="size-3.5" />
                    Pause
                  </button>
                )}
                {isPaused && (
                  <button
                    type="button"
                    onClick={resumeBackfill}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium"
                  >
                    <Play className="size-3.5" />
                    Resume
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleStartIndexing(true)}
                  disabled={isRunning}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
                >
                  {isRunning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Reindex all
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        <Separator className="my-0" />

        {/* ── Import Section ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: 0.08,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className={cn("space-y-4 pt-4", isMobile && "space-y-3")}
        >
          <div className="space-y-1">
            <h3 className="text-base font-medium">Import Bookmarks</h3>
            <p className="text-sm text-muted-foreground">
              Upload an HTML bookmark file exported from any browser.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {/* Dropzone */}
            {(importState.status === "idle" ||
              importState.status === "error") && (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-3"
              >
                <button
                  type="button"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200",
                    isDragging
                      ? "border-foreground/30 bg-muted/60 scale-[1.01]"
                      : "border-border hover:border-foreground/20 hover:bg-muted/30",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".html,.htm"
                    onChange={handleFileInput}
                    className="sr-only"
                    aria-label="Upload bookmark file"
                  />

                  <div className="flex flex-col items-center gap-3">
                    <motion.div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-lg transition-colors",
                        isDragging ? "bg-foreground/10" : "bg-muted",
                      )}
                      animate={isDragging ? { scale: 1.08 } : { scale: 1 }}
                    >
                      <Upload className="size-4 text-muted-foreground" />
                    </motion.div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Drop your file here</p>
                      <p className="text-xs text-muted-foreground">
                        or click to pick it
                      </p>
                    </div>
                  </div>
                </button>

                {importState.status === "error" && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
                  >
                    <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                    <span>{importState.message}</span>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Parsing */}
            {importState.status === "parsing" && (
              <motion.div
                key="parsing"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 p-10"
              >
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Reading bookmarks…
                </p>
              </motion.div>
            )}

            {/* Preview */}
            {importState.status === "previewing" && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-border bg-muted/20 p-6 space-y-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <FileText className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {importState.fileName}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <BookmarkIcon className="size-3" />
                        {importState.bookmarkCount} bookmarks
                      </span>
                      {importState.folderCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <FolderIcon className="size-3" />
                          {importState.folderCount} folders
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setImportState({ status: "idle" })}
                    className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-2 text-xs font-medium hover:bg-foreground/90 transition-colors"
                  >
                    Import all
                    <ChevronRight className="size-3" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Importing progress */}
            {importState.status === "importing" && (
              <motion.div
                key="importing"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-border bg-muted/20 p-6 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Importing…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {importState.imported} of {importState.total}
                    </p>
                  </div>
                </div>

                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-foreground/70"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(importState.imported / importState.total) * 100}%`,
                    }}
                    transition={{
                      duration: 0.3,
                      ease: "easeOut",
                    }}
                  />
                </div>
              </motion.div>
            )}

            {/* Done */}
            {importState.status === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 p-10"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    delay: 0.1,
                  }}
                >
                  <CheckCircle2 className="size-8 text-green-500" />
                </motion.div>
                <div className="text-center">
                  <p className="text-sm font-medium">All done!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {importState.imported} bookmarks imported
                    {importState.folders > 0
                      ? ` into ${importState.folders} folders`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportState({ status: "idle" })}
                  className="mt-2 rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  Import more
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <Separator className="my-0" />

        {/* ── Danger Zone ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: 0.14,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className={cn("space-y-4 pt-4", isMobile && "space-y-3")}
        >
          <div className="space-y-1">
            <h3 className="text-base font-medium">Danger Zone</h3>
            <p className="text-sm text-muted-foreground">
              Permanently delete all bookmarks and folders from your account.
            </p>
          </div>

          <div
            className={cn(
              "rounded-xl border border-destructive/20 bg-destructive/[0.03]",
              isMobile ? "p-4" : "p-5",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Trash2 className="size-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Delete all data</p>
                  <p className="text-xs text-muted-foreground">
                    This action is irreversible and removes all imported and
                    created bookmark data.
                  </p>
                </div>
              </div>

              <AlertDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                  setConfirmOpen(open);
                  if (!open) {
                    setConfirmText("");
                    setDeleteState("idle");
                  }
                }}
              >
                <AlertDialogTrigger asChild>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    disabled={!hasUserData || isDataLoading}
                    className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Nuke data
                  </motion.button>
                </AlertDialogTrigger>

                <AlertDialogContent size="default">
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/10 text-destructive">
                      <ShieldAlert className="size-8" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>
                      Delete all bookmark data?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove all your bookmarks and
                      folders. Type{" "}
                      <span className="font-semibold">DELETE</span> to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="space-y-2">
                    <Input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      disabled={deleteState === "deleting"}
                      className="font-mono text-sm"
                    />

                    <AnimatePresence mode="wait">
                      {deleteState === "error" && (
                        <motion.p
                          key="delete-error"
                          initial={{ opacity: 0, y: -2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-xs text-destructive"
                        >
                          Couldn&apos;t delete your data. Please try again.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel
                      disabled={deleteState === "deleting"}
                      onClick={() => {
                        setConfirmText("");
                        setDeleteState("idle");
                      }}
                    >
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={
                        !isDeleteConfirmationValid || deleteState === "deleting"
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteAllData();
                      }}
                    >
                      {deleteState === "deleting" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" />
                          Deleting...
                        </span>
                      ) : (
                        "Delete forever"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
