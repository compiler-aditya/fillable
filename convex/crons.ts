import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Ingestion schedule.
 *
 * Both jobs hit the free openFDA API, so cadence is bounded by politeness and
 * by how often the FDA actually moves, not by cost. The Firecrawl-backed tiers
 * (the FDA website changefeed and ASHP) are added separately and carry a
 * credit budget guard.
 */
const crons = cronJobs();

/**
 * T0 — the delta feed: the 150 most recently updated records.
 *
 * Fifteen minutes is the shortest interval that is still honest. The openFDA
 * snapshot itself only rebuilds daily, so this mostly catches the moment a
 * rebuild lands rather than genuinely continuous change. Most of what returns
 * is `update_type: "Reverified"` with nothing material moved; the material hash
 * is what keeps those out of the ticker.
 */
crons.interval(
  "openfda delta",
  { minutes: 15 },
  internal.ingest.fda.pollDelta,
  { triggeredBy: "cron" },
);

/**
 * T1 — the full sweep. Four times a day.
 *
 * Only this path may retire a presentation, because only a complete sweep can
 * distinguish "the FDA removed this package" from "the delta feed didn't
 * mention it". It also rebuilds every drug counter, so any drift from a batch
 * that failed midway is corrected within six hours.
 */
crons.cron(
  "openfda full reconcile",
  "7 */6 * * *",
  internal.ingest.fda.fullReconcile,
  { triggeredBy: "cron" },
);

export default crons;
