import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";

const MAX = 100;

/**
 * The live ticker.
 *
 * Reverifications are excluded by default: 853 of 1,596 records carry
 * `update_type: "Reverified"` on a sweep, and including them would bury the
 * handful of changes that actually matter. They stay visible on a drug's own
 * history, where "the FDA re-checked this and it didn't move" is useful.
 */
export const recent = query({
  args: {
    limit: v.optional(v.number()),
    includeReverifications: v.optional(v.boolean()),
  },
  returns: v.array(schema.doc("statusEvents")),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 30, MAX);

    if (args.includeReverifications === true) {
      return await ctx.db
        .query("statusEvents")
        .withIndex("by_occurred_at")
        .order("desc")
        .take(limit);
    }

    // Over-read then filter: the index cannot express "kind != x", and the
    // bound keeps it safe as the table grows.
    const page = await ctx.db
      .query("statusEvents")
      .withIndex("by_occurred_at")
      .order("desc")
      .take(Math.min(limit * 4, MAX * 4));

    return page.filter((e) => e.kind !== "reverified_unchanged").slice(0, limit);
  },
});

/** Everything that ever happened to one drug, newest first. */
export const forDrug = query({
  args: { drugId: v.id("drugs"), limit: v.optional(v.number()) },
  returns: v.array(schema.doc("statusEvents")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("statusEvents")
      .withIndex("by_drug_and_occurred_at", (q) => q.eq("drugId", args.drugId))
      .order("desc")
      .take(Math.min(args.limit ?? 40, MAX));
  },
});

/** Only the good news: packages that became gettable. */
export const goodNews = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(schema.doc("statusEvents")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("statusEvents")
      .withIndex("by_severity_and_occurred_at", (q) => q.eq("severity", "good"))
      .order("desc")
      .take(Math.min(args.limit ?? 20, MAX));
  },
});
