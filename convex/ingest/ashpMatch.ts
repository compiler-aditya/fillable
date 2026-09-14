/**
 * Match ASHP bulletins to FDA drugs with a model.
 *
 * Deterministic matching already handles the easy cases: 29 of 186 bulletins
 * agree exactly once dosage-form wording is stripped. The remaining 157 are
 * hard because the two sources name drugs differently — ASHP writes "Amino Acid
 * Products" where the FDA writes "Amino Acid Injection", and "Oxycodone
 * Hydrochloride and Acetaminophen Tablets" where the FDA writes "Acetaminophen;
 * Oxycodone Hydrochloride Tablet". That is a language problem, which is what a
 * model is for.
 *
 * Two hard constraints on how it is used:
 *
 *  1. The model SELECTS, it never NAMES. It is given a shortlist retrieved from
 *     the search index and may only return an id from that list, or null. A
 *     returned id that was not offered is discarded. A model cannot invent a
 *     drug that does not exist in our data.
 *  2. A wrong match is worse than no match, because it would attach one drug's
 *     shortage record to another. Anything the model is not confident about
 *     stays unmatched.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { activeModelId, chatCompletion } from "../lib/model";
import { routesCompatible } from "../lib/route";

/** Bulletins per model call. Keeps one request small enough to stay reliable. */
const BATCH_SIZE = 25;

/** Hard ceiling on model calls in one run, so a bug cannot drain a budget. */
const MAX_CALLS_PER_RUN = 12;

/** Shortlist size per bulletin. Enough to contain the answer, small enough to read. */
const CANDIDATES = 5;

const candidateValidator = v.object({
  bulletinId: v.string(),
  title: v.string(),
  candidates: v.array(v.object({ id: v.string(), name: v.string() })),
});

/**
 * Shape of one shortlist row.
 *
 * Declared explicitly because `matchUnmatched` calls `candidatesForMatching`
 * from the same file. TypeScript cannot infer through that cycle, and without
 * an annotation the whole action degrades to `any` — which then silently
 * disables type checking on the model's reply, exactly where it matters most.
 */
type MatchCandidate = {
  bulletinId: string;
  title: string;
  candidates: Array<{ id: string; name: string }>;
};

/**
 * Build a shortlist for each unmatched bulletin using the existing search
 * index, so the model never sees the whole catalogue and never has to recall a
 * drug name from memory.
 */
export const candidatesForMatching = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(candidateValidator),
  handler: async (ctx, args) => {
    const unmatched = await ctx.db
      .query("ashpBulletins")
      .withIndex("by_match_state", (q) => q.eq("matchState", "unmatched"))
      .take(Math.min(args.limit ?? 200, 400));

    const out = [];
    for (const b of unmatched) {
      const hits = await ctx.db
        .query("drugs")
        .withSearchIndex("search_drug", (q) => q.search("searchText", b.title))
        .take(CANDIDATES);

      // No candidates means the FDA simply does not track this drug. That is a
      // real answer — ASHP covering something the FDA does not — not a failure.
      out.push({
        bulletinId: b.bulletinId,
        title: b.title,
        candidates: hits.map((d) => ({ id: d._id as string, name: d.genericName })),
      });
    }
    return out;
  },
});

