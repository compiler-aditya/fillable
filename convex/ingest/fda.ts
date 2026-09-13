/**
 * openFDA ingestion.
 *
 * Two entry points, both internal:
 *   - `pollDelta`     cheap, frequent: the 150 most recently updated records.
 *   - `fullReconcile` complete sweep, reconciles and retires missing rows.
 *
 * The action does the network I/O and then drives a sequence of `applyBatch`
 * mutations. Each mutation is its own transaction, which is why the batching
 * lives here rather than inside one giant mutation: 1,602 upserts would blow a
 * single transaction's document and byte limits.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import {
  fetchAll,
  fetchMeta,
  fetchRecentlyUpdated,
} from "../lib/fdaApi";
import {
  buildSearchText,
  normalizeRecord,
  supersedeDuplicates,
  type NormalizedRecord,
  type NormalizeWarning,
} from "../lib/fdaRecord";
import { availability, shortageStatus } from "../schema";

/** How many records go into one transaction. Keeps each well inside limits. */
const BATCH_SIZE = 40;

/** Drugs whose counters are recomputed per transaction. */
const COUNTER_BATCH = 25;

/** Presentations read per drug when recomputing counters. Bounded, never .collect(). */
const MAX_PRESENTATIONS_PER_DRUG = 600;

/** Wire shape for a normalized record crossing the action → mutation boundary. */
const recordValidator = v.object({
  recordKey: v.string(),
  packageNdc: v.string(),
  genericName: v.string(),
  slug: v.string(),
  displayName: v.string(),
  companyName: v.string(),
  presentationText: v.string(),
  availability,
  status: shortageStatus,
  shortageReason: v.optional(v.string()),
  relatedInfo: v.optional(v.string()),
  recoveryDateText: v.optional(v.string()),
  dosageForm: v.optional(v.string()),
  therapeuticCategories: v.array(v.string()),
  brandNames: v.array(v.string()),
  fdaUpdateDate: v.optional(v.string()),
  fdaUpdateAtMs: v.optional(v.number()),
  updateType: v.optional(v.string()),
  materialHash: v.string(),
});

/**
 * Direction of an availability move, which drives ticker colour and whether an
 * alert is worth sending. Becoming gettable is the good news the product exists
 * to deliver.
 */
function availabilitySeverity(
  from: string,
  to: string,
): "good" | "bad" | "neutral" {
  const gettable = (x: string) => x === "available";
  const blocked = (x: string) => x === "unavailable" || x === "limited";
  if (blocked(from) && gettable(to)) return "good";
  if (gettable(from) && blocked(to)) return "bad";
  return "neutral";
}

const shortName = (r: NormalizedRecord) => `${r.displayName} (${r.packageNdc})`;

/**
 * How to describe a package in one phrase.
 *
 * The FDA omits `availability` entirely on discontinuations and resolutions —
 * 444 of 1,596 records — so those normalize to "unknown". Saying "added as
 * unknown" is meaningless to a reader; the status is the real information
 * there, so lead with it.
 */
function describeState(r: NormalizedRecord): string {
  if (r.availability !== "unknown") return r.availability;
  if (r.status === "to_be_discontinued") return "to be discontinued";
  if (r.status === "resolved") return "resolved";
  return "no availability stated";
}

async function findOrCreateDrug(
  ctx: MutationCtx,
  r: NormalizedRecord,
): Promise<Id<"drugs">> {
  const existing = await ctx.db
    .query("drugs")
    .withIndex("by_slug", (q) => q.eq("slug", r.slug))
    .unique();

  if (existing !== null) return existing._id;

  return await ctx.db.insert("drugs", {
    slug: r.slug,
    genericName: r.genericName,
    displayName: r.displayName,
    dosageForm: r.dosageForm,
    therapeuticCategories: r.therapeuticCategories,
    brandNames: r.brandNames,
    searchText: buildSearchText(r.genericName, r.brandNames, r.dosageForm),
    presentationCount: 0,
    availableCount: 0,
    limitedCount: 0,
    unavailableCount: 0,
    watcherCount: 0,
    conflictCount: 0,
    hasAvailableInShortage: false,
    hasCurrentShortage: false,
    isSplit: false,
  });
}

