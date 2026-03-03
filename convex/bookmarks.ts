import { v } from "convex/values";
import {
  buildBookmarkEmbeddingText,
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
  hashSemanticText,
} from "../lib/semantic-search";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { authComponent, getOptionalAuthUser } from "./auth";

type EmbeddingIndexStatsState = {
  id: Id<"embeddingIndexStats">;
  totalBookmarks: number;
  indexedBookmarks: number;
  staleBookmarks: number;
  lastIndexedAt: number | null;
};

type EmbeddingIndexStatsCounts = Pick<
  EmbeddingIndexStatsState,
  "totalBookmarks" | "indexedBookmarks" | "staleBookmarks"
>;

type EmbeddingIndexStatsSnapshot = Omit<EmbeddingIndexStatsState, "id">;

const MAX_IDS_BATCH = 100;

function clampNonNegative(value: number) {
  return value < 0 ? 0 : value;
}

function hasValidEmbeddingStatsCounts(
  stats: EmbeddingIndexStatsCounts,
): boolean {
  return (
    stats.totalBookmarks >= 0 &&
    stats.indexedBookmarks >= 0 &&
    stats.staleBookmarks >= 0 &&
    stats.indexedBookmarks <= stats.totalBookmarks &&
    stats.staleBookmarks <= stats.indexedBookmarks
  );
}

function normalizeEmbeddingStatsCounts(
  stats: EmbeddingIndexStatsCounts,
): EmbeddingIndexStatsCounts {
  const totalBookmarks = clampNonNegative(stats.totalBookmarks);
  const indexedBookmarks = Math.min(
    clampNonNegative(stats.indexedBookmarks),
    totalBookmarks,
  );
  const staleBookmarks = Math.min(
    clampNonNegative(stats.staleBookmarks),
    indexedBookmarks,
  );
  return {
    totalBookmarks,
    indexedBookmarks,
    staleBookmarks,
  };
}

function getBookmarkContentHash(bookmark: {
  title: string;
  url: string;
  description?: string | null;
}) {
  return hashSemanticText(buildBookmarkEmbeddingText(bookmark));
}

function isEmbeddingStaleForBookmark(
  bookmark: {
    title: string;
    url: string;
    description?: string | null;
  },
  embedding: { contentHash: string },
) {
  return embedding.contentHash !== getBookmarkContentHash(bookmark);
}

async function getEmbeddingIndexStatsState(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
): Promise<EmbeddingIndexStatsState | null> {
  const statsRows = await ctx.db
    .query("embeddingIndexStats")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();

  if (statsRows.length === 0) {
    return null;
  }

  const canonicalStats = statsRows.sort((a, b) => {
    if (a._creationTime !== b._creationTime) {
      return a._creationTime - b._creationTime;
    }
    return String(a._id).localeCompare(String(b._id));
  })[0];

  return {
    id: canonicalStats._id,
    totalBookmarks: canonicalStats.totalBookmarks,
    indexedBookmarks: canonicalStats.indexedBookmarks,
    staleBookmarks: canonicalStats.staleBookmarks,
    lastIndexedAt: canonicalStats.lastIndexedAt,
  };
}

async function ensureEmbeddingIndexStatsStateForDelta(
  ctx: Pick<MutationCtx, "db">,
  userId: string,
): Promise<EmbeddingIndexStatsState> {
  const existing = await getEmbeddingIndexStatsState(ctx, userId);
  if (existing) {
    return existing;
  }

  const id = await ctx.db.insert("embeddingIndexStats", {
    userId,
    totalBookmarks: 0,
    indexedBookmarks: 0,
    staleBookmarks: 0,
    lastIndexedAt: null,
  });

  return {
    id,
    totalBookmarks: 0,
    indexedBookmarks: 0,
    staleBookmarks: 0,
    lastIndexedAt: null,
  };
}

async function repairEmbeddingIndexStatsFromSource(
  ctx: Pick<MutationCtx, "db">,
  userId: string,
): Promise<EmbeddingIndexStatsState> {
  const repaired = await computeEmbeddingStatsFromSource(ctx, userId);
  const statsRows = await ctx.db
    .query("embeddingIndexStats")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();

  if (statsRows.length === 0) {
    const id = await ctx.db.insert("embeddingIndexStats", {
      userId,
      totalBookmarks: repaired.totalBookmarks,
      indexedBookmarks: repaired.indexedBookmarks,
      staleBookmarks: repaired.staleBookmarks,
      lastIndexedAt: repaired.lastIndexedAt,
    });
    return { id, ...repaired };
  }

  const [canonicalStats, ...duplicateStats] = statsRows.sort((a, b) => {
    if (a._creationTime !== b._creationTime) {
      return a._creationTime - b._creationTime;
    }
    return String(a._id).localeCompare(String(b._id));
  });

  await ctx.db.patch(canonicalStats._id, repaired);

  for (const duplicate of duplicateStats) {
    await ctx.db.delete(duplicate._id);
  }

  return {
    id: canonicalStats._id,
    ...repaired,
  };
}