export const applyMatches = internalMutation({
  args: {
    runId: v.optional(v.id("syncRuns")),
    matches: v.array(
      v.object({
        bulletinId: v.string(),
        drugId: v.optional(v.string()),
        noFdaEquivalent: v.boolean(),
      }),
    ),
    nowMs: v.number(),
  },
  returns: v.object({ matched: v.number(), noEquivalent: v.number(), events: v.number() }),
  handler: async (ctx, args) => {
    let matched = 0;
    let noEquivalent = 0;
    let events = 0;

    for (const m of args.matches) {
      const bulletin = await ctx.db
        .query("ashpBulletins")
        .withIndex("by_bulletin_id", (q) => q.eq("bulletinId", m.bulletinId))
        .unique();
      if (bulletin === null) continue;

      if (m.noFdaEquivalent) {
        await ctx.db.patch("ashpBulletins", bulletin._id, {
          matchState: "no_fda_equivalent",
        });
        noEquivalent++;
        continue;
      }

      if (m.drugId === undefined) continue;
      const drug = await ctx.db.get("drugs", m.drugId as Id<"drugs">);
      // Defence in depth: the action already discards ids it did not offer.
      if (drug === null) continue;

      await ctx.db.patch("ashpBulletins", bulletin._id, {
        drugId: drug._id,
        matchState: "matched",
      });
      matched++;

      if (!drug.hasCurrentShortage) {
        await ctx.db.insert("statusEvents", {
          drugId: drug._id,
          kind: "source_disagreement",
          severity: "neutral",
          summary: `ASHP lists ${bulletin.title} as a current shortage; the FDA record does not`,
          source: "ashp",
          runId: args.runId,
          occurredAt: args.nowMs,
        });
        events++;
      }
    }

    if (args.runId !== undefined) {
      const run = await ctx.db.get("syncRuns", args.runId);
      if (run !== null) {
        await ctx.db.patch("syncRuns", args.runId, {
          recordsSeen: run.recordsSeen + args.matches.length,
          recordsChanged: run.recordsChanged + matched + noEquivalent,
          eventsEmitted: run.eventsEmitted + events,
        });
      }
    }

    return { matched, noEquivalent, events };
  },
});

const SYSTEM = `You align drug shortage records between two US sources: ASHP and the FDA.

For each item you are given an ASHP bulletin title and a numbered shortlist of FDA drug names.
Decide which shortlist entry, if any, refers to THE SAME DRUG.

Rules:
- Reply with the id of a shortlist entry ONLY when it is the same active
  ingredient AND the same route of administration.
- Different salts or esters of the same active ingredient are the same drug.
- ROUTE MUST MATCH. Injection, oral, topical, ophthalmic, inhalation and
  irrigation are different products with separate supply chains — a shortage of
  one says nothing about the others. "Calcitriol Injection" does NOT match
  "Calcitriol Capsule". "Sodium Chloride Irrigation" does NOT match "Sodium
  Chloride Injection". Tablet and capsule are both oral and may match.
- A DIFFERENT active ingredient is never a match, however similar the spelling.
  "Acetazolamide" and "Acetylcysteine" are different drugs.
- A combination product matches only a combination of the same ingredients.
- If nothing on the shortlist is the same drug, use null. Guessing is worse than
  null: a wrong match tells a patient their medicine is affected when it is not.

Each item has a number, and each shortlist entry has a number.
Reply with the item number and the CHOSEN ENTRY NUMBER, or null.

Reply with JSON only: {"matches":[{"item":1,"choice":2},{"item":2,"choice":null}]}`;

