import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";

/**
 * The /pipeline screen.
 *
 * Public and deliberately so: showing the machinery — what ran, what it saw,
 * what it cost — is the difference between "a page with data on it" and a
 * visible live backend. A sweep in progress ticks `recordsSeen` upward while
 * this query is subscribed.
 */
export const recentRuns = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(schema.doc("syncRuns")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("syncRuns")
      .withIndex("by_started_at")
      .order("desc")
      .take(Math.min(args.limit ?? 20, 100));
  },
});

/** Anything currently mid-flight, so the UI can show a live progress row. */
export const running = query({
  args: {},
  returns: v.array(schema.doc("syncRuns")),
  handler: async (ctx) => {
    return await ctx.db
      .query("syncRuns")
      .withIndex("by_state", (q) => q.eq("state", "running"))
      .take(10);
  },
});