/** Apply one record. Returns how many events it produced. */
async function applyRecord(
  ctx: MutationCtx,
  r: NormalizedRecord,
  runId: Id<"syncRuns">,
  now: number,
): Promise<{ changed: boolean; events: number }> {
  const drugId = await findOrCreateDrug(ctx, r);

  const existing = await ctx.db
    .query("presentations")
    .withIndex("by_record_key", (q) => q.eq("recordKey", r.recordKey))
    .unique();

  const common = {
    drugId,
    recordKey: r.recordKey,
    packageNdc: r.packageNdc,
    companyName: r.companyName,
    presentationText: r.presentationText,
    brandNames: r.brandNames,
    availability: r.availability,
    status: r.status,
    shortageReason: r.shortageReason,
    relatedInfo: r.relatedInfo,
    recoveryDateText: r.recoveryDateText,
    materialHash: r.materialHash,
    fdaUpdateDate: r.fdaUpdateDate,
    fdaUpdateAtMs: r.fdaUpdateAtMs,
    updateType: r.updateType,
    lastSeenAt: now,
  };

  if (existing === null) {
    const presentationId = await ctx.db.insert("presentations", {
      ...common,
      lastChangedAt: now,
      isRetired: false,
    });
    await ctx.db.insert("statusEvents", {
      drugId,
      presentationId,
      kind: "presentation_added",
      severity: r.availability === "available" ? "good" : "neutral",
      summary: `${shortName(r)} added to the FDA record — ${describeState(r)}`,
      source: "openfda",
      runId,
      occurredAt: now,
    });
    return { changed: true, events: 1 };
  }

  // Nothing material moved. Refresh the bookkeeping fields only.
  if (existing.materialHash === r.materialHash) {
    const dateMoved =
      existing.fdaUpdateDate !== r.fdaUpdateDate && r.fdaUpdateDate !== undefined;

    await ctx.db.patch("presentations", existing._id, {
      fdaUpdateDate: r.fdaUpdateDate,
      fdaUpdateAtMs: r.fdaUpdateAtMs,
      updateType: r.updateType,
      // Refreshed even on the no-change path. Brands are derived metadata and
      // deliberately excluded from the material hash, because a brand moving
      // is not news worth alerting anyone about. But that also means a change
      // to how brands are derived would never reach stored rows — which is how
      // a wrong brand survived a full re-sync. Derived fields refresh here;
      // only the hash decides whether anything is announced.
      brandNames: r.brandNames,
      lastSeenAt: now,
      isRetired: false,
    });

    // The FDA touched this record and nothing we track moved. Worth showing in
    // a drug's history as evidence the record is genuinely fresh, but it must
    // never alert: on the live dataset 853 of 1,596 records are "Reverified".
    //
    // Applies to any update_type, not just Reverified. The FDA also publishes
    // "Revised" (291) and "New" (458), and a "Revised" row whose material hash
    // is unchanged means it revised a field we do not display — contact info,
    // therapeutic category. Treating only Reverified this way would drop those
    // silently instead of recording that the FDA looked.
    if (dateMoved) {
      const how = r.updateType ?? "updated";
      await ctx.db.insert("statusEvents", {
        drugId,
        presentationId: existing._id,
        kind: "reverified_unchanged",
        severity: "neutral",
        summary: `FDA ${how.toLowerCase()} ${shortName(r)} on ${r.fdaUpdateDate} — nothing we track changed`,
        source: "openfda",
        runId,
        occurredAt: now,
      });
      return { changed: false, events: 1 };
    }
    return { changed: false, events: 0 };
  }

  // Something material moved. Emit one event per changed field.
  let events = 0;
  const emit = async (
    kind: "availability_changed" | "status_changed" | "reason_changed" | "recovery_date_changed",
    sev: "good" | "bad" | "neutral",
    field: string,
    previousValue: string | undefined,
    nextValue: string | undefined,
    summary: string,
  ) => {
    await ctx.db.insert("statusEvents", {
      drugId,
      presentationId: existing._id,
      kind,
      severity: sev,
      field,
      previousValue,
      nextValue,
      summary,
      source: "openfda",
      runId,
      occurredAt: now,
    });
    events++;
  };

  if (existing.availability !== r.availability) {
    await emit(
      "availability_changed",
      availabilitySeverity(existing.availability, r.availability),
      "availability",
      existing.availability,
      r.availability,
      `${shortName(r)} went ${existing.availability} → ${r.availability}`,
    );
  }
  if (existing.status !== r.status) {
    await emit(
      "status_changed",
      r.status === "resolved" ? "good" : "neutral",
      "status",
      existing.status,
      r.status,
      `${shortName(r)} shortage status ${existing.status} → ${r.status}`,
    );
  }
  if (existing.shortageReason !== r.shortageReason) {
    await emit(
      "reason_changed",
      "neutral",
      "shortageReason",
      existing.shortageReason,
      r.shortageReason,
      `${shortName(r)} reason now: ${r.shortageReason ?? "not stated"}`,
    );
  }
  if (existing.recoveryDateText !== r.recoveryDateText) {
    await emit(
      "recovery_date_changed",
      r.recoveryDateText === undefined ? "bad" : "good",
      "recoveryDateText",
      existing.recoveryDateText,
      r.recoveryDateText,
      r.recoveryDateText === undefined
        ? `${shortName(r)} no longer has an estimated availability date`
        : `${shortName(r)} estimated available ${r.recoveryDateText}`,
    );
  }

  await ctx.db.patch("presentations", existing._id, {
    ...common,
    lastChangedAt: now,
    isRetired: false,
  });

  return { changed: true, events };
}

