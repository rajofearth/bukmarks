import {
  AutoModel,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import {
  DOCUMENT_PREFIX,
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
  type EmbeddingDtype,
  normalizeVector,
  QUERY_PREFIX,
} from "@/lib/semantic-search";

export type ModelLoadProgressInfo = {
  status?: string;
  progress?: number;
  file?: string;
  name?: string;
  loaded?: number;
  total?: number;
};

type ModelBundle = {
  dtype: EmbeddingDtype;
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
};

type QueryEmbeddingCacheEntry = {
  dtype: EmbeddingDtype;
  vector: number[];
};

let loadedBundlePromise: Promise<ModelBundle> | null = null;
let loadedBundleKey = "";
const QUERY_CACHE_LIMIT = 64;
const queryEmbeddingCache = new Map<string, QueryEmbeddingCacheEntry>();

function normalizeCacheKey(text: string, dtype?: EmbeddingDtype) {
  return `${dtype ?? "auto"}::${text.trim()}`;
}

function touchCacheEntry(key: string, value: QueryEmbeddingCacheEntry) {
  queryEmbeddingCache.delete(key);
  queryEmbeddingCache.set(key, value);
  if (queryEmbeddingCache.size > QUERY_CACHE_LIMIT) {
    const oldestKey = queryEmbeddingCache.keys().next().value as
      | string
      | undefined;
    if (oldestKey) {
      queryEmbeddingCache.delete(oldestKey);
    }
  }
}

function getDefaultDtype(): EmbeddingDtype {
  if (typeof navigator === "undefined") {
    return "q8";
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) {
    return "q4";
  }
  return "q8";
}

function getDtypeOrder(preferred?: EmbeddingDtype): EmbeddingDtype[] {
  const seed = preferred ?? getDefaultDtype();
  if (seed === "fp32") {
    return ["fp32", "q8", "q4"];
  }
  if (seed === "q8") {
    return ["q8", "q4", "fp32"];
  }
  return ["q4", "q8", "fp32"];
}

export async function loadEmbeddingBundle(
  preferred?: EmbeddingDtype,
  progressCallback?: (info: ModelLoadProgressInfo) => void,
): Promise<ModelBundle> {
  env.allowLocalModels = false;
  const dtypeOrder = getDtypeOrder(preferred);
  let lastError: unknown;

  for (const dtype of dtypeOrder) {
    const cacheKey = `${EMBEDDING_MODEL_ID}:${dtype}`;
    if (loadedBundlePromise && loadedBundleKey === cacheKey) {
      try {
        return await loadedBundlePromise;
      } catch (error) {
        loadedBundlePromise = null;
        loadedBundleKey = "";
        lastError = error;
        continue;
      }
    }

    loadedBundleKey = cacheKey;
    loadedBundlePromise = (async () => {
      const tokenizer = await AutoTokenizer.from_pretrained(
        EMBEDDING_MODEL_ID,
        progressCallback
          ? {
              progress_callback: (info: {
                status?: string;
                progress?: number;
                file?: string;
                name?: string;
                loaded?: number;
                total?: number;
              }) => {
                progressCallback?.({
                  status: info.status,
                  progress: info.progress,
                  file: info.file,
                  name: info.name,
                  loaded: info.loaded,
                  total: info.total,
                });
              },
            }
          : undefined,
      );
      const model = await AutoModel.from_pretrained(EMBEDDING_MODEL_ID, {
        dtype,
        ...(progressCallback
          ? {
              progress_callback: (info: {
                status?: string;
                progress?: number;
                file?: string;
                name?: string;
                loaded?: number;
                total?: number;
              }) => {
                progressCallback({
                  status: info.status,
                  progress: info.progress,
                  file: info.file,
                  name: info.name,
                  loaded: info.loaded,
                  total: info.total,
                });
              },
            }
          : {}),
      });
      return { dtype, tokenizer, model };
    })();

    try {
      return await loadedBundlePromise;
    } catch (error) {
      loadedBundlePromise = null;
      loadedBundleKey = "";
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to load embedding model");
}

async function embed(
  text: string,
  prefix: string,
  preferred?: EmbeddingDtype,
  progressCallback?: (info: ModelLoadProgressInfo) => void,
) {
  const bundle = await loadEmbeddingBundle(preferred, progressCallback);
  const inputs = await bundle.tokenizer([`${prefix}${text}`], {
    padding: true,
    truncation: true,
    max_length: 512,
  });
  const output = await bundle.model(inputs);
  const embeddings = output.sentence_embedding.tolist() as number[][];
  const vector = embeddings[0].slice(0, EMBEDDING_DIM);
  return {
    dtype: bundle.dtype,
    vector: normalizeVector(vector),
  };
}

export async function embedBookmarkDocument(
  text: string,
  preferred?: EmbeddingDtype,
  progressCallback?: (info: ModelLoadProgressInfo) => void,
) {
  return embed(text, DOCUMENT_PREFIX, preferred, progressCallback);
}

export async function embedBookmarkQuery(
  text: string,
  preferred?: EmbeddingDtype,
) {
  const key = normalizeCacheKey(text, preferred);
  const cached = queryEmbeddingCache.get(key);
  if (cached) {
    touchCacheEntry(key, cached);
    return cached;
  }
  const next = await embed(text, QUERY_PREFIX, preferred);
  touchCacheEntry(key, next);
  return next;
}

export function warmupEmbeddingModel(preferred?: EmbeddingDtype) {
  return loadEmbeddingBundle(preferred);
}
