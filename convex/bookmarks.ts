import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { authComponent, getOptionalAuthUser } from "./auth";

const EMBEDDING_DIM = 256;
const EMBEDDING_MODEL = "onnx-community/embeddinggemma-300m-ONNX";

function buildBookmarkSemanticText(bookmark: {
  title: string;
  url: string;
  description?: string;
}) {
  const normalizedDescription = bookmark.description?.trim();
  return [bookmark.title.trim(), bookmark.url.trim(), normalizedDescription]
    .filter(Boolean)
    .join("\n");
}

function hashBookmarkText(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}`;
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
    for (const bm of childBookmarks) {
      const embedding = await ctx.db
        .query("bookmarkEmbeddings")
        .withIndex("by_user_bookmark", (q) =>
          q.eq("userId", user._id).eq("bookmarkId", bm._id),
        )
        .unique();
      if (embedding) {
        await ctx.db.delete(embedding._id);
      }
      await ctx.db.delete(bm._id);
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
    if (args.embeddingModel !== EMBEDDING_MODEL) {
      throw new Error("Unsupported embedding model");
    }

    const bookmark = await ctx.db.get(args.bookmarkId);
    if (!bookmark || bookmark.userId !== user._id) {
      throw new Error("Bookmark not found or unauthorized");
    }

    const existing = await ctx.db
      .query("bookmarkEmbeddings")
      .withIndex("by_user_bookmark", (q) =>
        q.eq("userId", user._id).eq("bookmarkId", args.bookmarkId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        folderId: bookmark.folderId,
        embedding: args.embedding,
        embeddingDim: args.embeddingDim,
        embeddingModel: args.embeddingModel,
        embeddingDtype: args.embeddingDtype,
        contentHash: args.contentHash,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("bookmarkEmbeddings", {
      userId: user._id,
      bookmarkId: args.bookmarkId,
      folderId: bookmark.folderId,
      embedding: args.embedding,
      embeddingDim: args.embeddingDim,
      embeddingModel: args.embeddingModel,
      embeddingDtype: args.embeddingDtype,
      contentHash: args.contentHash,
      updatedAt: Date.now(),
    });
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
      await ctx.db.delete(embedding._id);
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

    const [bookmarks, embeddings] = await Promise.all([
      ctx.db
        .query("bookmarks")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("bookmarkEmbeddings")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const embeddingsByBookmarkId = new Map(
      embeddings.map((embedding) => [embedding.bookmarkId, embedding]),
    );

    let staleBookmarks = 0;
    for (const bookmark of bookmarks) {
      const embedding = embeddingsByBookmarkId.get(bookmark._id);
      if (!embedding) {
        continue;
      }
      const currentHash = hashBookmarkText(buildBookmarkSemanticText(bookmark));
      if (embedding.contentHash !== currentHash) {
        staleBookmarks += 1;
      }
    }

    const indexedBookmarks = embeddingsByBookmarkId.size;
    return {
      totalBookmarks: bookmarks.length,
      indexedBookmarks,
      pendingBookmarks: Math.max(bookmarks.length - indexedBookmarks, 0),
      staleBookmarks,
      lastIndexedAt:
        embeddings.length > 0
          ? Math.max(...embeddings.map((embedding) => embedding.updatedAt))
          : null,
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
    await ctx.db.patch(args.bookmarkId, {
      favicon: args.favicon ?? bookmark.favicon,
      ogImage: args.ogImage ?? bookmark.ogImage,
      title: args.title ?? bookmark.title,
      metadataStatus: resolvedStatus,
    });
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

    await ctx.db.patch(bookmarkId, patch);

    if (args.folderId !== undefined) {
      const embedding = await ctx.db
        .query("bookmarkEmbeddings")
        .withIndex("by_user_bookmark", (q) =>
          q.eq("userId", user._id).eq("bookmarkId", bookmarkId),
        )
        .unique();
      if (embedding) {
        await ctx.db.patch(embedding._id, { folderId: args.folderId });
      }
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
    if (embedding) {
      await ctx.db.delete(embedding._id);
    }
    await ctx.db.delete(args.bookmarkId);
  },
});

export const deleteAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const [bookmarks, folders, embeddings] = await Promise.all([
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