export const startRun = internalMutation({
  args: {
    source: v.union(
      v.literal("openfda_delta"),
      v.literal("openfda_full"),
      v.literal("fda_page"),
      v.literal("ashp_changefeed"),
      v.literal("ashp_full"),
      v.literal("fda_detail"),
    ),
    triggeredBy: v.union(v.literal("cron"), v.literal("manual")),
    startedAt: v.number(),
  },
  returns: v.id("syncRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncRuns", {
      source: args.source,
      state: "running",
      triggeredBy: args.triggeredBy,
      recordsSeen: 0,
      recordsChanged: 0,
      eventsEmitted: 0,
      firecrawlCredits: 0,
      startedAt: args.startedAt,
    });
  },
});

export const applyBatch = internalMutation({
  args: {
    runId: v.id("syncRuns"),
    records: v.array(recordValidator),
    now: v.number(),
  },
  returns: v.object({ changed: v.number(), events: v.number() }),
  handler: async (ctx, args) => {
    let changed = 0;
    let events = 0;

    for (const r of args.records) {
      const result = await applyRecord(ctx, r, args.runId, args.now);
      if (result.changed) changed++;
      events += result.events;
    }

    // Progress is written per batch so /pipeline can watch recordsSeen tick up
    // while the sweep is still running. That visible movement is the point.
    const run = await ctx.db.get("syncRuns", args.runId);
    if (run !== null) {
      await ctx.db.patch("syncRuns", args.runId, {
        recordsSeen: run.recordsSeen + args.records.length,
        recordsChanged: run.recordsChanged + changed,
        eventsEmitted: run.eventsEmitted + events,
      });
    }

    return { changed, events };
  },
});

/**
 * Recompute a drug's counters from its presentations.
 *
 * Recomputed rather than delta-adjusted: delta arithmetic drifts permanently
 * the first time a batch fails midway, and a drug has at most ~90 presentations
 * so a bounded read is cheap and self-healing.
 */
