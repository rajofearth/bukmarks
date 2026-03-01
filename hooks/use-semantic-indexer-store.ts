import { create } from "zustand";

export type ModelLoadingStage =
  | "idle"
  | "initiate"
  | "download"
  | "progress"
  | "loading"
  | "done";

interface SemanticIndexerState {
  isRunning: boolean;
  isPaused: boolean;
  processedCount: number;
  totalCount: number;
  errorCount: number;
  modelLoadingStage: ModelLoadingStage;
  modelLoadingProgress: number;
  modelLoadingFile: string | null;
  modelLoadingLoaded: number;
  modelLoadingTotal: number;
  modelLoadingSpeedBytesPerSec: number;
  modelLoadingDtype: string | null;
  setRunning: (running: boolean) => void;
  setPaused: (paused: boolean) => void;
  setProcessedCount: (count: number | ((prev: number) => number)) => void;
  setTotalCount: (count: number) => void;
  setErrorCount: (count: number | ((prev: number) => number)) => void;
  setModelLoadingStage: (stage: ModelLoadingStage) => void;
  setModelLoadingProgress: (progress: number) => void;
  setModelLoadingFile: (file: string | null) => void;
  setModelLoadingLoaded: (loaded: number) => void;
  setModelLoadingTotal: (total: number) => void;
  setModelLoadingSpeedBytesPerSec: (speed: number) => void;
  setModelLoadingDtype: (dtype: string | null) => void;
  resetProgress: () => void;
}

export const useSemanticIndexerStore = create<SemanticIndexerState>()(
  (set) => ({
    isRunning: false,
    isPaused: false,
    processedCount: 0,
    totalCount: 0,
    errorCount: 0,
    modelLoadingStage: "idle",
    modelLoadingProgress: 0,
    modelLoadingFile: null,
    modelLoadingLoaded: 0,
    modelLoadingTotal: 0,
    modelLoadingSpeedBytesPerSec: 0,
    modelLoadingDtype: null,
    setRunning: (running) => set({ isRunning: running }),
    setPaused: (paused) => set({ isPaused: paused }),
    setProcessedCount: (count) =>
      set((state) => ({
        processedCount:
          typeof count === "function" ? count(state.processedCount) : count,
      })),
    setTotalCount: (totalCount) => set({ totalCount }),
    setErrorCount: (count) =>
      set((state) => ({
        errorCount: typeof count === "function" ? count(state.errorCount) : count,
      })),
    setModelLoadingStage: (modelLoadingStage) =>
      set({ modelLoadingStage }),
    setModelLoadingProgress: (modelLoadingProgress) =>
      set({ modelLoadingProgress }),
    setModelLoadingFile: (modelLoadingFile) => set({ modelLoadingFile }),
    setModelLoadingLoaded: (modelLoadingLoaded) =>
      set({ modelLoadingLoaded }),
    setModelLoadingTotal: (modelLoadingTotal) =>
      set({ modelLoadingTotal }),
    setModelLoadingSpeedBytesPerSec: (modelLoadingSpeedBytesPerSec) =>
      set({ modelLoadingSpeedBytesPerSec }),
    setModelLoadingDtype: (modelLoadingDtype) => set({ modelLoadingDtype }),
    resetProgress: () =>
      set({
        processedCount: 0,
        totalCount: 0,
        errorCount: 0,
        modelLoadingStage: "idle",
        modelLoadingProgress: 0,
        modelLoadingFile: null,
        modelLoadingLoaded: 0,
        modelLoadingTotal: 0,
        modelLoadingSpeedBytesPerSec: 0,
        modelLoadingDtype: null,
      }),
  }),
);
