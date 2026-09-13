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

/**
 * T3 — ASHP changefeed, sorted by revision date.
 *
 * One Firecrawl credit every six hours. ASHP has no API and returns 403 to a
 * plain fetch, so this is the only way to see its most recently revised
 * bulletins, and where it disagrees with the FDA is the most useful thing this
 * app can surface.
 */
crons.interval(
  "ashp changefeed",
  { hours: 6 },
  internal.ingest.ashp.sweep,
  { maxPages: 1, sortByRevision: true, triggeredBy: "cron" },
);

/**
 * T4 — full ASHP corpus, once a day.
 *
 * Two credits for all 186 bulletins, because the page-size control is driven
 * rather than the URL guessed. Daily is enough: ASHP bulletins are revised on
 * a human editorial cadence, not continuously.
 */
crons.cron(
  "ashp full sweep",
  "23 4 * * *",
  internal.ingest.ashp.sweep,
  { maxPages: 3, triggeredBy: "cron" },
);

export default crons;
