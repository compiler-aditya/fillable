import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";

/**
 * The second-opinion surface.
 *
 * Two official sources track US drug shortages and they do not agree. ASHP's
 * own documentation says it "frequently lists more shortages than FDA", and the
 * published counts diverge. A pharmacist or patient checking one of them is
 * seeing part of the picture, so where they disagree is worth stating plainly.
 */

/** ASHP bulletins whose drug the FDA does not currently list as in shortage. */
export const disagreements = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      bulletin: schema.doc("ashpBulletins"),
      drugSlug: v.string(),
      drugName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const matched = await ctx.db
      .query("ashpBulletins")
      .withIndex("by_match_state", (q) => q.eq("matchState", "matched"))
      .take(200);

    const out = [];
    for (const bulletin of matched) {
      if (bulletin.drugId === undefined) continue;
      const drug = await ctx.db.get("drugs", bulletin.drugId);
      if (drug === null || drug.hasCurrentShortage) continue;
      out.push({ bulletin, drugSlug: drug.slug, drugName: drug.displayName });
      if (out.length >= Math.min(args.limit ?? 12, 50)) break;
    }
    return out;
  },
});

/** What each source currently covers, for an honest provenance panel. */
export const coverage = query({
  args: {},
  returns: v.object({
    ashpBulletins: v.number(),
    ashpMatched: v.number(),
    ashpLastSeenAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    // Bounded page walk; ASHP publishes ~186 bulletins, and a hard cap keeps
    // this safe if that grows.
    let ashpBulletins = 0;
    let ashpMatched = 0;
    let ashpLastSeenAt: number | undefined = undefined;

    for (const state of ["matched", "unmatched", "no_fda_equivalent"] as const) {
      const rows = await ctx.db
        .query("ashpBulletins")
        .withIndex("by_match_state", (q) => q.eq("matchState", state))
        .take(500);
      ashpBulletins += rows.length;
      if (state === "matched") ashpMatched = rows.length;
      for (const r of rows) {
        if (ashpLastSeenAt === undefined || r.lastSeenAt > ashpLastSeenAt) {
          ashpLastSeenAt = r.lastSeenAt;
        }
      }
    }

    return { ashpBulletins, ashpMatched, ashpLastSeenAt };
  },
});