export const recomputeCounters = internalMutation({
  args: { cursor: v.optional(v.string()), runId: v.id("syncRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("drugs")
      .withIndex("by_slug", (q) =>
        args.cursor === undefined ? q : q.gt("slug", args.cursor),
      )
      .take(COUNTER_BATCH);

    if (page.length === 0) {
      await ctx.scheduler.runAfter(0, internal.ingest.fda.rebuildStats, {
        runId: args.runId,
      });
      return null;
    }

    for (const drug of page) {
      const presentations = await ctx.db
        .query("presentations")
        .withIndex("by_drug", (q) => q.eq("drugId", drug._id))
        .take(MAX_PRESENTATIONS_PER_DRUG);

      const live = presentations.filter((p) => !p.isRetired);
      const availableCount = live.filter((p) => p.availability === "available").length;
      const limitedCount = live.filter((p) => p.availability === "limited").length;
      const unavailableCount = live.filter((p) => p.availability === "unavailable").length;

      // The thesis, per drug: the FDA calls this a shortage, yet some specific
      // package inside it is gettable today.
      const hasAvailableInShortage = live.some(
        (p) => p.status === "current" && p.availability === "available",
      );
      const hasCurrentShortage = live.some((p) => p.status === "current");

      // Both sides present: asking for this drug by name gets you "we're out",
      // asking for the right NDC gets you the medication.
      const isSplit = availableCount > 0 && unavailableCount + limitedCount > 0;

      // Brands arrive per NDC and unevenly — only the branded manufacturer's
      // rows carry "VYVANSE". Union them so the drug is findable by any brand
      // any of its packages is sold under.
      const brandNames = [
        ...new Set(presentations.flatMap((p) => p.brandNames)),
      ].sort();

      await ctx.db.patch("drugs", drug._id, {
        presentationCount: live.length,
        availableCount,
        limitedCount,
        unavailableCount,
        hasAvailableInShortage,
        hasCurrentShortage,
        isSplit,
        brandNames,
        searchText: buildSearchText(drug.genericName, brandNames, drug.dosageForm),
      });
    }

    await ctx.scheduler.runAfter(0, internal.ingest.fda.recomputeCounters, {
      cursor: page[page.length - 1].slug,
      runId: args.runId,
    });
    return null;
  },
});

export const rebuildStats = internalMutation({
  args: { runId: v.id("syncRuns"), fdaLastUpdated: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    let totalPresentations = 0;
    let currentShortageCount = 0;
    let availableInShortageCount = 0;
    let splitDrugCount = 0;
    let drugCount = 0;

    // Bounded page walk rather than .collect(): the table is ~1600 rows today
    // but must not become an unbounded read as the FDA list grows.
    let cursor: string | undefined = undefined;
    for (;;) {
      const page: Doc<"drugs">[] = await ctx.db
        .query("drugs")
        .withIndex("by_slug", (q) =>
          cursor === undefined ? q : q.gt("slug", cursor as string),
        )
        .take(200);
      if (page.length === 0) break;
      for (const d of page) {
        drugCount++;
        totalPresentations += d.presentationCount;
        availableInShortageCount += d.hasAvailableInShortage ? d.availableCount : 0;
        if (d.hasCurrentShortage) currentShortageCount++;
        if (d.isSplit) splitDrugCount++;
      }
      cursor = page[page.length - 1].slug;
    }

    const existing = await ctx.db
      .query("appStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const fields = {
      key: "global",
      totalPresentations,
      currentShortageCount,
      availableInShortageCount,
      splitDrugCount,
      drugCount,
      conflictCount: existing?.conflictCount ?? 0,
      firecrawlCreditsUsedToday:
        existing?.firecrawlBudgetDay === today
          ? (existing?.firecrawlCreditsUsedToday ?? 0)
          : 0,
      firecrawlBudgetDay: today,
      fdaApiLastUpdated: args.fdaLastUpdated ?? existing?.fdaApiLastUpdated,
      lastSyncAt: now,
      updatedAt: now,
    };

    if (existing === null) await ctx.db.insert("appStats", fields);
    else await ctx.db.patch("appStats", existing._id, fields);

    return null;
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("syncRuns"),
    state: v.union(v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("syncRuns", args.runId, {
      state: args.state,
      error: args.error,
      finishedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Mark presentations the FDA stopped publishing.
 *
 * Retire rather than delete: a package vanishing from the list is itself
 * information, and deleting would orphan its history and any watch pointing at
 * it. Chained through the scheduler because the set is unbounded.
 */
export const retireUnseen = internalMutation({
  args: { runId: v.id("syncRuns"), runStartedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("presentations")
      .withIndex("by_last_seen_at", (q) => q.lt("lastSeenAt", args.runStartedAt))
      .take(100);

    const live = stale.filter((p) => !p.isRetired);

    for (const p of live) {
      await ctx.db.patch("presentations", p._id, { isRetired: true });
      await ctx.db.insert("statusEvents", {
        drugId: p.drugId,
        presentationId: p._id,
        kind: "presentation_retired",
        severity: "neutral",
        summary: `${p.packageNdc} is no longer published on the FDA shortage list`,
        source: "openfda",
        runId: args.runId,
        occurredAt: Date.now(),
      });
    }

    // Only continue while a full page came back AND we changed something; a
    // full page of already-retired rows means we have reached the tail.
    if (stale.length === 100 && live.length > 0) {
      await ctx.scheduler.runAfter(0, internal.ingest.fda.retireUnseen, args);
    }
    return null;
  },
});

/**
 * Shared driver for both entry points.
 *
 * A plain helper rather than a third action: the guidelines only permit an
 * action to call an action when crossing runtimes, and there is no runtime
 * boundary here.
 */
async function ingest(
  ctx: ActionCtx,
  raw: unknown[],
  runId: Id<"syncRuns">,
  now: number,
): Promise<{ seen: number; warnings: NormalizeWarning[] }> {
  const warnings: NormalizeWarning[] = [];
  const normalized: NormalizedRecord[] = [];

  for (const item of raw) {
    const n = normalizeRecord(item as never, warnings);
    if (n !== null) normalized.push(n);
  }

  const records = supersedeDuplicates(normalized);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    await ctx.runMutation(internal.ingest.fda.applyBatch, {
      runId,
      records: records.slice(i, i + BATCH_SIZE),
      now,
    });
  }

  return { seen: records.length, warnings };
}

export const fullReconcile = internalAction({
  args: {
    triggeredBy: v.optional(v.union(v.literal("cron"), v.literal("manual"))),
  },
  returns: v.object({ seen: v.number(), unmapped: v.number() }),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const runId: Id<"syncRuns"> = await ctx.runMutation(
      internal.ingest.fda.startRun,
      {
        source: "openfda_full",
        triggeredBy: args.triggeredBy ?? "cron",
        startedAt,
      },
    );

    try {
      const meta = await fetchMeta();
      const raw = await fetchAll(meta.total);
      const { seen, warnings } = await ingest(ctx, raw, runId, startedAt);

      // Anything the FDA publishes that we do not map is surfaced, not
      // swallowed, so a new availability string is visible on /pipeline.
      if (warnings.length > 0) {
        console.warn(
          `openFDA unmapped values: ${JSON.stringify(warnings.slice(0, 10))}`,
        );
      }

      await ctx.runMutation(internal.ingest.fda.retireUnseen, {
        runId,
        runStartedAt: startedAt,
      });
      await ctx.runMutation(internal.ingest.fda.recomputeCounters, { runId });
      await ctx.runMutation(internal.ingest.fda.rebuildStats, {
        runId,
        fdaLastUpdated: meta.lastUpdated,
      });
      await ctx.runMutation(internal.ingest.fda.finishRun, {
        runId,
        state: "ok",
      });

      return { seen, unmapped: warnings.length };
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

export const pollDelta = internalAction({
  args: {
    triggeredBy: v.optional(v.union(v.literal("cron"), v.literal("manual"))),
    limit: v.optional(v.number()),
  },
  returns: v.object({ seen: v.number(), unmapped: v.number() }),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const runId: Id<"syncRuns"> = await ctx.runMutation(
      internal.ingest.fda.startRun,
      {
        source: "openfda_delta",
        triggeredBy: args.triggeredBy ?? "cron",
        startedAt,
      },
    );

    try {
      const raw = await fetchRecentlyUpdated(args.limit ?? 150);
      const { seen, warnings } = await ingest(ctx, raw, runId, startedAt);

      // Deliberately no retireUnseen here: the delta feed is a partial view,
      // so absence from it means nothing. Only the full sweep may retire.
      await ctx.runMutation(internal.ingest.fda.recomputeCounters, { runId });
      await ctx.runMutation(internal.ingest.fda.finishRun, {
        runId,
        state: "ok",
      });

      return { seen, unmapped: warnings.length };
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
