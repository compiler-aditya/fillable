/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { normalizeRecord, type RawFdaRecord } from "./lib/fdaRecord";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ADDERALL_AVAILABLE: RawFdaRecord = {
  package_ndc: "47781-179-01",
  generic_name: "Amphetamine Aspartate Monohydrate Tablet",
  company_name: "Alvogen",
  presentation: "Amphetamine Aspartate Monohydrate, Tablet, 20mg (NDC 47781-179-01)",
  availability: "Available",
  status: "Current",
  update_type: "Reverified",
  update_date: "06/29/2026",
  dosage_form: "Tablet",
  therapeutic_category: ["Psychiatry"],
};

const ADDERALL_UNAVAILABLE: RawFdaRecord = {
  package_ndc: "13107-068-01",
  generic_name: "Amphetamine Aspartate Monohydrate Tablet",
  company_name: "Aurobindo Pharma USA",
  presentation: "Amphetamine Aspartate Monohydrate, Tablet, 1.25mg (NDC 13107-068-01)",
  availability: "Unavailable",
  status: "Current",
  update_type: "Reverified",
  update_date: "06/29/2026",
  shortage_reason: "Shortage of an active ingredient",
  related_info: "Estimated availability: October 2026",
  dosage_form: "Tablet",
  therapeutic_category: ["Psychiatry"],
};

const norm = (raw: RawFdaRecord) => normalizeRecord(raw)!;

/** Start a run and apply a batch, returning the run's counters. */
async function sweep(t: ReturnType<typeof convexTest>, raws: RawFdaRecord[], now = 1_000) {
  const runId = await t.mutation(internal.ingest.fda.startRun, {
    source: "openfda_full",
    triggeredBy: "manual",
    startedAt: now,
  });
  await t.mutation(internal.ingest.fda.applyBatch, {
    runId,
    records: raws.map(norm),
    now,
  });
  const runs = await t.run(async (ctx) => await ctx.db.query("syncRuns").take(10));
  return runs.find((r) => r._id === runId)!;
}

describe("applyBatch", () => {
  test("first sweep creates drugs, presentations and one event each", async () => {
    const t = convexTest(schema, modules);
    const run = await sweep(t, [ADDERALL_AVAILABLE, ADDERALL_UNAVAILABLE]);

    expect(run.recordsSeen).toBe(2);
    expect(run.recordsChanged).toBe(2);
    expect(run.eventsEmitted).toBe(2);

    await t.run(async (ctx) => {
      const drugs = await ctx.db.query("drugs").take(10);
      const presentations = await ctx.db.query("presentations").take(10);
      // Both NDCs are the same active ingredient, so they share one drug.
      expect(drugs).toHaveLength(1);
      expect(presentations).toHaveLength(2);
    });
  });

  test("THE LOAD-BEARING TEST: an identical sweep emits zero events", async () => {
    // If this regresses, every FDA reverification becomes a false alert and the
    // live ticker turns into noise. Verified against production too: the second
    // full sweep of all 1,596 records emitted 0 events and changed 0 records.
    const t = convexTest(schema, modules);
    await sweep(t, [ADDERALL_AVAILABLE, ADDERALL_UNAVAILABLE], 1_000);

    const second = await sweep(t, [ADDERALL_AVAILABLE, ADDERALL_UNAVAILABLE], 2_000);
    expect(second.recordsChanged).toBe(0);
    expect(second.eventsEmitted).toBe(0);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("presentations").take(10)).toHaveLength(2);
      expect(await ctx.db.query("drugs").take(10)).toHaveLength(1);
    });
  });

  test("any FDA touch with no material change logs history and is never bad news", async () => {
    const t = convexTest(schema, modules);
    await sweep(t, [ADDERALL_AVAILABLE], 1_000);

    // "Revised" rather than "Reverified": the FDA changed a field we do not
    // display, which must still be recorded rather than dropped silently.
    const second = await sweep(
      t,
      [{ ...ADDERALL_AVAILABLE, update_date: "09/11/2026", update_type: "Revised" }],
      2_000,
    );
    // Recorded as evidence the FDA re-checked, but not a material change.
    expect(second.recordsChanged).toBe(0);
    expect(second.eventsEmitted).toBe(1);

    await t.run(async (ctx) => {
      const events = await ctx.db.query("statusEvents").take(10);
      const reverified = events.filter((e) => e.kind === "reverified_unchanged");
      expect(reverified).toHaveLength(1);
      expect(reverified[0].severity).toBe("neutral");
    });
  });

  test("becoming available is good news; losing it is bad news", async () => {
    const t = convexTest(schema, modules);
    await sweep(t, [ADDERALL_UNAVAILABLE], 1_000);

    await sweep(t, [{ ...ADDERALL_UNAVAILABLE, availability: "Available" }], 2_000);
    await t.run(async (ctx) => {
      const events = await ctx.db.query("statusEvents").take(20);
      const flip = events.find((e) => e.kind === "availability_changed")!;
      expect(flip.severity).toBe("good");
      expect(flip.previousValue).toBe("unavailable");
      expect(flip.nextValue).toBe("available");
    });

    await sweep(t, [{ ...ADDERALL_UNAVAILABLE, availability: "Unavailable" }], 3_000);
    await t.run(async (ctx) => {
      const events = await ctx.db.query("statusEvents").take(20);
      const flips = events.filter((e) => e.kind === "availability_changed");
      expect(flips).toHaveLength(2);
      expect(flips[1].severity).toBe("bad");
    });
  });

  test("a lost recovery estimate is reported as bad news", async () => {
    const t = convexTest(schema, modules);
    await sweep(t, [ADDERALL_UNAVAILABLE], 1_000);
    await sweep(t, [{ ...ADDERALL_UNAVAILABLE, related_info: undefined }], 2_000);

    await t.run(async (ctx) => {
      const events = await ctx.db.query("statusEvents").take(20);
      const lost = events.find((e) => e.kind === "recovery_date_changed")!;
      expect(lost.severity).toBe("bad");
      expect(lost.previousValue).toBe("October 2026");
      expect(lost.nextValue).toBeUndefined();
    });
  });
});

