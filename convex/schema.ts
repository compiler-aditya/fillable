import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Availability, normalized.
 *
 * The FDA publishes four distinct strings, one of which is a live typo
 * ("Unvailable", count 1 as of 2026-09-14). Anything unrecognized becomes
 * "unknown" and is surfaced on /pipeline rather than silently bucketed, so a
 * new FDA value is visible instead of quietly mis-filed.
 */
export const availability = v.union(
  v.literal("available"),
  v.literal("limited"),
  v.literal("unavailable"),
  v.literal("unknown"),
);

/** FDA shortage lifecycle for a presentation. */
export const shortageStatus = v.union(
  v.literal("current"),
  v.literal("to_be_discontinued"),
  v.literal("resolved"),
  v.literal("unknown"),
);

/** Direction of a change, which drives ticker colour and alert thresholds. */
export const severity = v.union(
  v.literal("good"),
  v.literal("bad"),
  v.literal("neutral"),
);

export const eventKind = v.union(
  v.literal("availability_changed"),
  v.literal("status_changed"),
  v.literal("reason_changed"),
  v.literal("recovery_date_changed"),
  v.literal("presentation_added"),
  v.literal("presentation_retired"),
  // update_date moved but nothing material did. Shown in history, never alerts.
  v.literal("reverified_unchanged"),
  // The FDA website, ASHP and the API disagree about the same drug.
  v.literal("source_disagreement"),
  // Enough people report failing to fill something the FDA calls available.
  v.literal("crowd_contradiction"),
);

export const fillOutcome = v.union(
  v.literal("filled"),
  v.literal("could_not_fill"),
);

export const reportOrigin = v.union(
  v.literal("web"),
  v.literal("email"),
);

