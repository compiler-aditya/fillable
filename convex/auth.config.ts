/**
 * Convex Auth issues its own JWTs, so the provider is this deployment itself.
 *
 * Convex discovers the signing keys by fetching
 * `{domain}/.well-known/openid-configuration`, which `auth.addHttpRoutes(http)`
 * serves. Those routes must be registered before the static catch-all in
 * `convex/http.ts` — otherwise the SPA fallback answers them with `index.html`
 * and a 200, and `ctx.auth.getUserIdentity()` silently returns null forever.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
