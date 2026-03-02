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

function clampNonNegative(value: number) {
  return value < 0 ? 0 : value;
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
  const stats = await ctx.db
    .query("embeddingIndexStats")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .first();
  if (!stats) {
    return null;
  }
  return {
    id: stats._id,
    totalBookmarks: stats.totalBookmarks,
    indexedBookmarks: stats.indexedBookmarks,
    staleBookmarks: stats.staleBookmarks,
    lastIndexedAt: stats.lastIndexedAt,
  };
}

async function ensureEmbeddingIndexStatsState(
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
  const stats = await ensureEmbeddingIndexStatsState(ctx, userId);
  const nextTotal = clampNonNegative(
    stats.totalBookmarks + (delta.totalBookmarks ?? 0),
  );
  const nextIndexed = clampNonNegative(
    stats.indexedBookmarks + (delta.indexedBookmarks ?? 0),
  );
  const staleCandidate = clampNonNegative(
    stats.staleBookmarks + (delta.staleBookmarks ?? 0),
  );
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
    totalBookmarks: nextTotal,
    indexedBookmarks: nextIndexed,
    staleBookmarks: Math.min(staleCandidate, nextIndexed),
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
      console.warn("Client contentHash mismatch", {
        bookmarkId: args.bookmarkId,
      });
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
    const totalBookmarks = stats?.totalBookmarks ?? 0;
    const indexedBookmarks = stats?.indexedBookmarks ?? 0;
    const staleBookmarks = stats?.staleBookmarks ?? 0;
    const lastIndexedAt = stats?.lastIndexedAt ?? null;

    return {
      totalBookmarks,
      indexedBookmarks,
      pendingBookmarks: Math.max(totalBookmarks - indexedBookmarks, 0),
      staleBookmarks,
      lastIndexedAt,
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

    return {
      bookmarksDeleted: bookmarks.length,
      foldersDeleted: folders.length,
      embeddingsDeleted: embeddings.length,
    };
  },
});

export const fetchBookmarkEmbeddingsByIds = query({
  args: { ids: v.array(v.id("bookmarkEmbeddings")) },
  handler: async (ctx, args) => {
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
