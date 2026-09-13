import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import schema from "./schema";

const MAX_DRUGS = 100;
const MAX_PRESENTATIONS = 400;

/**
 * The board: drugs where knowing the NDC changes the answer.
 *
 * Ordered by how many packages the drug has, largest first, because those are
 * both the most consequential and the hardest to work out by phoning around.
 */
export const board = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(schema.doc("drugs")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("drugs")
      .withIndex("by_is_split_and_presentation_count", (q) =>
        q.eq("isSplit", true),
      )
      .order("desc")
      .take(Math.min(args.limit ?? 24, MAX_DRUGS));
  },
});

/**
 * Full-text search over generic name, brands and dosage form.
 *
 * Brands matter disproportionately here: nobody types "Amphetamine Aspartate
 * Monohydrate", they type "Adderall". 111 drugs carry a brand distinct from
 * their generic name and those are the ones people reach for.
 */
export const search = query({
  args: {
    q: v.string(),
    splitOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(schema.doc("drugs")),
  handler: async (ctx, args) => {
    const term = args.q.trim();
    // One or two characters matches nearly everything and is never a real query.
    if (term.length < 2) return [];

    return await ctx.db
      .query("drugs")
      .withSearchIndex("search_drug", (q) => {
        const base = q.search("searchText", term);
        return args.splitOnly === true ? base.eq("isSplit", true) : base;
      })
      .take(Math.min(args.limit ?? 20, 50));
  },
});

/**
 * Everything one drug page needs, in a single reactive subscription.
 *
 * Combined rather than split across three queries so the page updates as one
 * consistent unit — a partial update where the counts and the rows disagree
 * would be worse than a slightly larger payload.
 */
export const detail = query({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      drug: schema.doc("drugs"),
      available: v.array(schema.doc("presentations")),
      limited: v.array(schema.doc("presentations")),
      unavailable: v.array(schema.doc("presentations")),
      /** The single package to ask a pharmacy for, when one exists. */
      askFor: v.union(schema.doc("presentations"), v.null()),
      truncated: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const drug = await ctx.db
      .query("drugs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (drug === null) return null;

    const rows = await ctx.db
      .query("presentations")
      .withIndex("by_drug", (q) => q.eq("drugId", drug._id))
      .take(MAX_PRESENTATIONS);

    const live = rows.filter((p) => !p.isRetired);
    const bucket = (a: string) => live.filter((p) => p.availability === a);

    const available = bucket("available");
    // Prefer a package still formally in shortage: that is the surprising,
    // useful case the product exists to surface. Otherwise any available one.
    const askFor: Doc<"presentations"> | null =
      available.find((p) => p.status === "current") ?? available[0] ?? null;

    return {
      drug,
      available,
      limited: bucket("limited"),
      unavailable: bucket("unavailable"),
      askFor,
      truncated: rows.length === MAX_PRESENTATIONS,
    };
  },
});

/** Drugs a visitor is most likely to recognise, for an empty search box. */
export const suggestions = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(schema.doc("drugs")),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 8, 24);
    const page = await ctx.db
      .query("drugs")
      .withIndex("by_is_split_and_presentation_count", (q) =>
        q.eq("isSplit", true),
      )
      .order("desc")
      .take(60);

    // A recognisable brand is the best proxy for "a person has heard of this".
    const branded = page.filter((d) => d.brandNames.length > 0);
    return (branded.length >= limit ? branded : page).slice(0, limit);
  },
});