describe("recomputeCounters", () => {
  test("flags the split case that makes asking by NDC worth it", async () => {
    const t = convexTest(schema, modules);
    const run = await sweep(t, [ADDERALL_AVAILABLE, ADDERALL_UNAVAILABLE]);
    await t.mutation(internal.ingest.fda.recomputeCounters, { runId: run._id });

    await t.run(async (ctx) => {
      const drug = (await ctx.db.query("drugs").take(1))[0];
      expect(drug.availableCount).toBe(1);
      expect(drug.unavailableCount).toBe(1);
      expect(drug.presentationCount).toBe(2);
      // One package gettable, one not, both in shortage — ask by NDC.
      expect(drug.isSplit).toBe(true);
      expect(drug.hasAvailableInShortage).toBe(true);
      expect(drug.hasCurrentShortage).toBe(true);
    });
  });

  test("a drug with no available package is not split", async () => {
    const t = convexTest(schema, modules);
    const run = await sweep(t, [ADDERALL_UNAVAILABLE]);
    await t.mutation(internal.ingest.fda.recomputeCounters, { runId: run._id });

    await t.run(async (ctx) => {
      const drug = (await ctx.db.query("drugs").take(1))[0];
      expect(drug.isSplit).toBe(false);
      expect(drug.hasAvailableInShortage).toBe(false);
    });
  });
});

describe("retireUnseen", () => {
  test("retires a package the FDA stopped publishing, keeping its history", async () => {
    const t = convexTest(schema, modules);
    await sweep(t, [ADDERALL_AVAILABLE, ADDERALL_UNAVAILABLE], 1_000);

    // A later sweep that no longer carries the Aurobindo row.
    const run = await sweep(t, [ADDERALL_AVAILABLE], 2_000);
    await t.mutation(internal.ingest.fda.retireUnseen, {
      runId: run._id,
      runStartedAt: 2_000,
    });

    await t.run(async (ctx) => {
      const presentations = await ctx.db.query("presentations").take(10);
      // Retired, not deleted: disappearing from the list is itself information
      // and deleting would orphan the row's history.
      expect(presentations).toHaveLength(2);
      const retired = presentations.filter((p) => p.isRetired);
      expect(retired).toHaveLength(1);
      expect(retired[0].packageNdc).toBe("13107-068-01");

      const events = await ctx.db.query("statusEvents").take(20);
      expect(events.some((e) => e.kind === "presentation_retired")).toBe(true);
    });
  });
});
