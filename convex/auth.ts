import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Authentication for room creators.
 *
 * Only the person who opens a negotiation signs in. The counterparty joins
 * through a signed link and never creates an account, which is what removes the
 * usual two-sided adoption problem — see `convex/rooms.ts`.
 *
 * Two ways in:
 *
 * - Google, for people who would rather not invent another password.
 * - Password, kept alongside it so the app still works when Google credentials
 *   are absent — local development, and the automated tests, both rely on that.
 *
 * Google needs `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `SITE_URL` on the
 * deployment, and the callback registered with Google must be
 * `<CONVEX_SITE_URL>/api/auth/callback/google`.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Password],
});
