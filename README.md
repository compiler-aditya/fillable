# Fillable

**Your medication is "in shortage." Some versions of it are in stock.**

Shortages are reported per *package*, not per drug. The FDA publishes exactly
which manufacturer's version is available, down to the NDC number — but almost
nobody reads it at that depth, so people call a dozen pharmacies asking the
wrong question.

Built for the [Convex All Gas Hackathon](https://www.convex.dev/hackathons/all-gas).

---

## The number this is built on

Pulled live from `api.fda.gov/drug/shortages.json` and reproducible with
`node --experimental-strip-types scripts/probe-fda.ts`:

| | |
|---|---|
| NDC-level records published by the FDA | **1,602** |
| Records marked `Current` shortage | **1,152** |
| **NDC packages marked `Available` inside those shortages** | **748** |
| **Drugs with both an available and an unavailable package right now** | **55** |

Generic Adderall is one of the 55: **44 packages available, 20 unavailable,
9 limited.** Asking a pharmacy "do you have Adderall?" gets you "no". Asking for
**NDC 47781-174-01** gets you the medication.

The FDA says so itself, on its own shortage page:

> A drug receives Resolved status when … the market is covered … **However, some
> manufacturers may not have all presentations available.**

## Why people can't just look this up

From a peer-reviewed study of patient reports
([PMC12277151](https://pmc.ncbi.nlm.nih.gov/articles/PMC12277151/)):

> "I called 13 different pharmacies today to find one that had it."

> "so many pharmacists tell me they cannot disclose what they have in stock"

Active US drug shortages stood at **227 in Q2 2026**, rising for the third
straight quarter (ASHP / University of Utah Drug Information Service).

---

## What it does

- **Search by the name you actually use.** "Adderall" resolves to Amphetamine
  Aspartate Monohydrate; "Vyvanse" to Lisdexamfetamine. 111 drugs on the
  shortage list carry a brand distinct from their generic name.
- **Names one package to ask for.** Large, copyable NDC, with the manufacturer
  and strength, and a plain sentence explaining why the NDC gets a different
  answer than the drug name.
- **Makes combination strengths readable.** Generic Adderall 5 mg is published
  as `1.25 mg; 1.25 mg; 1.25 mg; 1.25 mg` — four salts. Fillable shows
  `5mg total (4 × 1.25mg)` so it matches the prescription in your hand.
- **Says so plainly when nothing is available**, instead of implying a
  workaround exists.
- **Shows its own machinery.** `/pipeline` lists every sync as it runs; counters
  move live, without reloading.

## Not medical advice

Fillable reports drug supply information published by the FDA. Availability here
is **what manufacturers reported to the FDA, not a live view of any pharmacy's
stock**. Confirm with your pharmacist, and never change how you take a
medication without speaking to your prescriber.

---

## Stack

| | |
|---|---|
| **Convex** | Database, schema, indexes, full-text search, queries, internal mutations and actions, scheduled functions, crons, components, auth |
| **Components** | `@convex-dev/static-hosting`, `@convex-dev/rate-limiter`, `@convex-dev/presence`, `@convex-dev/workpool` |
| **Frontend** | Vite + React 19 + Tailwind v4, deployed to `convex.site` |
| **Data** | openFDA drug shortages API (breadth) |

### Sponsor integrations — current state

This section is kept honest rather than aspirational.

| | Status |
|---|---|
| **Firecrawl** | **Not yet wired.** Verified as the only way to reach ASHP: `curl` returns **403** (even with a browser UA), Firecrawl returns **200** with all 186 bulletins. Also reaches the FDA's HTML changefeed, which runs 1–3 days ahead of the JSON API. Next to land. |
| **OpenAI** | **Not yet wired.** Provider-agnostic client exists at `convex/lib/model.ts`; the in-stock same-class alternatives feature is what will use it. |
| **AgentMail** | **Not yet wired.** Planned as a presence-gated alert plus a `filled` / `couldn't fill` reply loop. |

---

## Design decisions worth knowing

**Change detection excludes `update_date`.** The FDA publishes three update
types — `Reverified` (853), `New` (458), `Revised` (291). Most sweeps are
reverifications where nothing moved. Diffing on the date would fire a false
alert on every one and turn the live feed into noise, so changes are detected
via a hash of *material* fields only. Verified in production: a second identical
full sweep read all 1,596 records and emitted **0** events.

**Record keys collide in two real ways.** NDC + company still collided 27 times
across the live dataset — one NDC published as two different doses
(Lisdexamfetamine 20 mg and 30 mg share `57664-048-88`), and one NDC listed as
both `Current` and `To Be Discontinued`. Keys include status and a hash of the
presentation; six genuinely duplicate postings resolve by latest `update_date`.

**Packages are retired, never deleted.** A package disappearing from the FDA
list is itself information, and deleting would orphan its history.

**The FDA has a live typo.** `"Unvailable"` appears in production data and is
mapped explicitly rather than bucketed as unknown, because it is a real
unavailable package.

**Counters are recomputed, not delta-adjusted.** Delta arithmetic drifts
permanently the first time a batch fails midway; a bounded recompute is
self-healing.

---

## Running it

```bash
npm install
npx convex dev          # provisions a deployment and pushes the schema
npm run dev             # http://localhost:5173
```

Load the data:

```bash
npx convex run ingest/fda:fullReconcile '{"triggeredBy":"manual"}'
```

Verify the normalizer against every live FDA record:

```bash
node --experimental-strip-types scripts/probe-fda.ts
```

Tests, types, lint:

```bash
npm test && npx tsc -b && npx oxlint
```

### Environment

Set on the Convex deployment with `npx convex env set`, never in the repo:

| Variable | Needed for |
|---|---|
| `FDA_API_KEY` | openFDA rate limits — Convex actions egress from shared IPs, so the unkeyed per-IP limit is shared with strangers. [Free](https://open.fda.gov/apis/authentication/). |
| `FIRECRAWL_API_KEY` | ASHP and the FDA HTML changefeed |
| `OPENAI_API_KEY` | Drug-name normalization and in-stock alternatives |
| `AGENTMAIL_API_KEY`, `AGENTMAIL_WEBHOOK_SECRET` | Alerts and reply-to-report |
| `FIRECRAWL_DAILY_CAP` | Hard budget guard, checked before every scrape |

---

## Data provenance

All availability data originates from the
[openFDA drug shortages API](https://open.fda.gov/apis/drug/shortages/), which
publishes what manufacturers report to the FDA. openFDA's own disclaimer applies:
results are unvalidated and must not be relied on for medical decisions.

Build log: [`hackathon.md`](./hackathon.md).

## Licence

MIT — see [LICENSE](./LICENSE).
