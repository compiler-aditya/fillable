/**
 * ASHP ingestion, via Firecrawl.
 *
 * ASHP is the second opinion. By its own documentation it "frequently lists
 * more shortages than FDA", and the counts diverge — 227 versus roughly 197 as
 * of September 2026. Where the two disagree is the most useful thing this
 * product can tell someone, because it means the official record a pharmacist
 * is likely to check may not be the whole picture.
 *
 * It has no API and returns 403 to a plain fetch, so Firecrawl is the only way
 * in from a Convex action.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation } from "../_generated/server";
import {
  ASHP_BY_REVISION_URL,
  ASHP_LIST_URL,
  ashpPageActions,
  matchKey,
  parseAshpList,
} from "../lib/ashpParse";
import { scrapeMarkdown } from "../lib/firecrawl";
import { routesCompatible } from "../lib/route";

/** Fallback when FIRECRAWL_DAILY_CAP is unset. Generous but finite. */
const DEFAULT_DAILY_CAP = 400;

/** At 100 rows a page, 186 bulletins is two reads. Three is ample headroom. */
const MAX_PAGES = 4;

const today = (nowMs: number): string =>
  new Date(nowMs).toISOString().slice(0, 10);

/**
 * Reserve budget before spending it.
 *
 * Checked *before* every scrape rather than after, so going over cap skips the
 * call and records a skipped run instead of spending the credit and then
 * complaining about it.
 */
