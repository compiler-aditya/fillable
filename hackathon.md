# Hackathon log

- **Project:** Fillable
- **What it does:** Reads the FDA drug-shortage record at NDC level so a patient can see which exact manufacturer's version of their medication is available today.
- **Live app:** https://vivid-parakeet-666.convex.site
- **Repo:** https://github.com/compiler-aditya/fillable
- **Frontend:** Convex static hosting
- **Convex deployment:** https://vivid-parakeet-666.convex.cloud
- **Components:** @convex-dev/static-hosting, @convex-dev/rate-limiter, @convex-dev/presence, @convex-dev/workpool
- **Convex features:** schema, tables, indexes, full-text search, queries, internal mutations, internal actions, HTTP actions, scheduled functions, crons, components
- **Auth:** Convex Auth
- **AI models:** `gemini-3.5-flash`, called through Gemini's OpenAI-compatible endpoint. The client at `convex/lib/model.ts` resolves OpenAI, Gemini or the Convex AI Gateway from environment at call time, so the provider is one env var rather than a code change.
- **Started:** 2026-09-13T20:37:56Z
- **Last updated:** 2026-09-20T16:11:13Z

## Log

### 2026-09-13 - 5314c7a..4851fde

Set up the project and proved the data source before building on it.

The premise is that shortage information is published at the drug level but
lived at the NDC level. Checking `api.fda.gov/drug/shortages.json` against all
1,602 published records: 1,152 are marked `Current` shortage, yet **748
individual NDC packages inside those shortages are marked `Available`**, and 55
distinct drugs carry both an available and an unavailable presentation at the
same time. Generic Adderall is one of them — 44 available, 20 unavailable, 9
limited. A patient asking "do you have Adderall?" is asking the wrong question.

Registered the backend components in `convex/convex.config.ts` using app-owned
root routing (`defineApp()` with no `httpPrefix`) rather than the component's
documented default. Under component-owned routing the static site owns `/`, and
Convex Auth's `/.well-known/openid-configuration` carries no file extension, so
the SPA fallback would answer it with `index.html` and a 200 — auth fails while
every health check stays green. `convex/http.ts` will register the static
catch-all last so exact routes win.

Wrote the schema (`convex/schema.ts`): NDC-grain `presentations` keyed to
`drugs`, with `statusEvents` as a child table so change history never becomes an
unbounded array on a document, denormalized counters because Convex has no count
operator, and `fillReports` separated from `fillCounters` to keep high-churn
writes off the read path.

Built the ingestion normalizer test-first (`convex/lib/fdaRecord.ts`,
`convex/lib/fdaRecord.test.ts`, 39 tests). Three things the live data forced:

- **Change detection excludes `update_date`.** 853 of 1,602 records carry
  `update_type: "Reverified"`, which almost always means the FDA re-checked and
  nothing moved. Diffing on the date would emit a false event on every
  reverification. The material hash covers availability, status, reason, note,
  presentation and company only.
- **The recovery-date parser was inventing dates.** The first version matched
  "estimated release" inside "No estimated release date at this time" and
  returned "date at this time" as an availability estimate. The test caught it
  before it ran anywhere; negated phrasing now bails, and a colon-less match
  must be date-shaped to count.
- **Record keys collide in two real ways.** NDC + company still collided 27
  times across the live set: one NDC published as two different doses
  (Lisdexamfetamine 20 mg and 30 mg share 57664-048-88), and one NDC listed as
  both `Current` and `To Be Discontinued`. The key now includes status and a
  hash of the presentation, and six genuinely duplicate postings are resolved
  by keeping the later `update_date`.

Validated the whole normalizer against all 1,602 live records: zero rows
dropped, zero unmapped values, 1,596 distinct keys. The FDA's live typo
`"Unvailable"` is mapped explicitly rather than bucketed as unknown, and the 444
records with no availability value are all `To Be Discontinued` or `Resolved`,
where the FDA omits the field by design.

Provisioned a development deployment and pushed the schema. All four components
installed cleanly (`presence`, `rateLimiter`, `scrapePool`, `staticHosting`),
every declared index was created, and `npx convex data` confirms the twelve
application tables alongside Convex Auth's own. Codegen runs clean.

Built the ingestion pipeline and loaded the real data (`convex/lib/fdaApi.ts`,
`convex/ingest/fda.ts`, `convex/crons.ts`). A full sweep ingests **1,596
presentations across 241 drugs in about twelve seconds**, with zero records
dropped and zero unmapped values.

The action does the network I/O and then drives `applyBatch` mutations in slices
of forty, because 1,596 upserts in one mutation would exceed a single
transaction's limits. Drug counters are recomputed from their presentations
rather than delta-adjusted: delta arithmetic drifts permanently the first time a
batch fails midway, whereas a bounded recompute is self-healing. That recompute
walks drugs by slug cursor through `ctx.scheduler.runAfter`, so it stays within
transaction limits however far the FDA list grows.