async function getLatestEmbeddingUpdatedAt(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  const latestEmbedding = await ctx.db
    .query("bookmarkEmbeddings")
    .withIndex("by_user_updated_at", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  return latestEmbedding?.updatedAt ?? null;
}

async function applyEmbeddingIndexStatsDelta(
  ctx: Pick<MutationCtx, "db">,
  userId: string,
  delta: {
    totalBookmarks?: number;
    indexedBookmarks?: number;
    staleBookmarks?: number;
    maxLastIndexedAt?: number;
    recomputeLastIndexedAt?: boolean;
  },
) {
  let stats = await ensureEmbeddingIndexStatsStateForDelta(ctx, userId);
  if (!hasValidEmbeddingStatsCounts(stats)) {
    const normalized = normalizeEmbeddingStatsCounts(stats);
    await ctx.db.patch(stats.id, normalized);
    stats = { ...stats, ...normalized };
  }
  const nextCounts = normalizeEmbeddingStatsCounts({
    totalBookmarks: stats.totalBookmarks + (delta.totalBookmarks ?? 0),
    indexedBookmarks: stats.indexedBookmarks + (delta.indexedBookmarks ?? 0),
    staleBookmarks: stats.staleBookmarks + (delta.staleBookmarks ?? 0),
  });
  let nextLastIndexedAt = stats.lastIndexedAt;

  if (delta.maxLastIndexedAt !== undefined) {
    nextLastIndexedAt =
      nextLastIndexedAt === null
        ? delta.maxLastIndexedAt
        : Math.max(nextLastIndexedAt, delta.maxLastIndexedAt);
  }
  if (delta.recomputeLastIndexedAt) {
    nextLastIndexedAt = await getLatestEmbeddingUpdatedAt(ctx, userId);
  }

  await ctx.db.patch(stats.id, {
    totalBookmarks: nextCounts.totalBookmarks,
    indexedBookmarks: nextCounts.indexedBookmarks,
    staleBookmarks: nextCounts.staleBookmarks,
    lastIndexedAt: nextLastIndexedAt,
  });
}

// --- Folders ---

export const createFolder = mutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    const folderId = await ctx.db.insert("folders", {
      userId: user._id,
      name: args.name,
      parentId: args.parentId,
      createdAt: Date.now(),
    });
    return folderId;
  },
});

export const getFolders = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) {
      return [];
    }
    return await ctx.db
      .query("folders")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const updateFolder = mutation({
  args: {
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    parentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Validate ownership
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== user._id) {
      throw new Error("Folder not found or unauthorized");
    }

    // Guard against self-referencing cycle
    if (args.parentId === args.folderId) {
      throw new Error("A folder cannot be its own parent");
    }

    // Only patch fields that were actually provided
    const { folderId, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;

    await ctx.db.patch(folderId, patch);
  },
});

export const deleteFolder = mutation({
  args: {
    folderId: v.id("folders"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Validate ownership
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== user._id) {
      throw new Error("Folder not found or unauthorized");
    }

    // Cascading delete: remove child bookmarks
    const childBookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("folderId"), args.folderId))
      .collect();
    let removedBookmarks = 0;
    let removedEmbeddings = 0;
    let removedStale = 0;
    for (const bm of childBookmarks) {
      const embedding = await ctx.db
        .query("bookmarkEmbeddings")
        .withIndex("by_user_bookmark", (q) =>
          q.eq("userId", user._id).eq("bookmarkId", bm._id),
        )
        .unique();
      if (embedding) {
        if (isEmbeddingStaleForBookmark(bm, embedding)) {
          removedStale += 1;
        }
        await ctx.db.delete(embedding._id);
        removedEmbeddings += 1;
      }
      await ctx.db.delete(bm._id);
      removedBookmarks += 1;
    }
    if (removedBookmarks > 0 || removedEmbeddings > 0 || removedStale > 0) {
      await applyEmbeddingIndexStatsDelta(ctx, user._id, {
        totalBookmarks: -removedBookmarks,
        indexedBookmarks: -removedEmbeddings,
        staleBookmarks: -removedStale,
        recomputeLastIndexedAt: removedEmbeddings > 0,
      });
    }

    // Cascading delete: remove child folders recursively
    const childFolders = await ctx.db
      .query("folders")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("parentId"), args.folderId))
      .collect();
    for (const cf of childFolders) {
      // Reparent children to the deleted folder's parent instead of recursive delete
      await ctx.db.patch(cf._id, { parentId: folder.parentId });
    }

    await ctx.db.delete(args.folderId);
  },
});