export default defineSchema({
  ...authTables,

  /** The watchable unit: one active ingredient + dosage form. ~350 rows. */
  drugs: defineTable({
    slug: v.string(),
    genericName: v.string(),
    displayName: v.string(),
    dosageForm: v.optional(v.string()),
    therapeuticCategories: v.array(v.string()),
    /** Brands genuinely distinct from the generic name (VYVANSE, ATIVAN). */
    brandNames: v.array(v.string()),
    /** Generic + brands + form, flattened: search indexes take one string. */
    searchText: v.string(),

    // Denormalized because Convex has no count operator and .collect().length
    // is forbidden. Maintained transactionally in applyBatch.
    presentationCount: v.number(),
    availableCount: v.number(),
    limitedCount: v.number(),
    unavailableCount: v.number(),
    watcherCount: v.number(),
    conflictCount: v.number(),

    /** True when some presentations are available while the drug reads "in shortage". */
    hasAvailableInShortage: v.boolean(),
    /** At least one presentation still carries FDA status "current". */
    hasCurrentShortage: v.boolean(),
    /**
     * Both an available AND an unavailable/limited presentation exist.
     *
     * This is the product's core filter: these are precisely the drugs where
     * asking the pharmacy for a specific NDC changes the answer, rather than
     * asking for the drug by name and being told "we're out".
     */
    isSplit: v.boolean(),
    lastChangedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_last_changed_at", ["lastChangedAt"])
    .index("by_watcher_count", ["watcherCount"])
    .index("by_is_split", ["isSplit"])
    // Split drugs, largest first — the board's default ordering.
    .index("by_is_split_and_presentation_count", ["isSplit", "presentationCount"])
    .index("by_has_available_in_shortage", ["hasAvailableInShortage"])
    .searchIndex("search_drug", {
      searchField: "searchText",
      filterFields: ["isSplit"],
    }),

  /** One row per NDC package. The core table. ~1602 rows. */
  presentations: defineTable({
    drugId: v.id("drugs"),

    /** Stable identity across syncs: packageNdc + company. Unique. */
    recordKey: v.string(),
    packageNdc: v.string(),
    companyName: v.string(),
    presentationText: v.string(),
    brandNames: v.array(v.string()),

    availability,
    status: shortageStatus,
    shortageReason: v.optional(v.string()),
    /** FDA's free-text note, often carrying "Estimated availability: October 2026". */
    relatedInfo: v.optional(v.string()),
    recoveryDateText: v.optional(v.string()),

    /**
     * Hash of MATERIAL fields only — deliberately excludes update_date and
     * update_type. "Reverified" is 853 of 1602 records and usually means
     * nothing changed; diffing on update_date would make the ticker pure noise.
     */
    materialHash: v.string(),

    fdaUpdateDate: v.optional(v.string()),
    fdaUpdateAtMs: v.optional(v.number()),
    updateType: v.optional(v.string()),

    lastSeenAt: v.number(),
    lastChangedAt: v.optional(v.number()),
    isRetired: v.boolean(),
  })
    .index("by_record_key", ["recordKey"])
    .index("by_drug", ["drugId"])
    .index("by_drug_and_availability", ["drugId", "availability"])
    .index("by_package_ndc", ["packageNdc"])
    .index("by_last_seen_at", ["lastSeenAt"]),

  /**
   * Change history and the live ticker. A child table rather than an array on
   * the drug: documents cap at 1MB and a whole-doc rewrite per event would not
   * survive a full reconcile.
   */
  statusEvents: defineTable({
    drugId: v.id("drugs"),
    presentationId: v.optional(v.id("presentations")),
    kind: eventKind,
    severity,
    field: v.optional(v.string()),
    previousValue: v.optional(v.string()),
    nextValue: v.optional(v.string()),
    /** Plain-language line for the ticker and the alert email. */
    summary: v.string(),
    source: v.union(
      v.literal("openfda"),
      v.literal("fda_page"),
      v.literal("ashp"),
      v.literal("crowd"),
    ),
    runId: v.optional(v.id("syncRuns")),
    occurredAt: v.number(),
  })
    .index("by_occurred_at", ["occurredAt"])
    .index("by_drug_and_occurred_at", ["drugId", "occurredAt"])
    .index("by_severity_and_occurred_at", ["severity", "occurredAt"]),

  /** The crowd layer. High churn, so its own table. */
  fillReports: defineTable({
    drugId: v.id("drugs"),
    presentationId: v.optional(v.id("presentations")),
    outcome: fillOutcome,
    origin: reportOrigin,
    /** sha256 of a client-minted key. Never the raw key, never an address. */
    reporterHash: v.string(),
    userId: v.optional(v.id("users")),
    /** Signed-in reports weigh 2, anonymous 1, in the conflict threshold. */
    weight: v.number(),
    reportedAt: v.number(),
  })
    .index("by_presentation_and_reported_at", ["presentationId", "reportedAt"])
    .index("by_drug_and_reported_at", ["drugId", "reportedAt"])
    .index("by_reporter_and_reported_at", ["reporterHash", "reportedAt"]),

  /** Denormalized rolling windows, recomputed on a 10-minute cron. */
  fillCounters: defineTable({
    presentationId: v.id("presentations"),
    drugId: v.id("drugs"),
    filled24h: v.number(),
    couldNotFill24h: v.number(),
    filled7d: v.number(),
    couldNotFill7d: v.number(),
    /** FDA says available, but the crowd says otherwise past the threshold. */
    isConflicting: v.boolean(),
    recomputedAt: v.number(),
  })
    .index("by_presentation", ["presentationId"])
    .index("by_drug", ["drugId"])
    .index("by_is_conflicting", ["isConflicting"]),

  /** The Firecrawl second opinion. ASHP is 403 to plain fetch. ~186 rows. */
  ashpBulletins: defineTable({
    bulletinId: v.string(),
    title: v.string(),
    detailUrl: v.string(),
    revisionDateText: v.optional(v.string()),
    revisionAtMs: v.optional(v.number()),
    createdDateText: v.optional(v.string()),
    drugId: v.optional(v.id("drugs")),
    matchState: v.union(
      v.literal("unmatched"),
      v.literal("matched"),
      v.literal("no_fda_equivalent"),
    ),
    lastSeenAt: v.number(),
  })
    .index("by_bulletin_id", ["bulletinId"])
    .index("by_match_state", ["matchState"])
    .index("by_drug", ["drugId"])
    .index("by_revision_at", ["revisionAtMs"]),

  watches: defineTable({
    userId: v.id("users"),
    drugId: v.id("drugs"),
    presentationId: v.optional(v.id("presentations")),
    notifyOn: v.union(v.literal("any_change"), v.literal("becomes_available")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_drug", ["drugId"])
    .index("by_user_and_drug", ["userId", "drugId"]),

  alerts: defineTable({
    watchId: v.id("watches"),
    userId: v.id("users"),
    statusEventId: v.id("statusEvents"),
    /** `${watchId}:${statusEventId}` — insert-or-skip against double sends. */
    dedupeKey: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      // The user was on the page when it changed; emailing them would be noise.
      v.literal("skipped_present"),
    ),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_state_and_created_at", ["state", "createdAt"])
    .index("by_message_id", ["messageId"]),

  /** Webhook idempotency + audit trail. Deliveries are at-least-once. */
  emailEvents: defineTable({
    eventId: v.string(),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    direction: v.union(v.literal("in"), v.literal("out")),
    processedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_message_id", ["messageId"]),

  /** Observability, and the data behind the /pipeline demo screen. */
  syncRuns: defineTable({
    source: v.union(
      v.literal("openfda_delta"),
      v.literal("openfda_full"),
      v.literal("fda_page"),
      v.literal("ashp_changefeed"),
      v.literal("ashp_full"),
      v.literal("fda_detail"),
    ),
    state: v.union(v.literal("running"), v.literal("ok"), v.literal("error")),
    triggeredBy: v.union(v.literal("cron"), v.literal("manual")),
    recordsSeen: v.number(),
    recordsChanged: v.number(),
    eventsEmitted: v.number(),
    /** Read from the real Firecrawl metadata.creditsUsed, never estimated. */
    firecrawlCredits: v.number(),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_started_at", ["startedAt"])
    .index("by_source_and_started_at", ["source", "startedAt"])
    .index("by_state", ["state"]),

  /** Cache for OpenAI drug-name normalization, keyed on the lowercased query. */
  normalizations: defineTable({
    query: v.string(),
    resolvedDrugIds: v.array(v.id("drugs")),
    interpretation: v.string(),
    needsClarification: v.boolean(),
    createdAt: v.number(),
  }).index("by_query", ["query"]),

  /** Singleton row: board headline numbers and the Firecrawl budget guard. */
  appStats: defineTable({
    key: v.string(),
    totalPresentations: v.number(),
    /** Drugs with at least one presentation still in FDA status "current". */
    currentShortageCount: v.number(),
    /** NDC packages marked Available while their drug is in shortage. */
    availableInShortageCount: v.number(),
    /** Drugs where asking by NDC changes the answer. The headline number. */
    splitDrugCount: v.number(),
    drugCount: v.number(),
    conflictCount: v.number(),
    firecrawlCreditsUsedToday: v.number(),
    firecrawlBudgetDay: v.string(),
    fdaApiLastUpdated: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