Ran the sweep twice back to back. The second run saw all 1,596 records, changed
**0** and emitted **0** events — the material hash correctly absorbs the
reverification churn, so the live ticker will carry signal only. That behavior
is pinned by a `convex-test` suite (`convex/ingest.test.ts`) alongside the
availability-direction, lost-recovery-date and retirement cases. 47 tests green.

The database now reports what the premise predicted: of 1,596 NDC packages,
**748 are marked available while their drug is in shortage**, and **55 drugs
carry both an available and an unavailable package at once**. Those 55 are the
ones where asking a pharmacy for a specific NDC rather than a drug name changes
the answer, so `isSplit` is stored per drug and indexed.

Retirement marks a package rather than deleting it. A package disappearing from
the FDA list is itself information, and deleting would orphan its history and
any watch pointing at it. Only the full sweep may retire, because the delta feed
is a partial view where absence means nothing.

Scheduled the two free-tier jobs in `convex/crons.ts`: the delta feed every
fifteen minutes, and a full reconcile every six hours that is the only path
allowed to retire or to correct counter drift.

Built the public read model — the queries a UI subscribes to (`convex/drugs.ts`,
`convex/events.ts`, `convex/stats.ts`, `convex/pipeline.ts`). All read-only and
public on purpose: the whole point is that someone can open the site cold, with
no account, and get an answer.

`drugs.detail` is the one that answers the actual question, and it now does, on
real data. For the drug the FDA lists as in shortage, it returns: **ask for NDC
47781-174-01 from Alvogen — available** — while naming the package you cannot
get, why, and when it is expected back (Aurobindo, active-ingredient shortage,
October 2026). It is a single query rather than three so the page updates as one
consistent unit; a partial update where the counts and the rows disagree would
be worse than a slightly larger payload.

Added full-text search over generic name, brands and dosage form. This mattered
more than expected: openFDA populates `brand_name` on 90% of records, but for
generic manufacturers it just restates the generic name. Filtering those out
leaves **111 drugs with a genuinely distinct brand**, which are exactly the ones
people type. Searching "adderall" now returns Amphetamine Aspartate Monohydrate
and "vyvanse" returns Lisdexamfetamine — nobody types "Amphetamine Aspartate
Monohydrate". Brands arrive unevenly per NDC, so they are unioned across a
drug's packages during the counter recompute.

Two corrections from reading real output rather than assuming:

- The ticker said a package was "added to the FDA record as unknown". The FDA
  omits `availability` on discontinuations and resolutions — 444 of 1,596
  records — so those normalize to "unknown", which means nothing to a reader.
  Those rows now lead with their status instead: "to be discontinued".
- No-material-change events were only recorded for `update_type: "Reverified"`.
  The live data also carries "Revised" (291) and "New" (458), so a revision
  touching a field we do not display was being dropped silently. Any FDA touch
  with an unchanged material hash is now recorded as history and still never
  alerts.

The ticker excludes those no-change events by default, since 853 of 1,596
records are reverifications and including them would bury the handful of
changes that matter. They stay visible on a drug's own history, where "the FDA
re-checked this and it did not move" is genuinely useful.

58 tests green, `tsc` and `oxlint` clean.

Built the frontend: a board, a drug page, and a live-data page (`src/routes/`,
`src/components/`, Vite + React + Tailwind). Verified in a real browser rather
than by trusting a build exit code.

The drug page leads with the answer and nothing else: **ask your pharmacy for
NDC 47781-174-01**, in large type with a copy button, the manufacturer and
strength underneath, and one sentence explaining why asking for an NDC gets a
different answer than asking for the drug by name. When no package is
available, it says so plainly instead of implying a workaround exists.

Confirmed the live subscription end to end. With a browser sitting on
`/live data` and no reload, running a delta sync made a new row appear on its
own and flipped "last sync" to "just now". That run read 60 records and changed
zero, which is the idempotency holding in production.

Two fixes that came from looking at the rendered page rather than the data:

- Combination products are published one strength per salt, so generic Adderall
  5 mg arrived as "1.25 mg; 1.25 mg; 1.25 mg; 1.25 mg". A patient holding a
  prescription for 5 mg would not recognise their own dose, which breaks the
  single action this product asks for. Equal components are now totalled —
  "5mg total (4 × 1.25mg)" — and the FDA's own data confirms the arithmetic,
  since another manufacturer publishes the identical product directly as
  "5mg". Different strengths or units are never totalled, and are left exactly
  as published.
- Availability is never signalled by colour alone; every state carries an icon
  and a word, and the distribution bar has a text alternative.