// --- Bookmarks ---

export const createBookmark = mutation({
  args: {
    title: v.string(),
    url: v.string(),
    addDate: v.optional(v.number()),
    folderId: v.optional(v.id("folders")),
    favicon: v.optional(v.string()),
    ogImage: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Check for duplicate
    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_url", (q) =>
        q.eq("userId", user._id).eq("url", args.url),
      )
      .first();

    if (existing) {
      // Return existing ID if duplicate found (idempotent behavior)
      // or throw error? For import logic, idempotent is better.
      return existing._id;
    }

    const bookmarkId = await ctx.db.insert("bookmarks", {
      userId: user._id,
      title: args.title,
      url: args.url,
      folderId: args.folderId,
      favicon: args.favicon,
      ogImage: args.ogImage,
      description: args.description,
      createdAt: args.addDate ?? Date.now(),
      metadataStatus: args.favicon && args.ogImage ? "completed" : "pending",
    });
    await applyEmbeddingIndexStatsDelta(ctx, user._id, { totalBookmarks: 1 });
    return bookmarkId;
  },
});

export const batchCreateBookmarks = mutation({
  args: {
    bookmarks: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        addDate: v.optional(v.number()),
        folderId: v.optional(v.id("folders")),
        favicon: v.optional(v.string()),
        ogImage: v.optional(v.string()),
        description: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const createdIds: Id<"bookmarks">[] = [];
    let movedCount = 0;
    let newBookmarksCount = 0;
    for (const bookmark of args.bookmarks) {
      // Check for duplicate
      const existing = await ctx.db
        .query("bookmarks")
        .withIndex("by_user_url", (q) =>
          q.eq("userId", user._id).eq("url", bookmark.url),
        )
        .first();

      if (existing) {
        if (bookmark.folderId) {
          if (existing.folderId !== bookmark.folderId) {
            await ctx.db.patch(existing._id, {
              folderId: bookmark.folderId,
            });
            movedCount += 1;
          }
        }
        createdIds.push(existing._id);
        continue;
      }

      const bookmarkId = await ctx.db.insert("bookmarks", {
        userId: user._id,
        title: bookmark.title,
        url: bookmark.url,
        folderId: bookmark.folderId,
        favicon: bookmark.favicon,
        ogImage: bookmark.ogImage,
        description: bookmark.description,
        createdAt: bookmark.addDate ?? Date.now(),
        metadataStatus:
          bookmark.favicon && bookmark.ogImage ? "completed" : "pending",
      });
      createdIds.push(bookmarkId);
      newBookmarksCount += 1;
    }
    if (newBookmarksCount > 0) {
      await applyEmbeddingIndexStatsDelta(ctx, user._id, {
        totalBookmarks: newBookmarksCount,
      });
    }
    return { createdIds, movedCount };
  },
});

