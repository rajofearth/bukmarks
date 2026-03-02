import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { EMBEDDING_DIM } from "../lib/semantic-search";

export default defineSchema({
  // precise profile settings that extend the base user
  profiles: defineTable({
    userId: v.string(), // Links to the auth user (Component ID)
    name: v.optional(v.string()), // Override or cache of name
    email: v.optional(v.string()), // Override or cache
    image: v.optional(v.string()), // Override
    blurProfile: v.optional(v.boolean()),
  }).index("by_user_id", ["userId"]),

  bookmarks: defineTable({
    userId: v.string(), // Owner (Auth User ID)
    title: v.string(),
    url: v.string(),
    favicon: v.optional(v.string()),
    ogImage: v.optional(v.string()),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    createdAt: v.number(),
    metadataStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("fetching"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
  })
    .index("by_user_id", ["userId"])
    .index("by_folder_id", ["folderId"])
    .index("by_user_url", ["userId", "url"]),

  bookmarkEmbeddings: defineTable({
    userId: v.string(),
    bookmarkId: v.id("bookmarks"),
    folderId: v.optional(v.id("folders")),
    embedding: v.array(v.float64()),
    embeddingDim: v.number(),
    embeddingModel: v.string(),
    embeddingDtype: v.union(
      v.literal("q4"),
      v.literal("q8"),
      v.literal("fp32"),
    ),
    contentHash: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_bookmark_id", ["bookmarkId"])
    .index("by_user_updated_at", ["userId", "updatedAt"])
    .index("by_user_bookmark", ["userId", "bookmarkId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIM,
      filterFields: ["userId", "folderId"],
    }),

  embeddingIndexStats: defineTable({
    userId: v.string(),
    totalBookmarks: v.number(),
    indexedBookmarks: v.number(),
    staleBookmarks: v.number(),
    lastIndexedAt: v.union(v.number(), v.null()),
  }).index("by_user_id", ["userId"]),

  folders: defineTable({
    userId: v.string(), // Owner (Auth User ID)
    name: v.string(),
    parentId: v.optional(v.id("folders")),
    createdAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_parent_id", ["parentId"]),
});