export const matchUnmatched = internalAction({
  args: {
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    considered: v.number(),
    matched: v.number(),
    noEquivalent: v.number(),
    modelCalls: v.number(),
    rejected: v.number(),
  }),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const runId: Id<"syncRuns"> = await ctx.runMutation(
      internal.ingest.fda.startRun,
      { source: "ashp_full", triggeredBy: "manual", startedAt },
    );

    try {
      const items: MatchCandidate[] = await ctx.runQuery(
        internal.ingest.ashpMatch.candidatesForMatching,
        { limit: args.limit ?? 200 },
      );

      const model = await activeModelId();
      let modelCalls = 0;
      let matched = 0;
      let noEquivalent = 0;
      let rejected = 0;

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        if (modelCalls >= MAX_CALLS_PER_RUN) break;
        const batch = items.slice(i, i + BATCH_SIZE);

        // A bulletin with no shortlist needs no model call — the FDA does not
        // track it at all, which is already the answer.
        const withCandidates = batch.filter((b) => b.candidates.length > 0);
        const without = batch.filter((b) => b.candidates.length === 0);

        const decided: Array<{
          bulletinId: string;
          drugId?: string;
          noFdaEquivalent: boolean;
        }> = without.map((b) => ({
          bulletinId: b.bulletinId,
          noFdaEquivalent: true,
        }));
        noEquivalent += without.length;

        if (withCandidates.length > 0) {
          /*
           * Number the items and their choices rather than passing Convex ids
           * through the model.
           *
           * A first pass using raw ids had 46 of 149 replies rejected: the
           * model returned 32-character random strings that did not match any
           * shortlist entry. The guard caught every one, but a rejected reply
           * is a lost match. Small integers are echoed back reliably, and the
           * mapping back to ids happens here where it cannot be hallucinated.
           */
          const prompt = withCandidates
            .map(
              (b, n) =>
                `item ${n + 1}: "${b.title}"\n` +
                b.candidates
                  .map((c, ci) => `   ${ci + 1}. ${c.name}`)
                  .join("\n"),
            )
            .join("\n\n");

          const reply = await chatCompletion({
            model,
            jsonObject: true,
            maxTokens: 4000,
            reasoningEffort: "low",
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: prompt },
            ],
          });
          modelCalls++;

          let parsed: unknown = null;
          try {
            parsed = JSON.parse(reply);
          } catch {
            // A malformed reply costs this batch, not the run.
            rejected += withCandidates.length;
            continue;
          }

          const rows =
            typeof parsed === "object" && parsed !== null
              ? ((parsed as Record<string, unknown>).matches ?? [])
              : [];
          const list = Array.isArray(rows) ? rows : [];

          for (let n = 0; n < withCandidates.length; n++) {
            const b = withCandidates[n];
            const row = list.find(
              (r) =>
                typeof r === "object" &&
                r !== null &&
                Number((r as Record<string, unknown>).item) === n + 1,
            ) as Record<string, unknown> | undefined;

            const choice = row?.choice;
            if (typeof choice !== "number" || !Number.isInteger(choice)) {
              decided.push({ bulletinId: b.bulletinId, noFdaEquivalent: false });
              continue;
            }

            // The index must address a candidate we actually offered. Anything
            // out of range is discarded rather than written — the id itself is
            // resolved here, so the model never supplies one.
            const picked = b.candidates[choice - 1];
            if (picked === undefined) {
              rejected++;
              continue;
            }

            // Enforce the route rule rather than trusting the prompt. Told
            // explicitly that "Calcitriol Injection" must not match
            // "Calcitriol Capsule", the model made that match anyway. An
            // injection and an oral capsule are separate products with
            // separate supply chains; attaching one's shortage to the other
            // would tell someone their medicine is affected when it is not.
            if (!routesCompatible(b.title, picked.name)) {
              rejected++;
              continue;
            }
            decided.push({
              bulletinId: b.bulletinId,
              drugId: picked.id,
              noFdaEquivalent: false,
            });
          }
        }

        if (args.dryRun === true) continue;

        const applied = await ctx.runMutation(
          internal.ingest.ashpMatch.applyMatches,
          { runId, matches: decided, nowMs: Date.now() },
        );
        matched += applied.matched;
      }

      await ctx.runMutation(internal.ingest.ashpMatch.recordModelCalls, {
        runId,
        calls: modelCalls,
      });
      await ctx.runMutation(internal.ingest.fda.finishRun, {
        runId,
        state: "ok",
      });

      return {
        considered: items.length,
        matched,
        noEquivalent,
        modelCalls,
        rejected,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.ingest.fda.finishRun, {
        runId,
        state: "error",
        error: detail.slice(0, 500),
      });
      throw error;
    }
  },
});

export const recordModelCalls = internalMutation({
  args: { runId: v.id("syncRuns"), calls: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("syncRuns", args.runId);
    if (run !== null) {
      await ctx.db.patch("syncRuns", args.runId, {
        modelCalls: (run.modelCalls ?? 0) + args.calls,
      });
    }
    return null;
  },
});