export const getBookmarks = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) {
      return [];
    }
    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();

    return bookmarks.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const upsertBookmarkEmbedding = mutation({
  args: {
    bookmarkId: v.id("bookmarks"),
    embedding: v.array(v.float64()),
    embeddingDim: v.number(),
    embeddingModel: v.string(),
    embeddingDtype: v.union(
      v.literal("q4"),
      v.literal("q8"),
      v.literal("fp32"),
    ),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    if (
      args.embeddingDim !== EMBEDDING_DIM ||
      args.embedding.length !== EMBEDDING_DIM
    ) {
      throw new Error("Invalid embedding dimensions");
    }
    if (args.embeddingModel !== EMBEDDING_MODEL_ID) {
      throw new Error("Unsupported embedding model");
    }

    const bookmark = await ctx.db.get(args.bookmarkId);
    if (!bookmark || bookmark.userId !== user._id) {
      throw new Error("Bookmark not found or unauthorized");
    }

    const serverComputedContentHash = getBookmarkContentHash(bookmark);
    if (args.contentHash !== serverComputedContentHash) {
      throw new Error("Bookmark content hash mismatch");
    }

    const existing = await ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_bookmark", (q) =>
        q.eq("userId", user._id).eq("bookmarkId", args.bookmarkId),
      )
      .unique();
    const updatedAt = Date.now();

    if (existing) {
      const wasStale = isEmbeddingStaleForBookmark(bookmark, existing);
      await ctx.db.patch(existing._id, {
        folderId: bookmark.folderId,
        embedding: args.embedding,
        embeddingDim: args.embeddingDim,
        embeddingModel: args.embeddingModel,
        embeddingDtype: args.embeddingDtype,
        contentHash: serverComputedContentHash,
        updatedAt,
      });
      await applyEmbeddingIndexStatsDelta(ctx, user._id, {
        staleBookmarks: wasStale ? -1 : 0,
        maxLastIndexedAt: updatedAt,
      });
      return existing._id;
    }

    const insertedId = await ctx.db.insert("bookmarkEmbeddings", {
      userId: user._id,
      bookmarkId: args.bookmarkId,
      folderId: bookmark.folderId,
      embedding: args.embedding,
      embeddingDim: args.embeddingDim,
      embeddingModel: args.embeddingModel,
      embeddingDtype: args.embeddingDtype,
      contentHash: serverComputedContentHash,
      updatedAt,
    });
    await applyEmbeddingIndexStatsDelta(ctx, user._id, {
      indexedBookmarks: 1,
      maxLastIndexedAt: updatedAt,
    });
    return insertedId;
  },
});

export const deleteBookmarkEmbedding = mutation({
  args: { bookmarkId: v.id("bookmarks") },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    const embedding = await ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_bookmark", (q) =>
        q.eq("userId", user._id).eq("bookmarkId", args.bookmarkId),
      )
      .unique();
    if (embedding) {
      const bookmark = await ctx.db.get(args.bookmarkId);
      const wasStale =
        bookmark && bookmark.userId === user._id
          ? isEmbeddingStaleForBookmark(bookmark, embedding)
          : false;
      await ctx.db.delete(embedding._id);
      await applyEmbeddingIndexStatsDelta(ctx, user._id, {
        indexedBookmarks: -1,
        staleBookmarks: wasStale ? -1 : 0,
        recomputeLastIndexedAt: true,
      });
    }
  },
});

export const getBookmarkEmbeddingHash = query({
  args: { bookmarkId: v.id("bookmarks") },
  handler: async (ctx, args) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) {
      return null;
    }
    const embedding = await ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_bookmark", (q) =>
        q.eq("userId", user._id).eq("bookmarkId", args.bookmarkId),
      )
      .unique();
    return embedding?.contentHash ?? null;
  },
});

async function computeEmbeddingStatsFromSource(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
): Promise<EmbeddingIndexStatsSnapshot> {
  const [bookmarks, embeddings] = await Promise.all([
    ctx.db
      .query("bookmarks")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const bookmarkById = new Map(
    bookmarks.map((bookmark) => [bookmark._id, bookmark] as const),
  );
  const latestEmbeddingByBookmark = new Map<
    Id<"bookmarks">,
    Doc<"bookmarkEmbeddings">
  >();

  for (const embedding of embeddings) {
    if (!bookmarkById.has(embedding.bookmarkId)) {
      continue;
    }
    const existing = latestEmbeddingByBookmark.get(embedding.bookmarkId);
    if (!existing || embedding.updatedAt > existing.updatedAt) {
      latestEmbeddingByBookmark.set(embedding.bookmarkId, embedding);
    }
  }

  const normalizedCounts = normalizeEmbeddingStatsCounts({
    totalBookmarks: bookmarks.length,
    indexedBookmarks: latestEmbeddingByBookmark.size,
    staleBookmarks: 0,
  });
  let staleBookmarks = 0;
  let lastIndexedAt: number | null = null;
  for (const [bookmarkId, embedding] of latestEmbeddingByBookmark) {
    const bookmark = bookmarkById.get(bookmarkId);
    if (!bookmark) {
      continue;
    }
    if (isEmbeddingStaleForBookmark(bookmark, embedding)) {
      staleBookmarks += 1;
    }
    if (lastIndexedAt === null || embedding.updatedAt > lastIndexedAt) {
      lastIndexedAt = embedding.updatedAt;
    }
  }
  const finalCounts = normalizeEmbeddingStatsCounts({
    ...normalizedCounts,
    staleBookmarks,
  });
  return {
    totalBookmarks: finalCounts.totalBookmarks,
    indexedBookmarks: finalCounts.indexedBookmarks,
    staleBookmarks: finalCounts.staleBookmarks,
    lastIndexedAt,
  };
}

export const getEmbeddingIndexStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) {
      return {
        totalBookmarks: 0,
        indexedBookmarks: 0,
        pendingBookmarks: 0,
        staleBookmarks: 0,
        lastIndexedAt: null as number | null,
      };
    }
    const stats = await getEmbeddingIndexStatsState(ctx, user._id);
    let totalBookmarks: number;
    let indexedBookmarks: number;
    let staleBookmarks: number;
    let lastIndexedAt: number | null;

    if (stats && hasValidEmbeddingStatsCounts(stats)) {
      totalBookmarks = stats.totalBookmarks;
      indexedBookmarks = stats.indexedBookmarks;
      staleBookmarks = stats.staleBookmarks;
      lastIndexedAt = stats.lastIndexedAt;
    } else {
      const computed = await computeEmbeddingStatsFromSource(ctx, user._id);
      totalBookmarks = computed.totalBookmarks;
      indexedBookmarks = computed.indexedBookmarks;
      staleBookmarks = computed.staleBookmarks;
      lastIndexedAt = computed.lastIndexedAt;
    }

    return {
      totalBookmarks,
      indexedBookmarks,
      pendingBookmarks: Math.max(totalBookmarks - indexedBookmarks, 0),
      staleBookmarks,
      lastIndexedAt,
    };
  },
});

