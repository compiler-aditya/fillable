/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { normalizeRecord, type RawFdaRecord } from "./lib/fdaRecord";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Branded, available, still formally in shortage — the interesting case. */
const AVAILABLE: RawFdaRecord = {
  package_ndc: "47781-174-01",
  generic_name: "Amphetamine Aspartate Monohydrate Tablet",
  company_name: "Alvogen",
  presentation: "Amphetamine Aspartate Monohydrate, Tablet, 5mg (NDC 47781-174-01)",
  availability: "Available",
  status: "Current",
  update_date: "06/29/2026",
  dosage_form: "Tablet",
  therapeutic_category: ["Psychiatry"],
  openfda: { brand_name: ["ADDERALL"] },
};

const UNAVAILABLE: RawFdaRecord = {
  package_ndc: "13107-069-01",
  generic_name: "Amphetamine Aspartate Monohydrate Tablet",
  company_name: "Aurobindo Pharma USA",
  presentation: "Amphetamine Aspartate Monohydrate, Tablet, 1.875mg (NDC 13107-069-01)",
  availability: "Unavailable",
  status: "Current",
  update_date: "06/29/2026",
  shortage_reason: "Shortage of an active ingredient",
  related_info: "Estimated availability: October 2026",
  dosage_form: "Tablet",
  therapeutic_category: ["Psychiatry"],
};

/** An unrelated drug with only one state, so it must never be "split". */
const SOLO: RawFdaRecord = {
  package_ndc: "43547-411-09",
  generic_name: "Quinapril Hydrochloride Tablet",
  company_name: "Solco Healthcare US, LLC",
  presentation: "Quinapril Hydrochloride, Tablet, 40mg (NDC 43547-411-09)",
  availability: "Unavailable",
  status: "Current",
  update_date: "06/29/2026",
  dosage_form: "Tablet",
};

async function seed(t: ReturnType<typeof convexTest>, raws: RawFdaRecord[]) {
  const runId = await t.mutation(internal.ingest.fda.startRun, {
    source: "openfda_full",
    triggeredBy: "manual",
    startedAt: 1_000,
  });
  await t.mutation(internal.ingest.fda.applyBatch, {
    runId,
    records: raws.map((r) => normalizeRecord(r)!),
    now: 1_000,
  });
  await t.mutation(internal.ingest.fda.recomputeCounters, { runId });
  await t.mutation(internal.ingest.fda.rebuildStats, { runId });
  return runId;
}

describe("drugs.detail", () => {
  test("names the exact package to ask a pharmacy for", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE, UNAVAILABLE]);

    const detail = await t.query(api.drugs.detail, {
      slug: "amphetamine-aspartate-monohydrate-tablet",
    });

    expect(detail).not.toBeNull();
    expect(detail!.available).toHaveLength(1);
    expect(detail!.unavailable).toHaveLength(1);
    expect(detail!.askFor).not.toBeNull();
    expect(detail!.askFor!.packageNdc).toBe("47781-174-01");
    expect(detail!.askFor!.companyName).toBe("Alvogen");
    // The point: gettable even though the drug is formally in shortage.
    expect(detail!.askFor!.status).toBe("current");
    expect(detail!.truncated).toBe(false);
  });

  test("carries the reason and recovery date for what you cannot get", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE, UNAVAILABLE]);
    const detail = await t.query(api.drugs.detail, {
      slug: "amphetamine-aspartate-monohydrate-tablet",
    });
    const blocked = detail!.unavailable[0];
    expect(blocked.shortageReason).toBe("Shortage of an active ingredient");
    expect(blocked.recoveryDateText).toBe("October 2026");
  });

  test("askFor is null when nothing is gettable, rather than guessing", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [UNAVAILABLE]);
    const detail = await t.query(api.drugs.detail, {
      slug: "amphetamine-aspartate-monohydrate-tablet",
    });
    expect(detail!.askFor).toBeNull();
  });

  test("returns null for an unknown slug", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE]);
    expect(await t.query(api.drugs.detail, { slug: "nope" })).toBeNull();
  });
});

describe("drugs.board", () => {
  test("lists only drugs where asking by NDC changes the answer", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE, UNAVAILABLE, SOLO]);

    const board = await t.query(api.drugs.board, {});
    expect(board).toHaveLength(1);
    expect(board[0].slug).toBe("amphetamine-aspartate-monohydrate-tablet");
    // Quinapril has no available package, so it is not actionable this way.
    expect(board.some((d) => d.slug.startsWith("quinapril"))).toBe(false);
  });
});

describe("drugs.search", () => {
  test("finds a drug by the brand a patient would actually type", async () => {
    // Nobody searches "Amphetamine Aspartate Monohydrate".
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE, UNAVAILABLE]);

    const hits = await t.query(api.drugs.search, { q: "Adderall" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].brandNames).toContain("ADDERALL");
  });

  test("finds it by generic name too", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE]);
    const hits = await t.query(api.drugs.search, { q: "amphetamine" });
    expect(hits.length).toBeGreaterThan(0);
  });

  test("ignores a query too short to mean anything", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE]);
    expect(await t.query(api.drugs.search, { q: "a" })).toEqual([]);
    expect(await t.query(api.drugs.search, { q: "  " })).toEqual([]);
  });
});

describe("events.recent", () => {
  test("keeps reverifications out of the ticker by default", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE]);

    // A later sweep where only the FDA's check date moved.
    const runId = await t.mutation(internal.ingest.fda.startRun, {
      source: "openfda_delta",
      triggeredBy: "cron",
      startedAt: 2_000,
    });
    await t.mutation(internal.ingest.fda.applyBatch, {
      runId,
      records: [
        normalizeRecord({
          ...AVAILABLE,
          update_date: "09/11/2026",
          update_type: "Reverified",
        })!,
      ],
      now: 2_000,
    });

    const ticker = await t.query(api.events.recent, {});
    expect(ticker.every((e) => e.kind !== "reverified_unchanged")).toBe(true);

    // Still available on the drug's own history, where it is useful evidence.
    const all = await t.query(api.events.recent, { includeReverifications: true });
    expect(all.some((e) => e.kind === "reverified_unchanged")).toBe(true);
  });
});

describe("stats.global", () => {
  test("reports the thesis numbers", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [AVAILABLE, UNAVAILABLE, SOLO]);

    const stats = await t.query(api.stats.global, {});
    expect(stats).not.toBeNull();
    expect(stats!.totalPresentations).toBe(3);
    expect(stats!.drugCount).toBe(2);
    expect(stats!.splitDrugCount).toBe(1);
    // One available package sitting inside a drug that is in shortage.
    expect(stats!.availableInShortageCount).toBe(1);
  });

  test("returns null before the first sync rather than throwing", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.stats.global, {})).toBeNull();
  });
});