export const reserveCredits = internalMutation({
  args: { estimated: v.number(), nowMs: v.number() },
  returns: v.object({
    allowed: v.boolean(),
    usedToday: v.number(),
    cap: v.number(),
  }),
  handler: async (ctx, args) => {
    const capRaw = Number(process.env.FIRECRAWL_DAILY_CAP);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : DEFAULT_DAILY_CAP;

    const stats = await ctx.db
      .query("appStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    const day = today(args.nowMs);
    // A new day resets the meter.
    const usedToday =
      stats === null || stats.firecrawlBudgetDay !== day
        ? 0
        : stats.firecrawlCreditsUsedToday;

    if (usedToday + args.estimated > cap) {
      return { allowed: false, usedToday, cap };
    }

    if (stats !== null) {
      await ctx.db.patch("appStats", stats._id, {
        firecrawlBudgetDay: day,
        firecrawlCreditsUsedToday: usedToday,
      });
    }
    return { allowed: true, usedToday, cap };
  },
});

/** Record what a scrape actually cost, read from Firecrawl's own response. */
export const recordCredits = internalMutation({
  args: { runId: v.id("syncRuns"), credits: v.number(), nowMs: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("syncRuns", args.runId);
    if (run !== null) {
      await ctx.db.patch("syncRuns", args.runId, {
        firecrawlCredits: run.firecrawlCredits + args.credits,
      });
    }

    const stats = await ctx.db
      .query("appStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (stats === null) return null;

    const day = today(args.nowMs);
    const base =
      stats.firecrawlBudgetDay === day ? stats.firecrawlCreditsUsedToday : 0;
    await ctx.db.patch("appStats", stats._id, {
      firecrawlBudgetDay: day,
      firecrawlCreditsUsedToday: base + args.credits,
    });
    return null;
  },
});

const bulletinValidator = v.object({
  bulletinId: v.string(),
  title: v.string(),
  detailUrl: v.string(),
  revisionDateText: v.optional(v.string()),
  revisionAtMs: v.optional(v.number()),
  createdDateText: v.optional(v.string()),
});

/**
 * Store bulletins and try to line each one up with an FDA drug.
 *
 * Matching reuses the drug search index rather than a second stored key, and
 * only accepts a hit when the normalised names agree exactly. ASHP titles are
 * clinical ("Amino Acid Products") where the FDA is chemical ("Amino Acid
 * Injection"), so a fuzzy match would confidently pair the wrong drugs. A
 * near-miss stays `unmatched` and waits for a model pass — an unmatched
 * bulletin is honest, a wrongly matched one is a lie about someone's medicine.
 */
export const upsertBulletins = internalMutation({
  args: {
    runId: v.id("syncRuns"),
    bulletins: v.array(bulletinValidator),
    nowMs: v.number(),
  },
  returns: v.object({ stored: v.number(), matched: v.number(), events: v.number() }),
  handler: async (ctx, args) => {
    let stored = 0;
    let matched = 0;
    let events = 0;

    for (const b of args.bulletins) {
      const key = matchKey(b.title);

      let drugId: Id<"drugs"> | undefined = undefined;
      if (key.length > 2) {
        const candidates = await ctx.db
          .query("drugs")
          .withSearchIndex("search_drug", (q) => q.search("searchText", b.title))
          .take(5);
        // matchKey deliberately strips dosage-form words so "Amiodarone
        // Injection" and "Amiodarone" align — but that also collapses
        // "Calcitriol Injection" and "Calcitriol Capsule" to the same key.
        // The route guard is applied here too, not only on the model path:
        // both paths create matches, and a rule enforced on one of them is
        // not enforced at all.
        const exact = candidates.find(
          (d) =>
            matchKey(d.genericName) === key &&
            routesCompatible(b.title, d.genericName),
        );
        if (exact !== undefined) drugId = exact._id;
      }
      if (drugId !== undefined) matched++;

      const existing = await ctx.db
        .query("ashpBulletins")
        .withIndex("by_bulletin_id", (q) => q.eq("bulletinId", b.bulletinId))
        .unique();

      const fields = {
        ...b,
        drugId,
        matchState:
          drugId !== undefined ? ("matched" as const) : ("unmatched" as const),
        lastSeenAt: args.nowMs,
      };

      if (existing === null) {
        await ctx.db.insert("ashpBulletins", fields);
        stored++;

        // ASHP tracks a shortage the FDA's own list does not reflect as
        // current. That gap is the product's second-opinion claim, made
        // concrete rather than asserted.
        if (drugId !== undefined) {
          const drug = await ctx.db.get("drugs", drugId);
          if (drug !== null && !drug.hasCurrentShortage) {
            await ctx.db.insert("statusEvents", {
              drugId,
              kind: "source_disagreement",
              severity: "neutral",
              summary: `ASHP lists ${b.title} as a current shortage; the FDA record does not`,
              source: "ashp",
              runId: args.runId,
              occurredAt: args.nowMs,
            });
            events++;
          }
        }
      } else if (
        existing.revisionDateText !== b.revisionDateText ||
        existing.matchState === "unmatched"
      ) {
        await ctx.db.patch("ashpBulletins", existing._id, fields);
        stored++;
      } else {
        await ctx.db.patch("ashpBulletins", existing._id, {
          lastSeenAt: args.nowMs,
        });
      }
    }

    const run = await ctx.db.get("syncRuns", args.runId);
    if (run !== null) {
      await ctx.db.patch("syncRuns", args.runId, {
        recordsSeen: run.recordsSeen + args.bulletins.length,
        recordsChanged: run.recordsChanged + stored,
        eventsEmitted: run.eventsEmitted + events,
      });
    }

    return { stored, matched, events };
  },
});

/**
 * Walk ASHP pages through Firecrawl, respecting the credit budget.
 *
 * `maxPages: 1` sorted by revision date is the cheap changefeed — the most
 * recently revised bulletins first, for one credit. The full sweep walks all
 * nineteen pages.
 */
export const sweep = internalAction({
  args: {
    maxPages: v.optional(v.number()),
    sortByRevision: v.optional(v.boolean()),
    triggeredBy: v.optional(v.union(v.literal("cron"), v.literal("manual"))),
  },
  returns: v.object({
    pages: v.number(),
    bulletins: v.number(),
    matched: v.number(),
    credits: v.number(),
    stoppedForBudget: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const wantPages = Math.min(args.maxPages ?? 1, MAX_PAGES);

    const runId: Id<"syncRuns"> = await ctx.runMutation(
      internal.ingest.fda.startRun,
      {
        source: wantPages > 1 ? "ashp_full" : "ashp_changefeed",
        triggeredBy: args.triggeredBy ?? "cron",
        startedAt,
      },
    );

    let pages = 0;
    let bulletins = 0;
    let matched = 0;
    let credits = 0;
    let stoppedForBudget = false;

    try {
      for (let page = 1; page <= wantPages; page++) {
        const budget = await ctx.runMutation(internal.ingest.ashp.reserveCredits, {
          estimated: 1,
          nowMs: Date.now(),
        });
        if (!budget.allowed) {
          stoppedForBudget = true;
          break;
        }

        const result = await scrapeMarkdown({
          url:
            args.sortByRevision === true ? ASHP_BY_REVISION_URL : ASHP_LIST_URL,
          // Page 1 is index 0; each further page is one more "Next" click.
          actions: ashpPageActions(page - 1),
        });
        credits += result.creditsUsed;
        await ctx.runMutation(internal.ingest.ashp.recordCredits, {
          runId,
          credits: result.creditsUsed,
          nowMs: Date.now(),
        });

        const parsed = parseAshpList(result.markdown);
        pages++;

        // A page that parses to nothing means the markup moved. Stop rather
        // than walk eighteen more pages producing nothing and paying for it.
        if (parsed.bulletins.length === 0) {
          throw new Error(
            `ASHP page ${page} parsed to zero bulletins — markup may have changed`,
          );
        }

        const applied = await ctx.runMutation(
          internal.ingest.ashp.upsertBulletins,
          { runId, bulletins: parsed.bulletins, nowMs: Date.now() },
        );
        bulletins += parsed.bulletins.length;
        matched += applied.matched;

        // Stop early once the site says we have seen everything.
        if (
          parsed.totalEntries !== undefined &&
          bulletins >= parsed.totalEntries
        ) {
          break;
        }
      }

      await ctx.runMutation(internal.ingest.fda.finishRun, {
        runId,
        state: "ok",
        error: stoppedForBudget ? "stopped: daily Firecrawl cap reached" : undefined,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.ingest.fda.finishRun, {
        runId,
        state: "error",
        error: detail.slice(0, 500),
      });
      throw error;
    }

    return { pages, bulletins, matched, credits, stoppedForBudget };
  },
});
