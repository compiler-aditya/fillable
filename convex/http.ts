import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

/**
 * Route order is load-bearing.
 *
 * Exact routes are registered first, then Convex Auth's, and the static
 * catch-all last. Convex Auth serves its discovery documents at
 * `/.well-known/openid-configuration` and `/.well-known/jwks.json`, which carry
 * no file extension — if the SPA fallback were registered first it would answer
 * them with `index.html` and a 200, and token verification would fail while
 * every health check stayed green.
 *
 * App HTTP routes belong under `/api/...` so they cannot collide with a
 * client-side route that the SPA fallback should serve.
 */

// (App routes go here — e.g. the AgentMail webhook at /api/webhooks/agentmail.)

auth.addHttpRoutes(http);

registerStaticRoutes(http, components.staticHosting, { spaFallback: true });

export default http;