export const repairEmbeddingIndexStats = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const repaired = await repairEmbeddingIndexStatsFromSource(ctx, user._id);
    return {
      totalBookmarks: repaired.totalBookmarks,
      indexedBookmarks: repaired.indexedBookmarks,
      pendingBookmarks: Math.max(
        repaired.totalBookmarks - repaired.indexedBookmarks,
        0,
      ),
      staleBookmarks: repaired.staleBookmarks,
      lastIndexedAt: repaired.lastIndexedAt,
    };
  },
});

export const updateBookmarkMetadata = mutation({
  args: {
    bookmarkId: v.id("bookmarks"),
    favicon: v.optional(v.string()),
    ogImage: v.optional(v.string()),
    title: v.optional(v.string()),
    metadataStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("fetching"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const bookmark = await ctx.db.get(args.bookmarkId);
    if (!bookmark || bookmark.userId !== user._id) {
      throw new Error("Bookmark not found or unauthorized");
    }

    const hasNewData =
      args.favicon !== undefined ||
      args.ogImage !== undefined ||
      args.title !== undefined;
    const resolvedStatus =
      args.metadataStatus ??
      (hasNewData ? "completed" : bookmark.metadataStatus);
    const nextTitle = args.title ?? bookmark.title;
    const nextDescription = bookmark.description;
    const nextUrl = bookmark.url;
    const embedding = await ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_bookmark", (q) =>
        q.eq("userId", user._id).eq("bookmarkId", args.bookmarkId),
      )
      .unique();
    const staleDelta = embedding
      ? Number(
          isEmbeddingStaleForBookmark(
            {
              title: nextTitle,
              url: nextUrl,
              description: nextDescription,
            },
            embedding,
          ),
        ) - Number(isEmbeddingStaleForBookmark(bookmark, embedding))
      : 0;
    await ctx.db.patch(args.bookmarkId, {
      favicon: args.favicon ?? bookmark.favicon,
      ogImage: args.ogImage ?? bookmark.ogImage,
      title: nextTitle,
      metadataStatus: resolvedStatus,
    });
    if (staleDelta !== 0) {
      await applyEmbeddingIndexStatsDelta(ctx, user._id, {
        staleBookmarks: staleDelta,
      });
    }
  },
});

export const updateBookmark = mutation({
  args: {
    bookmarkId: v.id("bookmarks"),
    title: v.optional(v.string()),
    url: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    favicon: v.optional(v.string()),
    ogImage: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const bookmark = await ctx.db.get(args.bookmarkId);
    if (!bookmark || bookmark.userId !== user._id) {
      throw new Error("Bookmark not found or unauthorized");
    }

    // Only patch fields that were actually provided so we don't
    // accidentally clear required fields like `title` and `url`.
    const { bookmarkId, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;
    const embedding = await ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_bookmark", (q) =>
        q.eq("userId", user._id).eq("bookmarkId", bookmarkId),
      )
      .unique();
    const nextBookmark = {
      ...bookmark,
      title: args.title ?? bookmark.title,
      url: args.url ?? bookmark.url,
      description: args.description ?? bookmark.description,
    };
    const staleDelta = embedding
      ? Number(isEmbeddingStaleForBookmark(nextBookmark, embedding)) -
        Number(isEmbeddingStaleForBookmark(bookmark, embedding))
      : 0;

    await ctx.db.patch(bookmarkId, patch);
    if (staleDelta !== 0) {
      await applyEmbeddingIndexStatsDelta(ctx, user._id, {
        staleBookmarks: staleDelta,
      });
    }

    if (args.folderId !== undefined && embedding) {
      await ctx.db.patch(embedding._id, { folderId: args.folderId });
    }
  },
});

