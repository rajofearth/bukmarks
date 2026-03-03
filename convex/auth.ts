import {
  type AuthFunctions,
  createClient,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL ?? "https://bukmarks.vercel.app";
const isProduction = !siteUrl.startsWith("http://localhost");
const trustedOrigins = Array.from(
  new Set([siteUrl, "https://bukmarks.vercel.app", "http://localhost:3000"]),
);

type TelegramOidcClaims = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  username?: string;
  picture?: string;
};

function decodeJwtPayload(token: string): TelegramOidcClaims | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  try {
    return JSON.parse(atob(padded)) as TelegramOidcClaims;
  } catch {
    return null;
  }
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent: ReturnType<typeof createClient<DataModel>> =
  createClient<DataModel>(components.betterAuth, {
    authFunctions: (internal as { auth: AuthFunctions }).auth,
    triggers: {
      user: {
        onCreate: async (ctx, doc) => {
          await ctx.db.insert("profiles", {
            userId: doc._id,
            name: doc.name ?? undefined,
            email: doc.email ?? undefined,
            image: doc.image ?? undefined,
          });
        },
        onDelete: async (ctx, doc) => {
          const profile = await ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", doc._id))
            .unique();
          if (profile) {
            await ctx.db.delete(profile._id);
          }
        },
      },
    },
  });
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins,
    defaultCookieAttributes: isProduction
      ? { sameSite: "none", secure: true }
      : { sameSite: "lax", secure: false },
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: false,
      requireEmailVerification: false,
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    },
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex({ authConfig }),
      genericOAuth({
        config: [
          {
            providerId: "telegram",
            clientId: process.env.TELEGRAM_CLIENT_ID as string,
            clientSecret: process.env.TELEGRAM_CLIENT_SECRET as string,
            discoveryUrl:
              "https://oauth.telegram.org/.well-known/openid-configuration",
            scopes: ["openid", "profile", "email"],
            // Telegram's OIDC implementation returns profile claims in id_token.
            getUserInfo: async (token) => {
              const claims = token.idToken
                ? decodeJwtPayload(token.idToken)
                : null;
              if (!claims?.sub) return null;

              return {
                id: claims.sub,
                email: claims.email,
                emailVerified: claims.email_verified ?? false,
                name: (() => {
                  const fullName = [claims.given_name, claims.family_name]
                    .filter(Boolean)
                    .join(" ");
                  const primaryName = claims.name ?? fullName;
                  return primaryName || claims.username || "Telegram User";
                })(),
                image: claims.picture,
              };
            },
          },
        ],
      }),
    ],
  });
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

// Helper that treats unauthenticated requests as "no user" for read-only queries.
export async function getOptionalAuthUser(ctx: GenericCtx<DataModel>) {
  try {
    const user = await authComponent.getAuthUser(ctx);
    return user ?? null;
  } catch (_error) {
    // For read-only queries we don't want unauthenticated access to throw;
    // callers should interpret `null` as "no authenticated user".
    return null;
  }
}
