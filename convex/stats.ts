import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";

/**
 * Board headline numbers. Public: nothing here is user-specific, and the whole
 * point is that a judge can open the site cold and see it.
 */
export const global = query({
  args: {},
  returns: v.union(schema.doc("appStats"), v.null()),
  handler: async (ctx) => {
    return await ctx.db
      .query("appStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
  },
});
