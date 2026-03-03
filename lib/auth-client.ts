import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [convexClient(), genericOAuthClient()],
});