A persistent footer states that this reports supply information and is not
medical advice, that the data is what manufacturers told the FDA rather than
any pharmacy's live stock, and that the reader should confirm with their
pharmacist. The drug page repeats the point where a decision would be made.

Also added a backendless fixtures page (`preview.html`, `src/preview.tsx`) so
the awkward states — a package with no stated availability, a drug where
nothing is gettable — can be designed without waiting for the FDA to produce
that case.

69 tests green, `tsc` clean, `oxlint` clean, production build succeeds at
~43 kB gzipped for the entry bundle. Not yet deployed, so there is still no
public app URL, and no repository remote is configured.

### 2026-09-13 - 7a975f8..4aedf80

Published the repository and wired Firecrawl to do real work
(`convex/lib/firecrawl.ts`, `convex/lib/ashpParse.ts`, `convex/ingest/ashp.ts`,
`convex/sources.ts`).

ASHP is the second opinion this product needs, and Firecrawl is the only way to
reach it: a plain fetch returns 403 even with a browser User-Agent, Firecrawl
returns 200. All 186 bulletins now load, and the board shows where the two
official sources disagree — ASHP lists vancomycin, oxaliplatin, moxifloxacin,
docetaxel, diltiazem and decitabine as current shortages where the FDA record
does not.

The first sweep guessed `&pageNum=N` for pagination. ASHP silently ignores it
and returns page one every time, so nineteen scrapes cost nineteen credits and
produced ten bulletins. Driving the site's own page-size control instead reads
all 186 in two scrapes. Credits are reserved before each call and counted from
Firecrawl's own response rather than estimated.

Caught a wrong brand on a medication page. openFDA joins shortage rows to
product metadata by NDC and that join is sometimes wrong: 71288-205-03 is
published as "Furosemide Injection" with an openfda block describing
HYDRALAZINE HYDROCHLORIDE, and the board was rendering it. 42 of 1,448 rows
carrying brands have this defect. Brands are now accepted only when openFDA's
own `substance_name` corroborates the generic name.

That fix exposed a second one: derived fields were not refreshed on the
no-change path, so correcting the brand logic never reached stored rows. Only
the material hash decides what gets announced; derived fields now refresh
regardless. 89 tests green.

Not yet wired: OpenAI and AgentMail. 157 of 186 ASHP bulletins stay unmatched
because matching requires exact name agreement — ASHP writes "Amino Acid
Products" where the FDA writes "Amino Acid Injection" — and a wrong match would
be worse than none.

### 2026-09-13 - eb16dcb

Matched ASHP bulletins to FDA drugs with a model (`convex/ingest/ashpMatch.ts`,
`convex/lib/route.ts`). 157 bulletins resisted deterministic matching because
the two sources name drugs differently — ASHP writes "Oxycodone Hydrochloride
and Acetaminophen Tablets" where the FDA writes "Acetaminophen; Oxycodone
Hydrochloride Tablet". 40 now match, taking verified source disagreements from
11 to 18.

The model selects, it never names: it is handed a shortlist drawn from the
search index and returns a number, and the id is resolved locally. It cannot
invent a drug that is not in our data.

Three things came from checking the output rather than trusting it:

- Passing Convex ids through the model got **46 of 149 replies rejected** — it
  returned 32-character strings matching no shortlist entry. The guard caught
  all of them, but a rejected reply is a lost match. Numbering the items and
  choices instead took rejections to **0** and matches from 17 to 40.
- The model matched "Calcitriol Injection" to "Calcitriol Capsule" after being
  told verbatim not to. An injection and an oral capsule are separate products
  with separate supply chains, so route compatibility is now enforced in code.
  A prompt rule is a request; the guard is the enforcement.
- That guard then changed nothing, because the match came from the
  deterministic path rather than the model: `matchKey` strips dosage-form
  words, so both names collapse to "calcitriol". Both paths create matches, and
  a rule enforced on only one of them is not enforced at all.

**Running on Gemini, not OpenAI.** AgentRouter rejects every non-CLI client
(`unauthorized_client_error`, returned identically with and without a key), and
the Convex AI Gateway needs a paid plan. The client resolves the provider from
environment, so moving to OpenAI is one variable and no code change. 99 tests
green.

### 2026-09-20 - e4a80fe

Integrated the Fillable v2 editorial experience as the public home page while
keeping the full realtime shortage workspace at `/explore`
(`src/LandingPage.tsx`, `src/landing.css`, `src/main.tsx`). The preview reads
from the production Convex catalog and exposes exact manufacturer, package NDC,
availability, source date, and the original FDA record without collecting
prescription or account data.

Published the backend and frontend to Convex production at
`https://vivid-parakeet-666.convex.site`. Browser verification confirmed that
the landing page loads real examples and that `/explore` renders 55 split-supply
medications from the production deployment. The production build, lint, and all
99 tests pass.