export const deleteBookmark = mutation({
  args: {
    bookmarkId: v.id("bookmarks"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const bookmark = await ctx.db.get(args.bookmarkId);
    if (!bookmark || bookmark.userId !== user._id) {
      throw new Error("Bookmark not found or unauthorized");
    }

    const embedding = await ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_bookmark", (q) =>
        q.eq("userId", user._id).eq("bookmarkId", args.bookmarkId),
      )
      .unique();
    const wasStale =
      embedding !== null
        ? isEmbeddingStaleForBookmark(bookmark, embedding)
        : false;
    if (embedding) {
      await ctx.db.delete(embedding._id);
    }
    await ctx.db.delete(args.bookmarkId);
    await applyEmbeddingIndexStatsDelta(ctx, user._id, {
      totalBookmarks: -1,
      indexedBookmarks: embedding ? -1 : 0,
      staleBookmarks: wasStale ? -1 : 0,
      recomputeLastIndexedAt: embedding !== null,
    });
  },
});

export const deleteAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const [bookmarks, folders, embeddings, indexStats] = await Promise.all([
      ctx.db
        .query("bookmarks")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("folders")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("bookmarkEmbeddings")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("embeddingIndexStats")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }
    for (const embedding of embeddings) {
      await ctx.db.delete(embedding._id);
    }
    for (const folder of folders) {
      await ctx.db.delete(folder._id);
    }
    for (const stats of indexStats) {
      await ctx.db.delete(stats._id);
    }

    // Defensive second-pass cleanup in case additional rows appeared mid-delete.
    const [remainingEmbeddings, remainingIndexStats] = await Promise.all([
      ctx.db
        .query("bookmarkEmbeddings")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("embeddingIndexStats")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    for (const embedding of remainingEmbeddings) {
      await ctx.db.delete(embedding._id);
    }
    for (const stats of remainingIndexStats) {
      await ctx.db.delete(stats._id);
    }

    return {
      bookmarksDeleted: bookmarks.length,
      foldersDeleted: folders.length,
      embeddingsDeleted: embeddings.length + remainingEmbeddings.length,
      embeddingStatsDeleted: indexStats.length + remainingIndexStats.length,
    };
  },
});

export const fetchBookmarkEmbeddingsByIds = query({
  args: { ids: v.array(v.id("bookmarkEmbeddings")) },
  handler: async (ctx, args) => {
    if (args.ids.length > MAX_IDS_BATCH) {
      throw new Error(`Too many ids provided (max ${MAX_IDS_BATCH})`);
    }
    const user = await getOptionalAuthUser(ctx);
    if (!user) {
      return [];
    }
    const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return docs
      .filter((doc): doc is Doc<"bookmarkEmbeddings"> => doc !== null)
      .filter((doc) => doc.userId === user._id)
      .map((doc) => ({ _id: doc._id, bookmarkId: doc.bookmarkId }));
  },
});

export const fetchBookmarksByIds = query({
  args: { ids: v.array(v.id("bookmarks")) },
  handler: async (ctx, args) => {
    if (args.ids.length > MAX_IDS_BATCH) {
      throw new Error(`Too many ids provided (max ${MAX_IDS_BATCH})`);
    }
    const user = await getOptionalAuthUser(ctx);
    if (!user) {
      return [];
    }
    const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return docs.filter(
      (
        doc,
      ): doc is Exclude<(typeof docs)[number], null> & {
        userId: string;
      } => doc !== null && doc.userId === user._id,
    );
  },
});

// --- User Stats ---

export const getUserStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) {
      return {
        bookmarks: 0,
        folders: 0,
      };
    }

    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();

    const folders = await ctx.db
      .query("folders")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .collect();

    return {
      bookmarks: bookmarks.length,
      folders: folders.length,
    };
  },
});
