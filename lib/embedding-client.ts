"use client";

import type { EmbeddingDtype } from "@/lib/semantic-search";

type WorkerRequest =
  | {
      id: number;
      type: "embed";
      text: string;
      preferred?: EmbeddingDtype;
    }
  | {
      id: number;
      type: "warmup";
      preferred?: EmbeddingDtype;
    };

type WorkerResponse =
  | {
      id: number;
      ok: true;
      type: "embed";
      result: { vector: number[]; dtype: EmbeddingDtype };
    }
  | {
      id: number;
      ok: true;
      type: "warmup";
      result: { warmed: true };
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

let worker: Worker | null = null;
let requestCounter = 0;
const pendingRequests = new Map<
  number,
  {
    resolve: (value: WorkerResponse) => void;
    reject: (error: Error) => void;
  }
>();

function createWorker(): Worker {
  const nextWorker = new Worker(
    new URL("./workers/query-embedding.worker.ts", import.meta.url),
    { type: "module" },
  );

  nextWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const payload = event.data;
    const pending = pendingRequests.get(payload.id);
    if (!pending) {
      return;
    }
    pendingRequests.delete(payload.id);
    if (!payload.ok) {
      pending.reject(new Error(payload.error));
      return;
    }
    pending.resolve(payload);
  };

  nextWorker.onerror = () => {
    for (const [id, pending] of pendingRequests.entries()) {
      pendingRequests.delete(id);
      pending.reject(new Error("Embedding worker crashed"));
    }
    worker = null;
  };

  return nextWorker;
}

function getWorker(): Worker {
  if (!worker) {
    worker = createWorker();
  }
  return worker;
}

async function requestWorker(payload: Omit<WorkerRequest, "id">) {
  if (typeof window === "undefined") {
    throw new Error("Embedding worker is only available in browser context");
  }

  const id = ++requestCounter;
  const message = { ...payload, id } as WorkerRequest;

  const response = await new Promise<WorkerResponse>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    getWorker().postMessage(message);
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response;
}

export async function embedBookmarkDocument(
  text: string,
  preferred?: EmbeddingDtype,
) {
  const runtime = await import("@/lib/embedding-runtime");
  return runtime.embedBookmarkDocument(text, preferred);
}

export async function embedBookmarkQuery(
  text: string,
  preferred?: EmbeddingDtype,
) {
  if (typeof window === "undefined") {
    const runtime = await import("@/lib/embedding-runtime");
    return runtime.embedBookmarkQuery(text, preferred);
  }
  const embedPayload = {
    type: "embed" as const,
    text,
    preferred,
  };
  const response = await requestWorker(embedPayload);
  if (response.type !== "embed") {
    throw new Error("Unexpected worker response type");
  }
  return response.result;
}

export async function warmupEmbeddingModel(preferred?: EmbeddingDtype) {
  if (typeof window === "undefined") {
    const runtime = await import("@/lib/embedding-runtime");
    await runtime.warmupEmbeddingModel(preferred);
    return;
  }
  await requestWorker({
    type: "warmup",
    preferred,
  });
  return;
}
